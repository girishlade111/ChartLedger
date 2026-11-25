export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const chunkSize = Math.max(200, Math.min(options.chunkSize ?? 800, 4000));
  const overlap = Math.max(0, Math.min(options.overlap ?? 120, Math.floor(chunkSize / 2)));

  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];
  if (normalized.length <= chunkSize) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    if (end < normalized.length) {
      const lastParagraph = normalized.lastIndexOf('\n\n', end);
      const lastSentence = normalized.lastIndexOf('. ', end);
      const lastSpace = normalized.lastIndexOf(' ', end);
      if (lastParagraph > start + chunkSize * 0.5) {
        end = lastParagraph;
      } else if (lastSentence > start + chunkSize * 0.5) {
        end = lastSentence + 1;
      } else if (lastSpace > start + chunkSize * 0.5) {
        end = lastSpace;
      }
    }

    const slice = normalized.slice(start, end).trim();
    if (slice) chunks.push(slice);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export function lexicalOverlapScore(query: string, text: string): number {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'what', 'how', 'why']);
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !stopWords.has(t));
  if (!tokens.length) return 0;

  const lower = text.toLowerCase();
  let matched = 0;
  for (const token of new Set(tokens)) {
    if (lower.includes(token)) matched += 1;
  }
  return matched / new Set(tokens).size;
}

export interface SearchableChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export interface RankedChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  score: number;
}

export function rankChunksHybrid(
  query: string,
  queryEmbedding: number[] | null,
  chunks: SearchableChunk[],
  topK = 4
): RankedChunk[] {
  const scored = chunks.map((chunk) => {
    const lexical = lexicalOverlapScore(query, chunk.content);
    const semantic =
      queryEmbedding && queryEmbedding.length > 0 && chunk.embedding.length === queryEmbedding.length
        ? Math.max(0, cosineSimilarity(queryEmbedding, chunk.embedding))
        : 0;

    const score =
      queryEmbedding && queryEmbedding.length > 0 && chunk.embedding.length === queryEmbedding.length
        ? semantic * 0.72 + lexical * 0.28
        : lexical;

    return {
      id: chunk.id,
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      score: Math.round(score * 1000) / 1000,
    };
  });

  return scored
    .filter((item) => item.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
