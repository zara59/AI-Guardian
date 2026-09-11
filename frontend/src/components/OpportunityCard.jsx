import OpportunityScore from './OpportunityScore';
import RiskBadge from './RiskBadge';
import ConfidenceBadge from './ConfidenceBadge';
import { relativeTime } from '../services/mapping';
import { Search, Ban } from 'lucide-react';

export default function OpportunityCard({ opportunity, onView }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md transition-shadow duration-200 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-lg font-bold text-slate-600">#{opportunity.rank}</span>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">{opportunity.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-500">{opportunity.category}</span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500">{opportunity.protocol || opportunity.chain || ''}</span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500">
                Real {opportunity.apyType || 'yield'} APY {opportunity.apy}
              </span>
            </div>
          </div>
        </div>
        <OpportunityScore score={opportunity.score} size="small" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <RiskBadge risk={opportunity.risk} />
        <ConfidenceBadge level={opportunity.confidence} tone={opportunity.confidenceTone} />
        {opportunity.source === 'onchain' && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            On-chain · self-registered
          </span>
        )}
        {opportunity.tvl && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
            TVL: {opportunity.tvl}
          </span>
        )}
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
          Liquidity: {opportunity.liquidity}
        </span>
        {opportunity.chain !== opportunity.protocol && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
            {opportunity.chain}
          </span>
        )}
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
          Min: {opportunity.minimumAllocation}
        </span>
      </div>

      {opportunity.blocked && opportunity.blockReason && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <Ban size={14} className="shrink-0 mt-0.5" />
          <span>{opportunity.blockReason}</span>
        </div>
      )}

      <p className="text-sm text-slate-600 leading-relaxed">{opportunity.description}</p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
        <p className="text-xs font-medium text-slate-500 mb-1">Why Guardian ranked this #{opportunity.rank}</p>
        <p className="text-sm text-slate-700 leading-relaxed">{opportunity.whyGuardianLikesIt}</p>
      </div>

      <p className="text-xs text-slate-400">
        Updated {relativeTime(opportunity.lastUpdated)} · {(opportunity.dataSources || []).length} live data source{opportunity.dataSources?.length === 1 ? '' : 's'}
      </p>

      <button
        onClick={() => onView(opportunity)}
        className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-brand-200 text-brand-600 rounded-xl text-sm font-medium hover:bg-brand-50 transition-colors duration-150"
      >
        <Search size={16} />
        View Analysis
      </button>
    </div>
  );
}
