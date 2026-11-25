export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  role: string;
  planId: string;
  emailVerified?: boolean;
  onboardingCompleted: boolean;
  preferencesJson: Record<string, unknown>;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
}

let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (inMemoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `Request failed (${res.status})`) as ApiError;
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }

  return data as T;
}

export interface StreamCallbacks {
  onMeta?: (meta: any) => void;
  onDelta: (text: string) => void;
  onDone?: (payload: any) => void;
  onError?: (message: string) => void;
}

export async function streamPostSse(
  url: string,
  body: Record<string, unknown>,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (inMemoryToken) {
    headers.Authorization = `Bearer ${inMemoryToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let errText = `Stream failed (${res.status})`;
    try {
      const parsed = await res.json();
      if (parsed?.error) errText = parsed.error;
    } catch {
      // ignore
    }
    throw new Error(errText);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Readable stream unavailable.');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.split('\n');
      let eventName = 'message';
      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      try {
        const parsed = JSON.parse(dataLine);
        if (eventName === 'meta') callbacks.onMeta?.(parsed);
        else if (eventName === 'delta') callbacks.onDelta(parsed.text || '');
        else if (eventName === 'done') callbacks.onDone?.(parsed);
        else if (eventName === 'error') callbacks.onError?.(parsed.error || 'Stream error');
      } catch {
        // ignore malformed partial frame
      }
    }
  }
}
