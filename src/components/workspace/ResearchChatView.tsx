import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  Edit3,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Square,
  Trash2,
} from 'lucide-react';
import { apiFetch, streamPostSse } from '../../lib/api';

interface ConversationRow {
  id: string;
  title: string;
  analysisId: string | null;
  updatedAt: string;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citationsJson?: Array<{
    documentTitle: string;
    chunkIndex: number;
    score: number;
    excerpt: string;
  }>;
  createdAt?: string;
}

interface ResearchChatViewProps {
  analysesList: Array<{ id: string; title: string; symbol?: string | null }>;
  promptsList: Array<{ id: string; title: string; category: string; content: string }>;
  initialAnalysisId?: string | null;
  initialPromptText?: string | null;
  onClearInitialIntent?: () => void;
}

export function ResearchChatView({
  analysesList,
  promptsList,
  initialAnalysisId,
  initialPromptText,
  onClearInitialIntent,
}: ResearchChatViewProps) {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [linkedAnalysisTitle, setLinkedAnalysisTitle] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [input, setInput] = useState('');
  const [selectedAnalysisForNew, setSelectedAnalysisForNew] = useState(initialAnalysisId || '');
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
  const [useMockProvider, setUseMockProvider] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = async () => {
    try {
      const res = await apiFetch<{ conversations: ConversationRow[] }>('/api/conversations');
      setConversations(res.conversations);
      if (!activeId && res.conversations.length > 0) {
        setActiveId(res.conversations[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (initialPromptText) {
      setInput(initialPromptText);
    }
    if (initialAnalysisId) {
      setSelectedAnalysisForNew(initialAnalysisId);
      apiFetch<{ conversation: ConversationRow }>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ analysisId: initialAnalysisId }),
      })
        .then((res) => {
          setConversations((prev) => [res.conversation, ...prev]);
          setActiveId(res.conversation.id);
          onClearInitialIntent?.();
        })
        .catch(() => onClearInitialIntent?.());
    } else if (initialPromptText) {
      onClearInitialIntent?.();
    }
  }, [initialAnalysisId, initialPromptText]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setLinkedAnalysisTitle(null);
      return;
    }
    apiFetch<{
      conversation: ConversationRow;
      messages: MessageRow[];
      linkedAnalysis?: { title: string } | null;
    }>(`/api/conversations/${activeId}`)
      .then((res) => {
        setMessages(res.messages);
        setLinkedAnalysisTitle(res.linkedAnalysis?.title || null);
      })
      .catch((err) => setError(err.message));
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streaming]);

  const handleNewConversation = async () => {
    setError(null);
    try {
      const res = await apiFetch<{ conversation: ConversationRow }>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({
          analysisId: selectedAnalysisForNew || null,
        }),
      });
      setConversations((prev) => [res.conversation, ...prev]);
      setActiveId(res.conversation.id);
      setMessages([]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    await apiFetch(`/api/conversations/${id}`, { method: 'DELETE' });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  };

  const handleSend = async (overrideText?: string, regenerate = false) => {
    const content = (overrideText ?? input).trim();
    if (!content || streaming) return;

    setError(null);
    let targetConvId = activeId;
    if (!targetConvId) {
      const created = await apiFetch<{ conversation: ConversationRow }>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({
          title: content.slice(0, 60),
          analysisId: selectedAnalysisForNew || null,
        }),
      });
      setConversations((prev) => [created.conversation, ...prev]);
      setActiveId(created.conversation.id);
      targetConvId = created.conversation.id;
    }

    if (!overrideText) setInput('');

    const tempAssistantId = `stream-${Date.now()}`;
    setMessages((prev) => [
      ...(regenerate ? prev.slice(0, -1) : prev),
      ...(!regenerate
        ? [{ id: `user-${Date.now()}`, role: 'user' as const, content }]
        : []),
      { id: tempAssistantId, role: 'assistant' as const, content: '', citationsJson: [] },
    ]);

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamPostSse(
        `/api/conversations/${targetConvId}/stream`,
        { content, useKnowledgeBase, useMockProvider, regenerate },
        {
          onMeta: (meta) => {
            if (meta.citations?.length) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId ? { ...m, citationsJson: meta.citations } : m
                )
              );
            }
          },
          onDelta: (delta) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId ? { ...m, content: m.content + delta } : m
              )
            );
          },
          onError: (msg) => setError(msg),
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Streaming response failed.');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const handleRegenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) void handleSend(lastUser.content, true);
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grid min-h-[620px] grid-cols-1 gap-4 lg:grid-cols-12">
      {/* Left Conversation List (AionUi-inspired thread sidebar adapted for multi-user SaaS) */}
      <aside className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#111114] lg:col-span-4">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <select
              aria-label="Attach analysis to new chat"
              value={selectedAnalysisForNew}
              onChange={(e) => setSelectedAnalysisForNew(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            >
              <option value="">General Research Chat</option>
              {analysesList.map((a) => (
                <option key={a.id} value={a.id}>
                  Attach: {a.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleNewConversation}
              aria-label="New conversation"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
              New
            </button>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            aria-label="Search conversations"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs dark:border-zinc-800 dark:bg-[#09090B]"
          />
        </div>

        <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">
              No conversations yet. Start a thread or attach a saved chart analysis.
            </p>
          ) : (
            filteredConversations.map((c) => (
              <div
                key={c.id}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                  activeId === c.id
                    ? 'bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50'
                    : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  aria-label={`Delete conversation ${c.title}`}
                  onClick={() => handleDeleteConversation(c.id)}
                  className="shrink-0 text-zinc-400 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Saved Prompts Quick Insert */}
        <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="mb-2 text-[11px] font-semibold text-zinc-500">
            Insert Saved Research Prompt
          </div>
          <div className="max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
            {promptsList.slice(0, 6).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setInput(p.content)}
                className="block w-full truncate rounded-md border border-zinc-200 px-2.5 py-2 text-left text-xs leading-snug text-zinc-700 transition-colors hover:border-emerald-500 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {p.title}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Right Streaming Chat Panel */}
      <section className="flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#111114] lg:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-5 py-3 text-xs dark:border-zinc-800">
          <div className="font-medium text-zinc-900 dark:text-zinc-100">
            {linkedAnalysisTitle ? `Context: ${linkedAnalysisTitle}` : 'AI Trading Research Assistant'}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-zinc-600 dark:text-zinc-400">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={useKnowledgeBase}
                onChange={(e) => setUseKnowledgeBase(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              RAG Knowledge Base
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={useMockProvider}
                onChange={(e) => setUseMockProvider(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              Fixture Mode
            </label>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: '460px' }}>
          {messages.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              Ask about market structure, indicator divergence, invalidation levels, or your private
              trading playbook notes.
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-[#09090B] dark:text-zinc-100'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div className="flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <button
                        type="button"
                        aria-label="Edit message"
                        onClick={() => setInput(msg.content)}
                        className="shrink-0 opacity-75 hover:opacity-100"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-table:text-xs">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content || (streaming && idx === messages.length - 1 ? '...' : '')}
                      </ReactMarkdown>
                    </div>
                  )}

                  {msg.citationsJson && msg.citationsJson.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-zinc-200 pt-2 text-[11px] text-zinc-500 dark:border-zinc-800">
                      <div className="inline-flex items-center gap-1 font-semibold text-zinc-700 dark:text-zinc-300">
                        <BookOpen className="h-3 w-3" />
                        Knowledge-Base Citations
                      </div>
                      {msg.citationsJson.map((c, i) => (
                        <div key={i} className="truncate font-mono">
                          [{c.documentTitle} · chunk #{c.chunkIndex + 1} · score {c.score}]
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Error & Controls */}
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          {error && (
            <p role="alert" className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Ask a follow-up question about structure, risk, or indicators..."
              aria-label="Chat message"
              className="flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-[#09090B]"
            />
            {streaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500 px-3.5 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </button>
            ) : (
              <>
                {messages.some((m) => m.role === 'assistant') && (
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    aria-label="Regenerate last response"
                    className="rounded-lg border border-zinc-300 p-2.5 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  Send
                </button>
              </>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
