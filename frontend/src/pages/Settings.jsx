import Header from '../components/Header';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { useState } from 'react';
import { usePreferences } from '../hooks/usePreferences';

export default function Settings() {
  const { preferences, loading, saving, error, reload, save } = usePreferences();
  const [notifications, setNotifications] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const riskOptions = [
    { id: "conservative", label: "Conservative", description: "Prioritize low-risk opportunities, even with lower returns" },
    { id: "moderate", label: "Moderate", description: "Balance risk and potential across opportunities" },
    { id: "aggressive", label: "Aggressive", description: "Favor high-potential opportunities despite higher risk" },
  ];

  const handleRiskChange = async (id) => {
    setSaveStatus(null);
    const ok = await save({ riskPreference: id });
    setSaveStatus(ok ? "saved" : "error");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <Header title="Settings" subtitle="Configure how Guardian analyzes and ranks opportunities." />

      {error && !loading && (
        <div className="mb-6">
          <ErrorState
            message="Sync issue"
            description="Your preferences could not be synced with the backend."
            onRetry={() => { setSaveStatus(null); reload(); }}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Risk Preference</h2>
              {saveStatus === "saved" && (
                <span className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                  Synced with backend
                </span>
              )}
            </div>
            <div className="space-y-3">
              {riskOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleRiskChange(opt.id)}
                  disabled={loading || saving}
                  className={`w-full text-left p-4 rounded-xl border transition-colors duration-150 ${
                    preferences.riskPreference === opt.id
                      ? 'border-brand-300 bg-brand-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0 ${
                      preferences.riskPreference === opt.id ? 'border-brand-500' : 'border-slate-300'
                    }`}>
                      {preferences.riskPreference === opt.id && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{opt.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 text-xs text-slate-400">
              Saved to your profile and applied to every personalized ranking.
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-5">Notifications</h2>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <div>
                <p className="text-sm font-medium text-slate-900">New opportunity alerts</p>
                <p className="text-xs text-slate-500 mt-0.5">Notify me when Guardian discovers new ranked opportunities</p>
              </div>
              <button
                onClick={() => setNotifications(!notifications)}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${notifications ? 'bg-brand-500' : 'bg-slate-200'}`}
                role="switch"
                aria-checked={notifications}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${notifications ? 'left-5' : 'left-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Risk warnings</p>
                <p className="text-xs text-slate-500 mt-0.5">Highlight opportunities with elevated risk scores</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                Coming soon
              </span>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-6">
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Advanced</h2>
              <span className="text-sm text-slate-400">{showAdvanced ? "Hide" : "Show"}</span>
            </button>
            {showAdvanced && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-500 leading-relaxed">
                  KeeperHub execution settings, wallet permissions and on-chain controls remain intentionally locked in Phase 1. User approval is required before any blockchain interaction at all times.
                </p>
                <EmptyState
                  title="Execution settings"
                  description="KeeperHub integration controls will appear here in Phase 2. Nothing can be executed until you approve it."
                />
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Profile</h2>
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="w-12 h-12 bg-brand-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold">G</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Guardian User</p>
                <p className="text-xs text-slate-500">{preferences.walletAddress ? "Wallet connected" : "Not connected to a wallet"}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mt-4">
              {loading
                ? "Loading preferences from the backend..."
                : `Risk preference: ${preferences.riskPreference}. Allocation target: $${preferences.allocation.toLocaleString()}.`}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}