import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  BookOpen,
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  FilePlus2,
  GripVertical,
  HelpCircle,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  Sparkles,
  Star,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import {
  buildRecentAnalysesCsv,
  buildWorkspaceKpisCsv,
  triggerCsvDownload,
} from '../utils/csvExport';
import {
  DASHBOARD_WIDGET_LABELS,
  DEFAULT_DASHBOARD_WIDGET_ORDER,
  moveDashboardWidget,
  normalizeDashboardOrder,
  reorderDashboardWidgets,
  type DashboardWidgetId,
} from '../utils/dashboardLayout';
import { NewAnalysisView } from './workspace/NewAnalysisView';
import { ResearchChatView } from './workspace/ResearchChatView';
import { KnowledgeBaseView, SavedPromptsView } from './workspace/KnowledgeAndPromptsView';
import { AnalysisHistoryView, WatchlistView } from './workspace/HistoryAndWatchlistView';
import { PortfolioSummaryWidget } from './workspace/PortfolioSummaryWidget';
import { HoldingsValue30dSection } from './workspace/HoldingsValue30dSection';
import { MarketSentimentWidget } from './workspace/MarketSentimentWidget';
import { PriceAlertsView } from './workspace/PriceAlertsView';
import { AlertHistoryView } from './workspace/AlertHistoryView';
import {
  AdminDashboardView,
  BillingAndWidgetsView,
  SettingsView,
} from './workspace/BillingSettingsAdminView';

export type WorkspaceSection =
  | 'overview'
  | 'new-analysis'
  | 'chat'
  | 'history'
  | 'saved'
  | 'watchlist'
  | 'alerts'
  | 'alert-history'
  | 'knowledge'
  | 'prompts'
  | 'billing'
  | 'settings'
  | 'help'
  | 'admin';

interface WorkspaceShellProps {
  onGoPublicHome: () => void;
}

export function WorkspaceShell({ onGoPublicHome }: WorkspaceShellProps) {
  const { user, setUser, theme, toggleTheme, logout } = useAuth();
  const [section, setSection] = useState<WorkspaceSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [analyses, setAnalyses] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [billingSummary, setBillingSummary] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('gemini-4-hydrogen');

  const [chatAnalysisId, setChatAnalysisId] = useState<string | null>(null);
  const [chatInitialPrompt, setChatInitialPrompt] = useState<string | null>(null);
  const [analyzeSymbol, setAnalyzeSymbol] = useState<string | undefined>(undefined);
  const [alertDraftSymbol, setAlertDraftSymbol] = useState<string | undefined>(undefined);
  const [alertDraftPrice, setAlertDraftPrice] = useState<number | null>(null);
  const [triggeredAlertsCount, setTriggeredAlertsCount] = useState(0);
  const [holdingsVersion, setHoldingsVersion] = useState(0);

  const [widgetOrder, setWidgetOrder] = useState<DashboardWidgetId[]>(() =>
    normalizeDashboardOrder(user?.preferencesJson?.dashboardWidgetOrder)
  );
  const [draggedWidget, setDraggedWidget] = useState<DashboardWidgetId | null>(null);
  const [dragOverWidget, setDragOverWidget] = useState<DashboardWidgetId | null>(null);
  const [layoutSavedNotice, setLayoutSavedNotice] = useState<string | null>(null);
  const [refreshingKpis, setRefreshingKpis] = useState(false);
  const [refreshingQuickActions, setRefreshingQuickActions] = useState(false);
  const [refreshingAnalyses, setRefreshingAnalyses] = useState(false);
  const [kpiExportNotice, setKpiExportNotice] = useState<string | null>(null);
  const [analysesExportNotice, setAnalysesExportNotice] = useState<string | null>(null);

  useEffect(() => {
    setWidgetOrder(normalizeDashboardOrder(user?.preferencesJson?.dashboardWidgetOrder));
  }, [user?.preferencesJson?.dashboardWidgetOrder]);

  const persistWidgetOrder = useCallback(
    async (nextOrder: DashboardWidgetId[], noticeText = 'Dashboard layout saved.') => {
      setWidgetOrder(nextOrder);
      setLayoutSavedNotice(noticeText);
      try {
        const res = await apiFetch<{ preferencesJson: Record<string, unknown> }>(
          '/api/user/preferences',
          {
            method: 'PATCH',
            body: JSON.stringify({ dashboardWidgetOrder: nextOrder }),
          }
        );
        setUser((prev) => (prev ? { ...prev, preferencesJson: res.preferencesJson } : prev));
      } catch (err) {
        console.error('Failed to persist dashboard layout:', err);
      }
    },
    [setUser]
  );

  const isCustomLayout = widgetOrder.some((id, idx) => DEFAULT_DASHBOARD_WIDGET_ORDER[idx] !== id);

  const loadWorkspaceData = useCallback(async () => {
    try {
      const [aRes, pRes, bRes, provRes, alertRes] = await Promise.all([
        apiFetch<{ analyses: any[] }>('/api/analyses'),
        apiFetch<{ prompts: any[] }>('/api/prompts'),
        apiFetch('/api/billing/subscription'),
        apiFetch<{ providers: any[] }>('/api/providers'),
        apiFetch<{ alerts: Array<{ status: string }> }>('/api/alerts').catch(() => ({
          alerts: [],
        })),
      ]);
      setAnalyses(aRes.analyses);
      setPrompts(pRes.prompts);
      setBillingSummary(bRes);
      setProviders(provRes.providers);
      setTriggeredAlertsCount(
        alertRes.alerts.filter((al) => al.status === 'triggered').length
      );
    } catch (err) {
      console.error('Workspace load error:', err);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  const refreshKpisWidget = useCallback(async () => {
    setRefreshingKpis(true);
    try {
      const [bRes, aRes] = await Promise.all([
        apiFetch('/api/billing/subscription'),
        apiFetch<{ analyses: any[] }>('/api/analyses'),
      ]);
      setBillingSummary(bRes);
      setAnalyses(aRes.analyses);
    } catch (err) {
      console.error('KPI widget refresh error:', err);
    } finally {
      setRefreshingKpis(false);
    }
  }, []);

  const refreshQuickActionsWidget = useCallback(async () => {
    setRefreshingQuickActions(true);
    try {
      const [alertRes, provRes] = await Promise.all([
        apiFetch<{ alerts: Array<{ status: string }> }>('/api/alerts?fresh=1'),
        apiFetch<{ providers: any[] }>('/api/providers'),
      ]);
      setTriggeredAlertsCount(
        alertRes.alerts.filter((al) => al.status === 'triggered').length
      );
      setProviders(provRes.providers);
    } catch (err) {
      console.error('Quick actions widget refresh error:', err);
    } finally {
      setRefreshingQuickActions(false);
    }
  }, []);

  const refreshRecentAnalysesWidget = useCallback(async () => {
    setRefreshingAnalyses(true);
    try {
      const aRes = await apiFetch<{ analyses: any[] }>('/api/analyses');
      setAnalyses(aRes.analyses);
    } catch (err) {
      console.error('Recent analyses widget refresh error:', err);
    } finally {
      setRefreshingAnalyses(false);
    }
  }, []);

  const handleOpenChat = (analysisId: string, prompt?: string) => {
    setChatAnalysisId(analysisId);
    setChatInitialPrompt(prompt || null);
    setSection('chat');
  };

  const navItems: Array<{ id: WorkspaceSection; label: string; icon: any; adminOnly?: boolean }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'new-analysis', label: 'New Analysis', icon: FilePlus2 },
    { id: 'chat', label: 'AI Research Chat', icon: MessageSquare },
    { id: 'history', label: 'Analysis History', icon: History },
    { id: 'saved', label: 'Saved Analyses', icon: Star },
    { id: 'watchlist', label: 'Watchlist', icon: Eye },
    { id: 'alerts', label: 'Price Alerts', icon: Bell },
    { id: 'alert-history', label: 'Alert History', icon: ClipboardList },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
    { id: 'prompts', label: 'Saved Prompts', icon: Sparkles },
    { id: 'billing', label: 'Usage & Billing', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'help', label: 'Help & Methodology', icon: HelpCircle },
    { id: 'admin', label: 'Admin Console', icon: Shield, adminOnly: true },
  ];

  const activeNav = navItems.find((n) => n.id === section);

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onGoPublicHome}
            className="font-display text-base font-bold tracking-tight text-zinc-950 dark:text-zinc-50"
          >
            ChartLedger
          </button>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label="Workspace navigation" className="space-y-0.5 p-3">
          {navItems
            .filter((item) => !item.adminOnly || user?.role === 'admin')
            .map((item) => {
              const Icon = item.icon;
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.id === 'alerts' && triggeredAlertsCount > 0 && (
                    <span
                      aria-label={`${triggeredAlertsCount} triggered alerts`}
                      className={`font-mono text-[10px] font-bold tabular-nums ${
                        isActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {triggeredAlertsCount}
                    </span>
                  )}
                </button>
              );
            })}
        </nav>
      </div>

      <div className="border-t border-zinc-200 p-4 text-xs dark:border-zinc-800">
        <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">
          {user?.displayName}
        </div>
        <div className="truncate text-[11px] text-zinc-500">{user?.email}</div>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-950 dark:bg-[#09090B] dark:text-[#FAFAFA]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#0E0E11] lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="w-64 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#0E0E11]">
            {sidebarContent}
          </div>
          <button
            type="button"
            aria-label="Dismiss menu backdrop"
            className="flex-1 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-zinc-200 bg-white/95 px-5 py-3.5 backdrop-blur dark:border-zinc-800 dark:bg-[#09090B]/95">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-md border border-zinc-300 p-1.5 dark:border-zinc-700 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="font-display text-base font-semibold tracking-tight">
              {activeNav?.label || 'Workspace'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <select
              aria-label="Select AI model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="hidden rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] dark:border-zinc-800 dark:bg-[#111114] sm:block"
            >
              {providers.length > 0 ? (
                providers.map((p) => (
                  <option key={p.id} value={p.model}>
                    {p.name} ({p.model})
                  </option>
                ))
              ) : (
                <option value="gemini-4-hydrogen">Google Gemini (gemini-4-hydrogen)</option>
              )}
            </select>

            {billingSummary && (
              <button
                type="button"
                onClick={() => setSection('billing')}
                className="hidden whitespace-nowrap font-mono text-[11px] tabular-nums text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 md:inline"
              >
                {billingSummary.plan.name} · {billingSummary.usage.analysesCount}/
                {billingSummary.plan.analysesLimit} charts
              </button>
            )}

            <button
              type="button"
              onClick={() => setSection('alerts')}
              aria-label="Open real-time price alerts"
              className="relative rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              title="Price Alerts"
            >
              <Bell className="h-4 w-4" />
              {triggeredAlertsCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 font-mono text-[9px] font-bold text-white">
                  {triggeredAlertsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Main Workspace Viewport */}
        <main className="mx-auto w-full max-w-6xl flex-1 p-5 lg:p-8">
          {section === 'overview' && (
            <div className="space-y-5" data-testid="overview-widgets-container">
              {/* Layout Customization Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-xs dark:border-zinc-800 dark:bg-[#111114]">
                <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <GripVertical className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                  <span>Drag any widget handle (or use arrows) to customize your dashboard layout.</span>
                </div>
                <div className="flex items-center gap-3">
                  {layoutSavedNotice && (
                    <span role="status" className="font-medium text-emerald-600 dark:text-emerald-400">
                      {layoutSavedNotice}
                    </span>
                  )}
                  {isCustomLayout && (
                    <button
                      type="button"
                      onClick={() =>
                        void persistWidgetOrder(
                          [...DEFAULT_DASHBOARD_WIDGET_ORDER],
                          'Default dashboard layout restored.'
                        )
                      }
                      className="inline-flex items-center gap-1 font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      Reset Layout
                    </button>
                  )}
                </div>
              </div>

              {/* Draggable Dashboard Widgets */}
              {widgetOrder.map((widgetId, index) => {
                const isDragging = draggedWidget === widgetId;
                const isDragOver = dragOverWidget === widgetId && draggedWidget !== widgetId;
                const label = DASHBOARD_WIDGET_LABELS[widgetId];

                let body: React.ReactNode = null;
                if (widgetId === 'kpi-overview') {
                  body = (
                    <section
                      aria-label="Workspace Usage KPIs"
                      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]"
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                            Workspace Usage KPIs
                          </h2>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            Monthly research quota utilization and saved workspace inventory.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            data-testid="csv-download-kpi-overview"
                            onClick={() => {
                              const dateStamp = new Date().toISOString().slice(0, 10);
                              const filename = `chartledger-workspace-kpis-${dateStamp}.csv`;
                              const csv = buildWorkspaceKpisCsv({
                                planName: billingSummary?.plan?.name || 'Free Research',
                                analysesCount: billingSummary?.usage.analysesCount ?? analyses.length,
                                analysesLimit: billingSummary?.plan.analysesLimit ?? 15,
                                messagesCount: billingSummary?.usage.messagesCount ?? 0,
                                messagesLimit: billingSummary?.plan.messagesLimit ?? 75,
                                savedFavoritesCount: analyses.filter((a) => a.isFavorite).length,
                                kbDocsCount: billingSummary?.usage.kbDocsCount ?? 0,
                                kbDocsLimit: billingSummary?.plan.kbDocsLimit ?? 5,
                                exportedAtIso: new Date().toISOString(),
                              });
                              triggerCsvDownload(csv, filename);
                              setKpiExportNotice(`Exported ${filename}`);
                            }}
                            aria-label="Download Workspace KPIs as CSV"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            Download as CSV
                          </button>
                          <button
                            type="button"
                            data-testid="refresh-widget-kpi-overview"
                            onClick={() => void refreshKpisWidget()}
                            disabled={refreshingKpis}
                            aria-label="Refresh workspace usage KPIs"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${refreshingKpis ? 'animate-spin' : ''}`}
                              aria-hidden="true"
                            />
                            Refresh
                          </button>
                        </div>
                      </div>
                      {kpiExportNotice && (
                        <p
                          role="status"
                          className="mb-3 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                        >
                          {kpiExportNotice}
                        </p>
                      )}
                      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
                          <div className="text-xs text-zinc-500">Analyses This Month</div>
                          <div className="mt-1 font-mono text-2xl font-bold tabular-nums">
                            {billingSummary?.usage.analysesCount ?? analyses.length}
                            <span className="text-xs font-normal text-zinc-500">
                              {' '}
                              / {billingSummary?.plan.analysesLimit ?? 15}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
                          <div className="text-xs text-zinc-500">AI Chat Messages</div>
                          <div className="mt-1 font-mono text-2xl font-bold tabular-nums">
                            {billingSummary?.usage.messagesCount ?? 0}
                            <span className="text-xs font-normal text-zinc-500">
                              {' '}
                              / {billingSummary?.plan.messagesLimit ?? 75}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
                          <div className="text-xs text-zinc-500">Saved Favorites</div>
                          <div className="mt-1 font-mono text-2xl font-bold tabular-nums">
                            {analyses.filter((a) => a.isFavorite).length}
                          </div>
                        </div>
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
                          <div className="text-xs text-zinc-500">Indexed Knowledge Docs</div>
                          <div className="mt-1 font-mono text-2xl font-bold tabular-nums">
                            {billingSummary?.usage.kbDocsCount ?? 0}
                            <span className="text-xs font-normal text-zinc-500">
                              {' '}
                              / {billingSummary?.plan.kbDocsLimit ?? 5}
                            </span>
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                } else if (widgetId === 'quick-actions') {
                  body = (
                    <section
                      aria-label="Quick Research Actions"
                      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]"
                    >
                      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                            Quick Research Actions
                          </h2>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            Launch chart pipelines, grounded chat, or alert sync directly from overview.
                          </p>
                        </div>
                        <button
                          type="button"
                          data-testid="refresh-widget-quick-actions"
                          onClick={() => void refreshQuickActionsWidget()}
                          disabled={refreshingQuickActions}
                          aria-label="Refresh live alerts and workspace status"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${refreshingQuickActions ? 'animate-spin' : ''}`}
                            aria-hidden="true"
                          />
                          Refresh
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => setSection('new-analysis')}
                          className="rounded-lg border border-emerald-500/40 bg-emerald-600/10 p-4 text-left transition-colors hover:bg-emerald-600/15"
                        >
                          <FilePlus2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          <div className="mt-2 font-display text-sm font-semibold">
                            Upload Chart Screenshot
                          </div>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                            Run the 8-stage structured analysis pipeline with deterministic OHLCV
                            indicators.
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSection('chat')}
                          className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left transition-colors hover:border-zinc-400 dark:border-zinc-800/80 dark:bg-[#0B0B0E]"
                        >
                          <MessageSquare className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                          <div className="mt-2 font-display text-sm font-semibold">
                            Open Streaming Research Chat
                          </div>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                            Interrogate saved chart setups with private knowledge-base RAG grounding.
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSection('knowledge')}
                          className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left transition-colors hover:border-zinc-400 dark:border-zinc-800/80 dark:bg-[#0B0B0E]"
                        >
                          <BookOpen className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                          <div className="mt-2 font-display text-sm font-semibold">
                            Index Trading Playbooks
                          </div>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                            Add private strategy checklists and notes to cite in future chart
                            analyses.
                          </p>
                        </button>
                      </div>
                    </section>
                  );
                } else if (widgetId === 'portfolio-summary') {
                  body = (
                    <PortfolioSummaryWidget
                      theme={theme}
                      onSetAlertForSymbol={(sym, price) => {
                        setAlertDraftSymbol(sym);
                        setAlertDraftPrice(price ?? null);
                        setSection('alerts');
                      }}
                      onAnalyzeSymbol={(sym) => {
                        setAnalyzeSymbol(sym);
                        setSection('new-analysis');
                      }}
                      onHoldingsChange={() => setHoldingsVersion((v) => v + 1)}
                    />
                  );
                } else if (widgetId === 'holdings-value-30d') {
                  body = (
                    <HoldingsValue30dSection theme={theme} refreshTrigger={holdingsVersion} />
                  );
                } else if (widgetId === 'market-sentiment') {
                  body = (
                    <MarketSentimentWidget
                      refreshTrigger={holdingsVersion}
                      onAnalyzeSymbol={(sym) => {
                        setAnalyzeSymbol(sym);
                        setSection('new-analysis');
                      }}
                    />
                  );
                } else if (widgetId === 'recent-analyses') {
                  body = (
                    <section
                      aria-label="Recent Chart Analyses"
                      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]"
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-display text-base font-semibold">
                          Recent Chart Analyses
                        </h2>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            data-testid="csv-download-recent-analyses"
                            onClick={() => {
                              const dateStamp = new Date().toISOString().slice(0, 10);
                              const filename = `chartledger-recent-analyses-${dateStamp}.csv`;
                              const csv = buildRecentAnalysesCsv(analyses);
                              triggerCsvDownload(csv, filename);
                              setAnalysesExportNotice(`Exported ${filename}`);
                            }}
                            disabled={analyses.length === 0}
                            aria-label="Download Recent Chart Analyses as CSV"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            Download as CSV
                          </button>
                          <button
                            type="button"
                            data-testid="refresh-widget-recent-analyses"
                            onClick={() => void refreshRecentAnalysesWidget()}
                            disabled={refreshingAnalyses}
                            aria-label="Refresh recent chart analyses"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${refreshingAnalyses ? 'animate-spin' : ''}`}
                              aria-hidden="true"
                            />
                            Refresh
                          </button>
                          <button
                            type="button"
                            onClick={() => setSection('history')}
                            className="ml-1 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            View all →
                          </button>
                        </div>
                      </div>
                      {analysesExportNotice && (
                        <p
                          role="status"
                          className="mb-2.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                        >
                          {analysesExportNotice}
                        </p>
                      )}
                      {analyses.length === 0 ? (
                        <div className="py-10 text-center text-xs text-zinc-500">
                          <BarChart3 className="mx-auto mb-2 h-6 w-6 text-zinc-400" />
                          No analyses recorded yet. Click “Upload Chart Screenshot” to run your
                          first structured report.
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                          {analyses.slice(0, 5).map((rec) => (
                            <div
                              key={rec.id}
                              className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"
                            >
                              <div>
                                <div className="font-medium text-zinc-950 dark:text-zinc-50">
                                  {rec.title}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  {rec.symbol || 'Unspecified'} · {rec.timeframe || 'TF'} ·{' '}
                                  {new Date(rec.createdAt).toLocaleString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span
                                  className={`font-semibold capitalize ${
                                    rec.marketBias === 'bullish'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : rec.marketBias === 'bearish'
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-amber-600 dark:text-amber-400'
                                  }`}
                                >
                                  {rec.marketBias}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenChat(rec.id)}
                                  className="text-emerald-600 hover:underline dark:text-emerald-400"
                                >
                                  Chat
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                }

                return (
                  <div
                    key={widgetId}
                    data-testid={`dashboard-widget-${widgetId}`}
                    data-widget-id={widgetId}
                    draggable
                    onDragStart={(e) => {
                      setDraggedWidget(widgetId);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', widgetId);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverWidget !== widgetId) {
                        setDragOverWidget(widgetId);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverWidget === widgetId) {
                        setDragOverWidget(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const sourceId =
                        draggedWidget || (e.dataTransfer.getData('text/plain') as DashboardWidgetId);
                      setDraggedWidget(null);
                      setDragOverWidget(null);
                      if (sourceId && sourceId !== widgetId) {
                        const next = reorderDashboardWidgets(widgetOrder, sourceId, widgetId);
                        void persistWidgetOrder(next);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedWidget(null);
                      setDragOverWidget(null);
                    }}
                    className={`rounded-xl transition-all ${
                      isDragging ? 'opacity-50' : 'opacity-100'
                    } ${
                      isDragOver
                        ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#09090B]'
                        : ''
                    }`}
                  >
                    {/* Subtle Drag Handle Strip */}
                    <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] text-zinc-500">
                      <div
                        data-testid={`drag-handle-${widgetId}`}
                        className="inline-flex cursor-grab items-center gap-1.5 font-medium active:cursor-grabbing"
                        title={`Drag to reorder ${label}`}
                      >
                        <GripVertical className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                        <span>{label}</span>
                      </div>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          aria-label={`Move ${label} up`}
                          onClick={() =>
                            void persistWidgetOrder(moveDashboardWidget(widgetOrder, widgetId, 'up'))
                          }
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                          title="Move widget up"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={index === widgetOrder.length - 1}
                          aria-label={`Move ${label} down`}
                          onClick={() =>
                            void persistWidgetOrder(
                              moveDashboardWidget(widgetOrder, widgetId, 'down')
                            )
                          }
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                          title="Move widget down"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {body}
                  </div>
                );
              })}
            </div>
          )}

          {section === 'new-analysis' && (
            <NewAnalysisView
              theme={theme}
              initialSymbol={analyzeSymbol}
              onAnalysisCreated={() => void loadWorkspaceData()}
              onOpenChat={handleOpenChat}
            />
          )}

          {section === 'chat' && (
            <ResearchChatView
              analysesList={analyses}
              promptsList={prompts}
              initialAnalysisId={chatAnalysisId}
              initialPromptText={chatInitialPrompt}
              onClearInitialIntent={() => {
                setChatAnalysisId(null);
                setChatInitialPrompt(null);
              }}
            />
          )}

          {section === 'history' && (
            <AnalysisHistoryView
              analyses={analyses}
              theme={theme}
              onRefresh={loadWorkspaceData}
              onOpenChat={handleOpenChat}
            />
          )}

          {section === 'saved' && (
            <AnalysisHistoryView
              analyses={analyses}
              favoritesOnly
              theme={theme}
              onRefresh={loadWorkspaceData}
              onOpenChat={handleOpenChat}
            />
          )}

          {section === 'watchlist' && (
            <WatchlistView
              onAnalyzeSymbol={(sym) => {
                setAnalyzeSymbol(sym);
                setSection('new-analysis');
              }}
              onSetAlertForSymbol={(sym, price) => {
                setAlertDraftSymbol(sym);
                setAlertDraftPrice(price ?? null);
                setSection('alerts');
              }}
            />
          )}

          {section === 'alerts' && (
            <PriceAlertsView
              initialSymbol={alertDraftSymbol}
              initialPrice={alertDraftPrice}
              onClearInitialSymbol={() => {
                setAlertDraftSymbol(undefined);
                setAlertDraftPrice(null);
              }}
              onAnalyzeSymbol={(sym) => {
                setAnalyzeSymbol(sym);
                setSection('new-analysis');
              }}
              onTriggeredCountChange={setTriggeredAlertsCount}
              onOpenAlertHistory={() => setSection('alert-history')}
              onOpenNotificationSettings={() => {
                setSection('settings');
                setTimeout(() => {
                  document
                    .getElementById('notification-settings')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }}
            />
          )}

          {section === 'alert-history' && (
            <AlertHistoryView
              onAnalyzeSymbol={(sym) => {
                setAnalyzeSymbol(sym);
                setSection('new-analysis');
              }}
              onGoToAlerts={() => setSection('alerts')}
            />
          )}

          {section === 'knowledge' && <KnowledgeBaseView />}

          {section === 'prompts' && (
            <SavedPromptsView
              prompts={prompts}
              onRefresh={loadWorkspaceData}
              onUseInChat={(txt) => {
                setChatInitialPrompt(txt);
                setSection('chat');
              }}
            />
          )}

          {section === 'billing' && <BillingAndWidgetsView />}

          {section === 'settings' && <SettingsView />}

          {section === 'help' && (
            <div className="max-w-3xl space-y-5 rounded-xl border border-zinc-200 bg-white p-6 text-sm leading-relaxed dark:border-zinc-800 dark:bg-[#111114]">
              <h2 className="font-display text-lg font-bold">
                ChartLedger Research Methodology & Safety Guide
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                ChartLedger executes an 8-stage analytical pipeline designed to prevent AI
                hallucinations and ungrounded price claims:
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-xs text-zinc-700 dark:text-zinc-300">
                <li>Image signature, MIME type, and safe dimension verification.</li>
                <li>Multimodal visual parsing of visible price axes, candles, and annotations.</li>
                <li>Matched OHLCV lookup (Binance public spot for crypto pairs) and deterministic server-side calculation of SMA, EMA, RSI, MACD, ATR, Bollinger Bands, Stochastic, ADX, VWAP, and Fibonacci retracements.</li>
                <li>Chart pattern inspection with explicit confirmation and invalidation criteria.</li>
                <li>Optional per-user isolated RAG retrieval from your private trading notes.</li>
                <li>Conditional Bullish, Bearish, and Neutral scenario generation without arbitrary percentage probabilities.</li>
                <li>Risk analysis highlighting volatility, whipsaw hazards, and missing higher-timeframe context.</li>
                <li>Stage 8 automated schema and financial-safety validation enforcing disclaimers and insufficient-data detection.</li>
              </ol>
            </div>
          )}

          {section === 'admin' && <AdminDashboardView />}
        </main>
      </div>
    </div>
  );
}
