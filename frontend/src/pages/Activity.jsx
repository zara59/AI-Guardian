import Header from '../components/Header';
import ActivityItem from '../components/ActivityItem';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import TransactionRow from '../components/TransactionRow';
import { useActivities } from '../hooks/useActivities';
import { useTransactions } from '../hooks/useTransactions';

export default function Activity() {
  const { items, loading, error, reload } = useActivities(50);
  const tx = useTransactions(20);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <Header title="Activity" subtitle="Guardian history: rankings, reviews, alerts and wallet-signed transactions." />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button
          onClick={() => {
            reload();
            tx.reload();
          }}
          className="px-3.5 py-1.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
        >
          Refresh
        </button>
        <span className="text-xs text-slate-400">
          Live records from the backend.
        </span>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">Wallet transactions</h2>
          <span className="text-xs text-slate-400">Signed with your wallet · verified on-chain</span>
        </div>
        {tx.loading && tx.items.length === 0 ? (
          <LoadingSkeleton type="list" count={3} />
        ) : tx.error ? (
          <ErrorState
            message="Unable to load transactions"
            description="Guardian couldn't retrieve the transaction records."
            onRetry={tx.reload}
          />
        ) : tx.items.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Risk-gated preparations you approved and signed will appear here."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {tx.items.map((item) => (
              <TransactionRow key={item.prepareId} transaction={item} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        {loading && items.length === 0 ? (
          <LoadingSkeleton type="list" count={4} />
        ) : error ? (
          <ErrorState
            message="Unable to load activity"
            description="Guardian couldn't retrieve the latest activity records."
            onRetry={reload}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Guardian activity and audit records will appear here once workflows are executed."
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <ActivityItem key={item.id} activity={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}