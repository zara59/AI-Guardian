import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { Wallet, Radar, ClipboardCheck, Network, ShieldCheck, Lock } from 'lucide-react';
import { useGuardianStatus } from '../hooks/useGuardianStatus';

const MODULE_ICONS = {
  'wallet-monitoring': Wallet,
  'suspicious-activity': Radar,
  'transaction-review': ClipboardCheck,
  'keeperhub-execution': Network,
};

export default function Guardian() {
  const { status, loading, error, reload } = useGuardianStatus();

  const protectionActive = status?.protection === 'active';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <Header title="Guardian Protection" subtitle="Your security layer for every Web3 decision." />

      <section className="bg-white border border-slate-200 rounded-2xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${protectionActive ? 'bg-green-50' : 'bg-slate-100'}`}>
              <ShieldCheck size={24} className={protectionActive ? 'text-green-600' : 'text-slate-500'} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Protection Status</h2>
              {error ? (
                <p className="text-sm text-red-600 mt-0.5">Could not reach backend</p>
              ) : (
                <p className="text-sm text-slate-500 flex items-center gap-2 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${protectionActive ? 'bg-green-400' : 'bg-slate-300'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${protectionActive ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                  </span>
                  {protectionActive ? 'Active' : 'Unknown'}
                </p>
              )}
            </div>
          </div>
          <span className="text-xs text-slate-400">
            Monitoring and execution backends connect in later phases
          </span>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-slate-900">Protection Modules</h2>
          <button
            onClick={reload}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {loading && !status ? (
          <LoadingSkeleton type="cards" count={2} />
        ) : error ? (
          <ErrorState
            message="Unable to load protection modules"
            description="Guardian couldn't retrieve the current protection status."
            onRetry={reload}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(status?.modules || []).map((mod) => {
              const Icon = MODULE_ICONS[mod.id] || ShieldCheck;
              const isPending = mod.status === 'pending';
              return (
                <div key={mod.id} className="bg-white border border-slate-200 rounded-2xl p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-brand-50 text-brand-600">
                      <Icon size={20} />
                    </div>
                    <StatusBadge status={mod.status} />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mb-1">{mod.name}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{mod.description}</p>
                  {isPending && (
                    <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
                      <Lock size={12} />
                      Connects when KeeperHub execution is integrated
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <EmptyState
          title="Security log"
          description="Detailed records of every scan, check and review Guardian performs will appear here when protection monitoring is connected."
        />
      </section>
    </div>
  );
}