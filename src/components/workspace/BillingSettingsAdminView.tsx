import React, { useEffect, useState } from 'react';
import { Code2, Download, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { formatCents } from '../../utils/billing';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';

export function BillingAndWidgetsView() {
  const { refreshProfile } = useAuth();
  const [billing, setBilling] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [widgets, setWidgets] = useState<any[]>([]);
  const [widgetName, setWidgetName] = useState('');
  const [widgetDomains, setWidgetDomains] = useState('*');
  const [widgetTheme, setWidgetTheme] = useState<'dark' | 'light'>('dark');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [b, p, w] = await Promise.all([
      apiFetch('/api/billing/subscription'),
      apiFetch<{ plans: any[] }>('/api/billing/plans'),
      apiFetch<{ widgets: any[] }>('/api/widgets'),
    ]);
    setBilling(b);
    setPlans(p.plans);
    setWidgets(w.widgets);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCheckout = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await apiFetch<{ mode: string; checkoutUrl?: string; message?: string }>(
        '/api/billing/checkout',
        { method: 'POST' }
      );
      if (res.mode === 'stripe_test' && res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        setStatusMsg(res.message || 'Stripe test credentials not set; use local simulator.');
      }
    } catch (err: any) {
      setStatusMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLocalSim = async (action: 'upgrade_pro' | 'downgrade_free') => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await apiFetch<{ note: string; eventId: string }>(
        '/api/billing/simulate-test-webhook',
        { method: 'POST', body: JSON.stringify({ action }) }
      );
      setStatusMsg(`${res.note} (Event: ${res.eventId})`);
      await Promise.all([load(), refreshProfile()]);
    } catch (err: any) {
      setStatusMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateWidget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!widgetName.trim()) return;
    await apiFetch('/api/widgets', {
      method: 'POST',
      body: JSON.stringify({
        name: widgetName,
        allowedDomains: widgetDomains,
        theme: widgetTheme,
      }),
    });
    setWidgetName('');
    await load();
  };

  const handleDeleteWidget = async (id: string) => {
    await apiFetch(`/api/widgets/${id}`, { method: 'DELETE' });
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  };

  if (!billing) {
    return <div className="py-10 text-xs text-zinc-500">Loading billing and quota telemetry...</div>;
  }

  const bars = [
    {
      label: 'Structured Chart Analyses',
      used: billing.usage.analysesCount,
      limit: billing.plan.analysesLimit,
    },
    {
      label: 'Streaming AI Research Messages',
      used: billing.usage.messagesCount,
      limit: billing.plan.messagesLimit,
    },
    {
      label: 'Private Knowledge-Base Documents',
      used: billing.usage.kbDocsCount,
      limit: billing.plan.kbDocsLimit,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Current Plan & Usage Quotas */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114]">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <div>
            <div className="text-xs text-zinc-500">
              Active Subscription · Billing Period {billing.usage.periodKey}
            </div>
            <h2 className="mt-1 font-display text-xl font-bold">
              {billing.plan.name} ({formatCents(billing.plan.priceMonthlyCents)}/mo)
            </h2>
          </div>
          <div className="font-mono text-xs text-zinc-500">
            Tokens recorded this period: {billing.usage.tokensUsed.toLocaleString()}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
          {bars.map((b) => {
            const pct = Math.min(100, Math.round((b.used / Math.max(1, b.limit)) * 100));
            return (
              <div key={b.label} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{b.label}</span>
                  <span className="font-mono tabular-nums text-zinc-500">
                    {b.used} / {b.limit}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${
                      pct >= 90 ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {statusMsg && (
          <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
            {statusMsg}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            disabled={busy}
            onClick={handleCheckout}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {billing.stripeTestModeConfigured
              ? 'Open Stripe Test Checkout'
              : 'Test Stripe Checkout Flow'}
          </button>

          {!billing.stripeTestModeConfigured && (
            <>
              <button
                type="button"
                disabled={busy || billing.plan.id === 'pro'}
                onClick={() => handleLocalSim('upgrade_pro')}
                className="rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Simulate Local Pro Webhook (Test Fixture)
              </button>
              <button
                type="button"
                disabled={busy || billing.plan.id === 'free'}
                onClick={() => handleLocalSim('downgrade_free')}
                className="rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Simulate Downgrade to Free
              </button>
            </>
          )}
        </div>
      </div>

      {/* Plan Comparison */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {plans.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-base font-bold">{p.name}</h3>
              <span className="font-mono text-lg font-bold tabular-nums">
                {formatCents(p.priceMonthlyCents)}/mo
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{p.description}</p>
            <ul className="mt-3 space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
              {(p.featuresJson || []).map((f: string, idx: number) => (
                <li key={idx}>• {f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Embeddable Widget Configuration */}
      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114]">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-emerald-500" />
          <h3 className="font-display text-base font-semibold">Embeddable Research Widgets</h3>
        </div>
        <p className="text-xs text-zinc-500">
          Generate sandboxed iframe widgets with restricted embed tokens that never expose your
          account session or private chats.
        </p>

        <form onSubmit={handleCreateWidget} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            required
            value={widgetName}
            onChange={(e) => setWidgetName(e.target.value)}
            placeholder="Widget name (e.g., Blog Chart)"
            aria-label="Widget name"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
          />
          <input
            value={widgetDomains}
            onChange={(e) => setWidgetDomains(e.target.value)}
            placeholder="Allowed domains (e.g., example.com)"
            aria-label="Allowed domains"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
          />
          <select
            value={widgetTheme}
            onChange={(e) => setWidgetTheme(e.target.value as 'dark' | 'light')}
            aria-label="Widget theme"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
          >
            <option value="dark">Dark Theme</option>
            <option value="light">Light Theme</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950"
          >
            Create Widget
          </button>
        </form>

        {widgets.length > 0 && (
          <div className="space-y-3">
            {widgets.map((w) => {
              const embedUrl = `${window.location.origin}/?embed=${w.embedToken}`;
              const snippet = `<iframe src="${embedUrl}" width="100%" height="440" style="border:0;border-radius:12px;" title="${w.name}"></iframe>`;
              return (
                <div
                  key={w.id}
                  className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-[#09090B]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {w.name} · {w.theme} · Domains: {w.allowedDomains}
                    </span>
                    <button
                      type="button"
                      aria-label={`Delete widget ${w.name}`}
                      onClick={() => handleDeleteWidget(w.id)}
                      className="text-zinc-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <code className="block overflow-x-auto rounded bg-zinc-200 p-2 font-mono text-[11px] dark:bg-zinc-900">
                    {snippet}
                  </code>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsView() {
  const { user, setUser, logout } = useAuth();
  const prefs = (user?.preferencesJson || {}) as Record<string, any>;

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [experience, setExperience] = useState(prefs.experience || 'Intermediate');
  const [researchStyle, setResearchStyle] = useState(prefs.researchStyle || 'Swing');
  const [detailLevel, setDetailLevel] = useState(prefs.detailLevel || 'Balanced');
  const [language, setLanguage] = useState(prefs.language || 'English');
  const [personalizationEnabled, setPersonalizationEnabled] = useState(
    prefs.personalizationEnabled !== false
  );
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMsg(null);
    await apiFetch('/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    });
    const res = await apiFetch<{ preferencesJson: Record<string, unknown> }>('/api/user/preferences', {
      method: 'PATCH',
      body: JSON.stringify({
        experience,
        researchStyle,
        detailLevel,
        language,
        personalizationEnabled,
      }),
    });
    setUser((prev) =>
      prev ? { ...prev, displayName, preferencesJson: res.preferencesJson } : prev
    );
    setSavedMsg('Profile and adaptive personalization preferences saved.');
  };

  const handleResetPrefs = async () => {
    const res = await apiFetch<{ preferencesJson: Record<string, unknown> }>('/api/user/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ reset: true }),
    });
    setUser((prev) => (prev ? { ...prev, preferencesJson: res.preferencesJson } : prev));
    setExperience('Intermediate');
    setResearchStyle('Swing');
    setDetailLevel('Balanced');
    setLanguage('English');
    setPersonalizationEnabled(true);
    setSavedMsg('Personalization preferences reset to defaults.');
  };

  const handleExport = async () => {
    const data = await apiFetch('/api/user/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chartledger-account-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAccount = async () => {
    await apiFetch('/api/user/account', { method: 'DELETE' });
    await logout();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <form
        onSubmit={handleSave}
        className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114]"
      >
        <h2 className="font-display text-lg font-semibold">Profile & Adaptive Personalization</h2>
        <p className="text-xs text-zinc-500">
          Personalization uses your explicit research settings below to tailor explanation depth and
          language. It never alters financial safety guardrails or invents certainty.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="set-name" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Display Name
            </label>
            <input
              id="set-name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Account Email
            </label>
            <input
              disabled
              value={user?.email || ''}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label htmlFor="set-exp" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Trading Experience
            </label>
            <select
              id="set-exp"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            >
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Experienced">Experienced</option>
            </select>
          </div>
          <div>
            <label htmlFor="set-style" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Research Style
            </label>
            <select
              id="set-style"
              value={researchStyle}
              onChange={(e) => setResearchStyle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            >
              <option value="Scalping">Scalping</option>
              <option value="Intraday">Intraday</option>
              <option value="Swing">Swing</option>
              <option value="Position / Long-Term">Position / Long-Term</option>
            </select>
          </div>
          <div>
            <label htmlFor="set-detail" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Analysis Detail
            </label>
            <select
              id="set-detail"
              value={detailLevel}
              onChange={(e) => setDetailLevel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            >
              <option value="Concise">Concise</option>
              <option value="Balanced">Balanced</option>
              <option value="Comprehensive">Comprehensive</option>
            </select>
          </div>
          <div>
            <label htmlFor="set-lang" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Preferred AI Language
            </label>
            <select
              id="set-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            >
              <option>English</option>
              <option>Hindi</option>
              <option>Marathi</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
              <option>Italian</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={personalizationEnabled}
            onChange={(e) => setPersonalizationEnabled(e.target.checked)}
            className="rounded border-zinc-300 dark:border-zinc-700"
          />
          Enable transparent personalization on new analyses & research chat
        </label>

        {savedMsg && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{savedMsg}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Save Changes
          </button>
          <button
            type="button"
            onClick={handleResetPrefs}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium dark:border-zinc-700"
          >
            Reset Preferences
          </button>
        </div>
      </form>

      {/* Notification Settings Panel */}
      <NotificationSettingsPanel />

      {/* Data Export & Deletion */}
      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114]">
        <h3 className="font-display text-base font-semibold">Privacy, Data Export & Deletion</h3>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <Download className="h-3.5 w-3.5" />
            Export My Data (JSON)
          </button>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Account
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                Permanently delete all account records?
              </span>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminDashboardView() {
  const [overview, setOverview] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [editingPrompt, setEditingPrompt] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    try {
      const [ov, us, pr, au] = await Promise.all([
        apiFetch('/api/admin/overview'),
        apiFetch<{ users: any[] }>('/api/admin/users'),
        apiFetch<{ templates: any[] }>('/api/admin/prompts'),
        apiFetch<{ logs: any[] }>('/api/admin/audit-logs'),
      ]);
      setOverview(ov);
      setUsersList(us.users);
      setTemplates(pr.templates);
      setLogs(au.logs);
    } catch (err: any) {
      setError(err.message || 'Administrator access required.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSavePrompt = async () => {
    if (!editingPrompt) return;
    setNotice(null);
    await apiFetch(`/api/admin/prompts/${editingPrompt.id}`, {
      method: 'PUT',
      body: JSON.stringify({ systemPrompt: editingPrompt.text, active: true }),
    });
    setEditingPrompt(null);
    setNotice('Prompt template version incremented and activated.');
    await load();
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
        <ShieldAlert className="h-4 w-4" />
        {error}
      </div>
    );
  }

  if (!overview) return <div className="py-10 text-xs text-zinc-500">Loading admin console...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {[
          ['Registered Users', overview.metrics.registeredUsers],
          ['Pro Subscribers', overview.metrics.proSubscribers],
          ['Total Analyses', overview.metrics.totalAnalyses],
          ['Conversations', overview.metrics.totalConversations],
          ['Indexed KB Docs', overview.metrics.indexedKnowledgeDocs],
          ['Analysis Tokens', overview.metrics.totalAnalysisTokens.toLocaleString()],
        ].map(([label, val]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#111114]"
          >
            <div className="text-[11px] text-zinc-500">{label}</div>
            <div className="mt-1 font-mono text-xl font-bold tabular-nums">{val}</div>
          </div>
        ))}
      </div>

      {notice && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      )}

      {/* Versioned Prompt Registry */}
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
        <h3 className="font-display text-base font-semibold">Versioned AI System Prompt Registry</h3>
        <div className="space-y-3">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="rounded-lg border border-zinc-200 p-4 text-xs dark:border-zinc-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">{tpl.name}</span> ·{' '}
                  <span className="font-mono text-zinc-500">
                    {tpl.id} (v{tpl.version})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingPrompt({ id: tpl.id, text: tpl.systemPrompt })}
                  className="text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  Edit Version
                </button>
              </div>
              {editingPrompt && editingPrompt.id === tpl.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    rows={6}
                    value={editingPrompt.text}
                    onChange={(e) =>
                      setEditingPrompt((prev) =>
                        prev ? { ...prev, text: e.target.value } : null
                      )
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 font-mono text-xs dark:border-zinc-700 dark:bg-[#09090B]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSavePrompt}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white"
                    >
                      Publish v{tpl.version + 1}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPrompt(null)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 line-clamp-2 font-mono text-[11px] text-zinc-500">
                  {tpl.systemPrompt}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Users & Audit Logs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
          <h3 className="mb-3 font-display text-base font-semibold">Registered Accounts</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="py-2 pr-2 font-medium">Email</th>
                  <th className="py-2 pr-2 font-medium">Role</th>
                  <th className="py-2 font-medium">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {usersList.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 pr-2 font-mono">{u.email}</td>
                    <td className="py-2 pr-2 capitalize">{u.role}</td>
                    <td className="py-2 font-mono uppercase">{u.planId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
          <h3 className="mb-3 font-display text-base font-semibold">Security Audit Log</h3>
          <div className="max-h-64 space-y-2 overflow-y-auto text-xs">
            {logs.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between border-b border-zinc-100 pb-1.5 dark:border-zinc-800/70"
              >
                <span className="font-mono text-zinc-800 dark:text-zinc-200">{l.action}</span>
                <span className="font-mono text-[11px] text-zinc-500">
                  {new Date(l.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
