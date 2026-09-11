import { useState } from 'react';
import Header from '../components/Header';
import OpportunityList from '../components/OpportunityList';
import OpportunityDetail from '../components/OpportunityDetail';
import { useOpportunities } from '../hooks/useOpportunities';
import { relativeTime } from '../services/mapping';

export default function Opportunities() {
  const { opportunities, loading, error, reload, updatedAt } = useOpportunities();
  const [selected, setSelected] = useState(null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <Header title="Opportunities" subtitle="All Web3 opportunities discovered by Guardian, ranked by risk and potential." />

      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm font-medium text-slate-500">
            Showing {opportunities.length} ranked opportunities
          </span>
          <span className="mx-1 text-slate-300">•</span>
          <span className="text-sm font-medium text-slate-500">
            Sorted by overall score
          </span>
          <span className="mx-1 text-slate-300">•</span>
          <span className="text-sm font-medium text-slate-500">
            Updated: {relativeTime(updatedAt)}
          </span>
          <button
            onClick={reload}
            className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50"
          >
            Refresh
          </button>
        </div>
        <OpportunityList
          opportunities={opportunities}
          loading={loading}
          error={error}
          onView={setSelected}
          onRetry={reload}
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900 mb-5">Guardian ranking methodology</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">How scores are calculated</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              The backend scores each opportunity across five factors: security,
              potential, sustainability, liquidity and user fit. The weighted result
              produces the final 0–100 rank.
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Score ranges</h3>
            <ul className="space-y-1.5 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" /> 80–100: Strong Candidate
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> 65–79: Worth Considering
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500" /> 45–64: High Caution
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" /> 0–44: Avoid
              </li>
            </ul>
          </div>
        </div>
      </section>

      <OpportunityDetail opportunity={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}