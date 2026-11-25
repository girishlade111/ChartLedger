import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle2, Mail, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface NotificationSettings {
  emailAlertsEnabled: boolean;
  recipientEmail: string;
  includeResearchNotes: boolean;
  deliveryMode: 'instant' | 'digest';
}

interface NotificationDispatchRecord {
  id: number;
  symbol: string;
  condition: string;
  targetPrice: number;
  triggeredPrice: number;
  recipientEmail: string;
  channelStatus: 'sent_resend' | 'recorded_local';
  createdAt: string;
}

interface NotificationSettingsResponse {
  settings: NotificationSettings;
  smtpConfigured: boolean;
  recentDispatches: NotificationDispatchRecord[];
}

export function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<NotificationSettings>({
    emailAlertsEnabled: false,
    recipientEmail: '',
    includeResearchNotes: true,
    deliveryMode: 'instant',
  });
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [dispatches, setDispatches] = useState<NotificationDispatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<NotificationSettingsResponse>('/api/notifications/settings');
      setSettings(res.settings);
      setSmtpConfigured(res.smtpConfigured);
      setDispatches(res.recentDispatches || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load notification settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const persistPatch = async (patch: Partial<NotificationSettings>, message: string) => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await apiFetch<NotificationSettingsResponse>('/api/notifications/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setSettings(res.settings);
      setSmtpConfigured(res.smtpConfigured);
      setDispatches(res.recentDispatches || []);
      setSavedMsg(message);
    } catch (err: any) {
      setError(err.message || 'Failed to save notification settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEmailAlerts = () => {
    const nextEnabled = !settings.emailAlertsEnabled;
    setSettings((prev) => ({ ...prev, emailAlertsEnabled: nextEnabled }));
    void persistPatch(
      { emailAlertsEnabled: nextEnabled },
      nextEnabled
        ? 'Email notifications enabled for triggered price alerts.'
        : 'Email notifications disabled for triggered price alerts.'
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistPatch(settings, 'Notification settings saved.');
  };

  return (
    <section
      id="notification-settings"
      data-testid="notification-settings-panel"
      aria-label="Notification Settings"
      className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              Notification Settings
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            Configure email notifications when your real-time price alerts cross their target
            thresholds.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadSettings()}
          aria-label="Refresh notification settings and dispatch log"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-6 text-xs text-zinc-500">Loading notification settings...</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Primary Enable/Disable Switch */}
          <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-[#0B0B0E]">
            <div>
              <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">
                Email Notifications for Triggered Price Alerts
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Receive an alert notification whenever an active price threshold is crossed during
                real-time spot evaluation.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.emailAlertsEnabled}
              aria-label="Enable email notifications for triggered price alerts"
              disabled={saving}
              onClick={handleToggleEmailAlerts}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-[#111114] ${
                settings.emailAlertsEnabled
                  ? 'bg-emerald-600'
                  : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.emailAlertsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="notif-recipient-email"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Notification Email Address
              </label>
              <input
                id="notif-recipient-email"
                type="email"
                required
                value={settings.recipientEmail}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, recipientEmail: e.target.value }))
                }
                placeholder="trader@example.com"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
              />
            </div>

            <div>
              <label
                htmlFor="notif-delivery-mode"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Delivery Cadence
              </label>
              <select
                id="notif-delivery-mode"
                value={settings.deliveryMode}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    deliveryMode: e.target.value as 'instant' | 'digest',
                  }))
                }
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
              >
                <option value="instant">Instant email per triggered alert</option>
                <option value="digest">Grouped digest summary</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={settings.includeResearchNotes}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, includeResearchNotes: e.target.checked }))
              }
              className="rounded border-zinc-300 dark:border-zinc-700"
            />
            Include custom alert research notes in triggered email notifications
          </label>

          {!smtpConfigured && (
            <p className="text-[11px] text-zinc-500">
              Delivery mode: Outbound email provider is not configured in this environment, so
              enabled alert notifications are recorded below in your delivery audit log until a
              mail key is set.
            </p>
          )}

          {savedMsg && (
            <p
              role="status"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {savedMsg}
            </p>
          )}

          {error && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Notification Settings'}
            </button>
          </div>
        </form>
      )}

      {/* Recent Triggered Email Notification Dispatches */}
      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div className="mb-2 flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            Recent Triggered Alert Notifications
          </h3>
        </div>
        {dispatches.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No triggered alert email notifications recorded yet. Enable notifications above to log
            and send alerts when price targets are hit.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-xs dark:divide-zinc-800/70 dark:border-zinc-800">
            {dispatches.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
              >
                <div>
                  <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                    {d.symbol}
                  </span>{' '}
                  <span className="text-zinc-600 dark:text-zinc-400">
                    crossed {d.condition} ${d.targetPrice.toLocaleString()} (spot $
                    {d.triggeredPrice.toLocaleString()})
                  </span>
                  <div className="text-[11px] text-zinc-500">
                    To {d.recipientEmail} · {new Date(d.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className="font-mono text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {d.channelStatus === 'sent_resend' ? 'Email Sent' : 'Recorded'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
