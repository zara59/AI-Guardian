import { useState } from 'react';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import OpportunityList from '../components/OpportunityList';
import OpportunityDetail from '../components/OpportunityDetail';
import FilterBar from '../components/FilterBar';
import { useOpportunities } from '../hooks/useOpportunities';
import { getGreeting } from '../utils/formatting';
import { Compass, ShieldCheck, TrendingDown } from 'lucide-react';

export default function Dashboard() {
  const { opportunities, filter, setFilter, loading, error, stats, reload } = useOpportunities();
  const [selected, setSelected] = useState(null);

  const handleView = (opp) => setSelected(opp);

  const statCards = [
    { label: "Opportunities Found", value: String(stats.total), icon: Compass, color: "brand" },
    { label: "High Confidence", value: String(stats.highConfidence), icon: ShieldCheck, color: "teal" },
    { label: "Average Risk", value: stats.averageRisk, icon: TrendingDown, color: "green" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <Header title={getGreeting()} subtitle="Your Web3 opportunities, ranked and explained." />

      <section className="bg-gradient-to-br from-white to-blue-50 border border-slate-200 rounded-2xl p-6 sm:p-8 mb-8">
        <div className="mb-8">
          <h2 className="text-2xl sm:text-[28px] font-bold text-slate-900 mb-2">Your Web3 command center</h2>
          <p className="text-sm sm:text-base text-slate-500 max-w-xl">
            Discover opportunities, understand the risks, and make informed decisions before moving your assets.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statCards.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Top Opportunities</h2>
            <p className="text-sm text-slate-500 mt-1">
              Ranked by security, potential, liquidity and how well they fit your preferences.
            </p>
          </div>
        </div>
        <FilterBar filter={filter} setFilter={setFilter} loading={loading} error={error} />
        <OpportunityList
          opportunities={opportunities}
          loading={loading}
          error={error}
          onView={handleView}
          onRetry={reload}
        />
      </section>

      <OpportunityDetail opportunity={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}