import React, { useEffect, useState } from 'react';
import { BookOpen, Plus, Search, Star, Trash2, Upload } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface CollectionRow {
  id: string;
  name: string;
  description: string;
}

interface DocRow {
  id: string;
  collectionId: string;
  title: string;
  sourceType: string;
  charCount: number;
  chunkCount: number;
  status: string;
  embeddingModel: string;
  createdAt: string;
}

export function KnowledgeBaseView() {
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [newColName, setNewColName] = useState('');
  const [selectedColId, setSelectedColId] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [ingesting, setIngesting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ documentTitle: string; chunkIndex: number; content: string; score: number }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = async () => {
    const [cRes, dRes] = await Promise.all([
      apiFetch<{ collections: CollectionRow[] }>('/api/knowledge/collections'),
      apiFetch<{ documents: DocRow[] }>('/api/knowledge/documents'),
    ]);
    setCollections(cRes.collections);
    setDocuments(dRes.documents);
    if (!selectedColId && cRes.collections[0]) {
      setSelectedColId(cRes.collections[0].id);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    setError(null);
    try {
      const res = await apiFetch<{ collection: CollectionRow }>('/api/knowledge/collections', {
        method: 'POST',
        body: JSON.stringify({ name: newColName.trim() }),
      });
      setCollections((prev) => [res.collection, ...prev]);
      setSelectedColId(res.collection.id);
      setNewColName('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleIngestText = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    setIngesting(true);
    try {
      const res = await apiFetch<{ document: DocRow }>('/api/knowledge/documents', {
        method: 'POST',
        body: JSON.stringify({
          title: docTitle,
          content: docContent,
          collectionId: selectedColId || undefined,
          sourceType: 'markdown',
        }),
      });
      setDocuments((prev) => [res.document, ...prev]);
      setDocTitle('');
      setDocContent('');
      setStatusMsg(`Indexed "${res.document.title}" into ${res.document.chunkCount} semantic chunks.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIngesting(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setError(null);
    setStatusMsg(null);
    setIngesting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (selectedColId) form.append('collectionId', selectedColId);
      const res = await apiFetch<{ document: DocRow }>('/api/knowledge/documents', {
        method: 'POST',
        body: form,
      });
      setDocuments((prev) => [res.document, ...prev]);
      setStatusMsg(`Uploaded & indexed "${res.document.title}" (${res.document.chunkCount} chunks).`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIngesting(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    await apiFetch(`/api/knowledge/documents/${id}`, { method: 'DELETE' });
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await apiFetch<{ results: any[] }>('/api/knowledge/search', {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery.trim(), topK: 5 }),
      });
      setSearchResults(res.results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Ingest Document Form */}
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114] lg:col-span-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold">Add Private Research Document</h2>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Upload .md/.txt/.csv
              <input
                type="file"
                accept=".txt,.md,.markdown,.csv,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFileUpload(f);
                }}
              />
            </label>
          </div>

          <form onSubmit={handleIngestText} className="space-y-3">
            <div>
              <label htmlFor="kb-col" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Collection
              </label>
              <select
                id="kb-col"
                value={selectedColId}
                onChange={(e) => setSelectedColId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="kb-title" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Document Title
              </label>
              <input
                id="kb-title"
                required
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g., 4H Breakout Confirmation Checklist"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
              />
            </div>
            <div>
              <label htmlFor="kb-content" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Trading Notes / Strategy Rules (min 20 characters)
              </label>
              <textarea
                id="kb-content"
                required
                minLength={20}
                rows={5}
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                placeholder="Paste your trading playbook, indicator rules, or risk checklist..."
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
              />
            </div>

            {error && <p role="alert" className="text-xs font-medium text-red-500">{error}</p>}
            {statusMsg && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{statusMsg}</p>}

            <button
              type="submit"
              disabled={ingesting}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {ingesting ? 'Chunking & Generating Embeddings...' : 'Index Document for RAG'}
            </button>
          </form>

          <form
            onSubmit={handleCreateCollection}
            className="flex items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800"
          >
            <input
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="New collection name..."
              aria-label="New collection name"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Collection
            </button>
          </form>
        </div>

        {/* Semantic RAG Retrieval Tester */}
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114] lg:col-span-6">
          <h2 className="font-display text-base font-semibold">Test Isolated RAG Retrieval</h2>
          <p className="text-xs text-zinc-500">
            Queries search only your own indexed chunks using Gemini Embedding 2 cosine similarity +
            lexical reranking.
          </p>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g., invalidation rules for false breakouts"
              aria-label="Search knowledge base"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            />
            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950"
            >
              <Search className="h-3.5 w-3.5" />
              Search
            </button>
          </form>

          <div className="space-y-2.5">
            {searchResults.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-500">
                Index a document and enter a query to preview grounded RAG excerpts.
              </p>
            ) : (
              searchResults.map((hit, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-[#09090B]"
                >
                  <div className="flex items-center justify-between font-mono text-[11px] text-zinc-500">
                    <span>
                      {hit.documentTitle} · Chunk #{hit.chunkIndex + 1}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Score {hit.score}
                    </span>
                  </div>
                  <p className="mt-1.5 leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {hit.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Indexed Documents Table */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
        <h3 className="mb-3 font-display text-base font-semibold">
          Indexed Knowledge Documents ({documents.length})
        </h3>
        {documents.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">
            <BookOpen className="mx-auto mb-2 h-6 w-6 text-zinc-400" />
            No private documents uploaded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-3 font-medium">Title</th>
                  <th className="py-2 pr-3 font-medium">Format</th>
                  <th className="py-2 pr-3 text-right font-medium">Chunks</th>
                  <th className="py-2 pr-3 font-medium">Embedding</th>
                  <th className="py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {doc.title}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-zinc-500">{doc.sourceType}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                      {doc.chunkCount}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-zinc-500">{doc.embeddingModel}</td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        aria-label={`Delete ${doc.title}`}
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="text-zinc-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface SavedPromptsViewProps {
  prompts: Array<{
    id: string;
    title: string;
    category: string;
    content: string;
    isFavorite: boolean;
  }>;
  onRefresh: () => Promise<void>;
  onUseInChat: (promptText: string) => void;
}

export function SavedPromptsView({ prompts, onRefresh, onUseInChat }: SavedPromptsViewProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Market Structure');
  const [content, setContent] = useState('');
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/prompts', {
        method: 'POST',
        body: JSON.stringify({ title, category, content }),
      });
      setTitle('');
      setContent('');
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFav = async (p: { id: string; isFavorite: boolean }) => {
    await apiFetch(`/api/prompts/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isFavorite: !p.isFavorite }),
    });
    await onRefresh();
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/prompts/${id}`, { method: 'DELETE' });
    await onRefresh();
  };

  const filtered = prompts.filter(
    (p) =>
      p.title.toLowerCase().includes(filter.toLowerCase()) ||
      p.category.toLowerCase().includes(filter.toLowerCase()) ||
      p.content.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114] md:grid-cols-12"
      >
        <div className="md:col-span-4">
          <label htmlFor="sp-title" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Prompt Title
          </label>
          <input
            id="sp-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Check weekly liquidity sweep"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
          />
        </div>
        <div className="md:col-span-3">
          <label htmlFor="sp-cat" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Category
          </label>
          <select
            id="sp-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
          >
            <option>Market Structure</option>
            <option>Scenarios</option>
            <option>Indicators</option>
            <option>Risk</option>
            <option>Education</option>
            <option>Knowledge Base</option>
          </select>
        </div>
        <div className="md:col-span-5">
          <label htmlFor="sp-content" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Prompt Instruction
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="sp-content"
              required
              minLength={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Instruction to insert into research chat..."
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            />
            <button
              type="submit"
              disabled={saving}
              className="whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </form>

      <div className="flex items-center justify-between gap-4">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search saved prompts..."
          aria-label="Search saved prompts"
          className="w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#111114]"
        />
        <span className="text-xs text-zinc-500">{filtered.length} prompts</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#111114]"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] text-zinc-500">{p.category}</div>
                  <h3 className="font-display text-sm font-semibold">{p.title}</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Favorite ${p.title}`}
                    onClick={() => handleToggleFav(p)}
                    className="p-1 text-zinc-400 hover:text-amber-400"
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${p.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${p.title}`}
                    onClick={() => handleDelete(p.id)}
                    className="p-1 text-zinc-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {p.content}
              </p>
            </div>
            <div className="mt-3 border-t border-zinc-100 pt-2.5 dark:border-zinc-800/70">
              <button
                type="button"
                onClick={() => onUseInChat(p.content)}
                className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Use in AI Research Chat →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
