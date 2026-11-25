import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PublicPage, PublicSite } from './components/PublicSite';
import { AuthMode, AuthViews, OnboardingWizard } from './components/AuthViews';
import { WorkspaceShell } from './components/WorkspaceShell';
import { AnalysisResultView } from './components/AnalysisResultView';
import { CandlestickChart } from './components/CandlestickChart';
import { apiFetch } from './lib/api';

function PublicShareViewer({ token, onBack }: { token: string; onBack: () => void }) {
  const { theme } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/public/shares/${encodeURIComponent(token)}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <div className="min-h-screen bg-white px-6 py-10 text-zinc-950 dark:bg-[#09090B] dark:text-[#FAFAFA]">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <button type="button" onClick={onBack} className="font-display text-lg font-bold">
            ChartLedger
          </button>
          <span className="text-xs text-zinc-500">Shared Research Report (Read-Only)</span>
        </div>
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : !data ? (
          <p className="text-sm text-zinc-500">Loading shared analysis...</p>
        ) : (
          <AnalysisResultView
            recordId={token}
            title={data.title}
            imageUrlOverride={data.imageUrl}
            isDemoFixture={data.isDemoFixture}
            result={data.resultJson}
            theme={theme}
            readOnly
          />
        )}
      </div>
    </div>
  );
}

function PublicWidgetViewer({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/public/widgets/${encodeURIComponent(token)}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  if (error) return <div className="p-4 text-xs text-red-500">{error}</div>;
  if (!data) return <div className="p-4 text-xs text-zinc-500">Loading ChartLedger widget...</div>;

  const isDark = data.widget.theme !== 'light';
  return (
    <div
      className={`min-h-screen p-4 ${
        isDark ? 'dark bg-[#09090B] text-zinc-50' : 'bg-white text-zinc-950'
      }`}
    >
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-display font-bold">
          {data.widget.name} · {data.sampleData.symbol} ({data.sampleData.timeframe})
        </span>
        <span className="text-[11px] text-zinc-500">Sample Data · Educational Only</span>
      </div>
      <CandlestickChart
        candles={data.sampleData.candles}
        theme={isDark ? 'dark' : 'light'}
        height={320}
      />
      <div className="mt-3 flex flex-wrap gap-4 font-mono text-[11px] text-zinc-500">
        {data.indicators.slice(0, 4).map((ind: any) => (
          <span key={ind.name}>
            {ind.name}: <strong className="text-zinc-900 dark:text-zinc-100">{String(ind.value)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function AppRouter() {
  const { user, loading, theme, toggleTheme } = useAuth();
  const [route, setRoute] = useState<'public' | 'auth' | 'workspace'>('public');
  const [publicPage, setPublicPage] = useState<PublicPage>('home');
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  const params = new URLSearchParams(window.location.search);
  const shareToken = params.get('share');
  const embedToken = params.get('embed');

  if (embedToken) {
    return <PublicWidgetViewer token={embedToken} />;
  }

  if (shareToken) {
    return (
      <PublicShareViewer
        token={shareToken}
        onBack={() => {
          window.history.replaceState({}, '', '/');
          setRoute('public');
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-zinc-500 dark:bg-[#09090B]">
        Initializing ChartLedger...
      </div>
    );
  }

  if (route === 'workspace' && user) {
    if (!user.onboardingCompleted) {
      return <OnboardingWizard onComplete={() => setRoute('workspace')} />;
    }
    return <WorkspaceShell onGoPublicHome={() => setRoute('public')} />;
  }

  if (route === 'auth' && !user) {
    return (
      <AuthViews
        mode={authMode}
        onChangeMode={setAuthMode}
        onBackHome={() => setRoute('public')}
        onSuccess={() => setRoute('workspace')}
      />
    );
  }

  return (
    <PublicSite
      page={publicPage}
      onNavigate={(p) => {
        setPublicPage(p);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
      onGoAuth={(mode) => {
        setAuthMode(mode);
        setRoute('auth');
      }}
      onGoWorkspace={() => setRoute('workspace')}
      isAuthenticated={Boolean(user)}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
