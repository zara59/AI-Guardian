import OpportunityScore from './OpportunityScore';
import RiskBadge from './RiskBadge';
import ConfidenceBadge from './ConfidenceBadge';
import AnalysisPanel from './AnalysisPanel';
import AllocationInput from './AllocationInput';
import RiskSelector from './RiskSelector';
import ApprovalPreview from './ApprovalPreview';
import Modal from './Modal';
import { useAllocation } from '../hooks/useAllocation';
import { relativeTime } from '../services/mapping';
import { Ban, ShieldCheck, ShieldQuestion, ExternalLink } from 'lucide-react';

const EXPLORERS = {
  11155111: 'https://sepolia.etherscan.io',
};

function explorerBase(chainId) {
  return EXPLORERS[chainId] || 'https://etherscan.io';
}

function BreakdownRow({ label, value, max, color }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-slate-600 shrink-0 w-28">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-medium text-slate-900 shrink-0">{value} / {max}</span>
    </div>
  );
}

export default function OpportunityDetail({ opportunity, open, onClose }) {
  const { amount, riskPreference, handleAmountChange, handleRiskChange } = useAllocation();

  if (!opportunity) return null;

  const { breakdown, maxBreakdown } = opportunity;
  const totalScore = breakdown.security + breakdown.potential + breakdown.sustainability + breakdown.liquidity + breakdown.userFit;

  return (
    <Modal open={open} onClose={onClose} title={opportunity.name} maxWidth="max-w-3xl">
      <div className="space-y-6">
        {opportunity.blocked && opportunity.blockReason && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <Ban size={16} className="shrink-0 mt-0.5" />
            <span>
              <strong className="font-medium">Guardian blocks this opportunity.</strong>{" "}
              {opportunity.blockReason}
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-slate-500">#{opportunity.rank} Ranked</span>
              <span className="text-slate-300">•</span>
              <span className="text-sm text-slate-500">{opportunity.category}</span>
              <span className="text-slate-300">•</span>
              <span className="text-sm text-slate-500">{opportunity.protocol}</span>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">{opportunity.name}</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <RiskBadge risk={opportunity.risk} />
              <ConfidenceBadge level={opportunity.confidence} tone={opportunity.confidenceTone} />
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white text-slate-600 border border-slate-200">
                Real {opportunity.apyType} APY {opportunity.apy}
              </span>
              {opportunity.tvl && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white text-slate-600 border border-slate-200">
                  TVL {opportunity.tvl}
                </span>
              )}
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white text-slate-600 border border-slate-200">
                Liquidity: {opportunity.liquidity}
              </span>
            </div>
          </div>
          <OpportunityScore score={totalScore} size="large" />
        </div>

        {opportunity.contractAddress && (
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
            {opportunity.securityStatus === 'verification-incomplete' ? (
              <ShieldQuestion size={14} className="shrink-0 text-amber-500" />
            ) : (
              <ShieldCheck size={14} className="shrink-0 text-green-500" />
            )}
            <span>
              <strong className="font-medium text-slate-600">On-chain inspection:</strong>{" "}
              {opportunity.securityStatus === 'verification-incomplete'
                ? 'contract found but full verification incomplete'
                : 'contract verified present on-chain'}{' '}
              · {opportunity.asset} on {opportunity.chain}
            </span>
            <a
              href={`${explorerBase(opportunity.chainId)}/address/${opportunity.contractAddress}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-brand-600 hover:text-brand-700"
            >
              View on chain explorer <ExternalLink size={12} />
            </a>
          </div>
        )}

        {opportunity.source === 'onchain' && (
          <div className="text-xs text-slate-500 bg-white border border-emerald-200 rounded-xl px-4 py-3 space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="shrink-0 text-emerald-600" />
              <strong className="font-medium text-slate-600">Discovered on-chain via GuardianRegistry</strong>
            </div>
            <p className="leading-relaxed">
              This opportunity registered itself on-chain and Guardian re-validated the
              strategy interface, vault wiring and token shape by reading the chain. No third-party
              aggregator is involved; yield comes from Guardian's own share-price sampling.
            </p>
            {opportunity.registeredAt && (
              <p>Registered {new Date(Number(opportunity.registeredAt) * 1000).toLocaleDateString()}</p>
            )}
            {opportunity.strategyAddress && (
              <a
                href={`${explorerBase(opportunity.chainId)}/address/${opportunity.strategyAddress}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800"
              >
                Strategy contract <ExternalLink size={12} />
              </a>
            )}
            {opportunity.metadataUri && (
              <a
                href={opportunity.metadataUri}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800"
              >
                Project page <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Live data provenance</h4>
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-500">Confidence</span>
                <div className="mt-1"><ConfidenceBadge level={opportunity.confidence} tone={opportunity.confidenceTone} /></div>
              </div>
              <div>
                <span className="text-slate-500">Refreshed</span>
                <p className="font-medium text-slate-800">{relativeTime(opportunity.lastUpdated)}</p>
              </div>
              <div>
                <span className="text-slate-500">Eligibility</span>
                <p className="font-medium capitalize text-slate-800">{opportunity.eligibility}</p>
                {opportunity.eligibilityReason && (
                  <p className="text-xs text-slate-400">{opportunity.eligibilityReason}</p>
                )}
              </div>
              <div>
                <span className="text-slate-500">Data sources</span>
                <ul className="mt-0.5 space-y-0.5">
                  {opportunity.dataSources.map((src) => (
                    <li key={src.provider} className="text-xs text-slate-600">
                      {src.provider} · {src.type}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Score breakdown</h4>
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <BreakdownRow label="Security" value={breakdown.security} max={maxBreakdown.security} color="bg-brand-500" />
            <BreakdownRow label="Potential" value={breakdown.potential} max={maxBreakdown.potential} color="bg-teal-500" />
            <BreakdownRow label="Sustainability" value={breakdown.sustainability} max={maxBreakdown.sustainability} color="bg-blue-500" />
            <BreakdownRow label="Liquidity" value={breakdown.liquidity} max={maxBreakdown.liquidity} color="bg-green-500" />
            <BreakdownRow label="User Fit" value={breakdown.userFit} max={maxBreakdown.userFit} color="bg-amber-500" />
            <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Total</span>
              <span className="text-lg font-bold text-slate-900">{totalScore} / 100</span>
            </div>
          </div>
        </div>

        <AnalysisPanel opportunity={opportunity} />

        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Your Allocation</h4>
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <AllocationInput amount={amount} onAmountChange={handleAmountChange} />
            <RiskSelector value={riskPreference} onChange={handleRiskChange} />
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-500 mb-1">Current summary</p>
              <p className="text-sm text-slate-900">
                Allocating <strong>{"$" + amount.toLocaleString()}</strong> with a{" "}
                <strong className="capitalize">{riskPreference}</strong> strategy
              </p>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Approval Flow</h4>
          <ApprovalPreview opportunity={opportunity} amount={amount} riskPreference={riskPreference} />
        </div>
      </div>
    </Modal>
  );
}