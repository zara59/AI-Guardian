import { useState } from 'react';
import Header from '../components/Header';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ErrorState from '../components/ErrorState';
import { useDiscovery } from '../hooks/useDiscovery';
import { relativeTime } from '../services/mapping';
import { Radar, ShieldCheck, TrendingUp, ScanSearch, ExternalLink, CheckCircle2 } from 'lucide-react';

const CHAIN_NAMES = { 1: 'Ethereum', 11155111: 'Sepolia' };

const KIND_LABELS = { v2: 'Uniswap V2', v3: 'Uniswap V3' };

function StatusPill({ status }) {
  if (status === 'screened') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        Screened
      </span>
    );
  }
  if (status === 'flagged') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        Flagged
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
      Pending
    </span>
  );
}

function explorerUrl(chainId, address) {
  const base =
    chainId === 11155111 ? 'https://sepolia.etherscan.io' : 'https://etherscan.io';
  return `${base}/address/${address}`;
}

function CandidateRow({ c }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center shrink-0">
            <ScanSearch size={16} className="text-brand-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {KIND_LABELS[c.kind] || c.kind} · {c.symA} / {c.symB}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {CHAIN_NAMES[c.chainId] || `Chain ${c.chainId}`} · block {c.blockNo}
              {c.fee ? ` · fee ${c.fee}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {c.guardianLinked && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
              Guardian-linked
            </span>
          )}
          {c.postedSlug && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
              <CheckCircle2 size={12} /> Posted
            </span>
          )}
          <StatusPill status={c.status} />
        </div>
      </div>

      {c.reason && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {c.reason}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          {c.symA} {c.decimalsA} decimals {c.deployedA ? '· deployed' : '· no bytecode'}
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          {c.symB} {c.decimalsB} decimals {c.deployedB ? '· deployed' : '· no bytecode'}
        </span>
        {c.hasLiquidity && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700">
            <CheckCircle2 size={12} className="mr-1" /> live liquidity
          </span>
        )}
        <a
          href={explorerUrl(c.chainId, c.pool)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-brand-600 hover:bg-brand-50 transition-colors"
        >
          Pool <ExternalLink size={12} />
        </a>
        {c.screenedAt && <span className="ml-auto text-slate-400">Screened {relativeTime(c.screenedAt)}</span>}
      </div>
    </div>
  );
}

export default function Discovery() {
  const { data, loading, error, reload } = useDiscovery();
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);

  const summary = data?.webfeed?.summary?.[0];
  const candidates = (data?.webfeed?.candidates || []).filter(
    (c) => !showFlaggedOnly || c.status === 'flagged',
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <Header
        title="Web → Web3 Discovery"
        subtitle="On-chain events surfaced from the public chain, screened web3-true. Candidates that pass the token screen AND hold live on-chain liquidity are posted as opportunities; everything else stays in the queue."
      />

      <section className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Radar size={16} className="text-brand-600" />
            Candidates
          </div>
          <p className="text-2xl font-bold text-slate-900">{summary?.candidates ?? '—'}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <ShieldCheck size={16} className="text-emerald-600" />
            Screened
          </div>
          <p className="text-2xl font-bold text-slate-900">{summary?.screened ?? '—'}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <CheckCircle2 size={16} className="text-indigo-600" />
            Posted
          </div>
          <p className="text-2xl font-bold text-slate-900">{summary?.posted ?? '—'}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <TrendingUp size={16} className="text-teal-600" />
            Guardian Linked
          </div>
          <p className="text-2xl font-bold text-slate-900">{summary?.guardianLinked ?? '—'}</p>
        </div>
      </section>

      <section className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Screening Queue</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Live market context — verbose, uncurated, on-chain sourced.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={showFlaggedOnly}
            onChange={(e) => setShowFlaggedOnly(e.target.checked)}
            className="accent-brand-500"
          />
          Flagged only
        </label>
      </section>

      {loading && !data ? (
        <LoadingSkeleton type="cards" count={3} />
      ) : error ? (
        <ErrorState
          message="Unable to load the screening queue"
          description={error}
          onRetry={reload}
        />
      ) : candidates.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <p className="text-sm text-slate-500">
          {data?.webfeed?.candidates?.length
            ? 'No flagged candidates in the queue.'
            : 'No candidates yet. Run the web feed scan to populate the queue.'}
          </p>
          <button
            onClick={reload}
            className="mt-4 px-4 py-2 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <CandidateRow key={c.key} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}