import path from 'node:path';

export interface ImageValidationResult {
  valid: boolean;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  width?: number;
  height?: number;
  error?: string;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_DIMENSION = 8192;
const MIN_DIMENSION = 120;

export function detectImageSignature(
  buf: Uint8Array
): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: RIFF .... WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

function readUInt32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] << 24) >>> 0) +
    (buf[offset + 1] << 16) +
    (buf[offset + 2] << 8) +
    buf[offset + 3]
  );
}

function readUInt16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) + buf[offset + 1];
}

function readUInt16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] + (buf[offset + 1] << 8);
}

export function extractImageDimensions(
  buf: Uint8Array,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
): { width: number; height: number } | null {
  if (mimeType === 'image/png') {
    if (buf.length < 24) return null;
    return {
      width: readUInt32BE(buf, 16),
      height: readUInt32BE(buf, 20),
    };
  }

  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > buf.length) break;
      const len = readUInt16BE(buf, offset);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (offset + 7 > buf.length) return null;
        return {
          height: readUInt16BE(buf, offset + 3),
          width: readUInt16BE(buf, offset + 5),
        };
      }
      if (len < 2) break;
      offset += len;
    }
    return null;
  }

  if (mimeType === 'image/webp' && buf.length >= 30) {
    const chunkType = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    if (chunkType === 'VP8 ' && buf.length >= 30) {
      return {
        width: readUInt16LE(buf, 26) & 0x3fff,
        height: readUInt16LE(buf, 28) & 0x3fff,
      };
    }
    if (chunkType === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    if (chunkType === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width, height };
    }
  }

  return null;
}

export function validateChartImageBuffer(
  buf: Uint8Array,
  declaredMime?: string
): ImageValidationResult {
  if (!buf || buf.length === 0) {
    return { valid: false, error: 'Uploaded file is empty.' };
  }
  if (buf.length > MAX_FILE_BYTES) {
    return { valid: false, error: 'File exceeds the 8 MB upload limit.' };
  }

  const detected = detectImageSignature(buf);
  if (!detected) {
    return {
      valid: false,
      error: 'Unsupported or invalid image signature. Only PNG, JPEG, and WebP files are accepted.',
    };
  }

  if (declaredMime && declaredMime !== detected && !(declaredMime === 'image/jpg' && detected === 'image/jpeg')) {
    return {
      valid: false,
      error: `MIME type mismatch: declared ${declaredMime} does not match file signature ${detected}.`,
    };
  }

  const dims = extractImageDimensions(buf, detected);
  if (!dims) {
    return { valid: false, error: 'Unable to parse image dimensions safely; image may be corrupted.' };
  }
  if (dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
    return {
      valid: false,
      error: `Image dimensions (${dims.width}x${dims.height}) exceed the ${MAX_DIMENSION}px safety limit.`,
    };
  }
  if (dims.width < MIN_DIMENSION || dims.height < MIN_DIMENSION) {
    return {
      valid: false,
      error: `Image dimensions (${dims.width}x${dims.height}) are too small for chart analysis (minimum ${MIN_DIMENSION}px).`,
    };
  }

  return {
    valid: true,
    mimeType: detected,
    width: dims.width,
    height: dims.height,
  };
}

export function isPrivateOrBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal' ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    return true;
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // Link-local / Cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  }

  return false;
}

export function validateExternalUrl(rawUrl: string): { valid: boolean; normalized?: string; error?: string } {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'Only http and https URLs are allowed.' };
    }
    if (parsed.username || parsed.password) {
      return { valid: false, error: 'URLs with embedded credentials are rejected.' };
    }
    if (isPrivateOrBlockedHost(parsed.hostname)) {
      return { valid: false, error: 'Access to private, loopback, or metadata network addresses is blocked.' };
    }
    return { valid: true, normalized: parsed.toString() };
  } catch {
    return { valid: false, error: 'Malformed URL.' };
  }
}

export function resolveConfinedPath(baseDir: string, unsafeFilename: string): string {
  const safeBase = path.resolve(baseDir);
  const resolved = path.resolve(safeBase, unsafeFilename);
  if (!resolved.startsWith(safeBase + path.sep)) {
    throw new Error('Path traversal attempt blocked.');
  }
  return resolved;
}

export function wrapUntrustedContent(label: string, content: string): string {
  const cleaned = content.replace(/<\/?untrusted_[^>]*>/gi, '').slice(0, 12000);
  return `<untrusted_${label}>\n${cleaned}\n</untrusted_${label}>`;
}
