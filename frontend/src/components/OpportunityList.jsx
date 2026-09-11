import OpportunityCard from './OpportunityCard';
import EmptyState from './EmptyState';
import LoadingSkeleton from './LoadingSkeleton';
import ErrorState from './ErrorState';

export default function OpportunityList({ opportunities, loading, error, onView, onRetry }) {
  if (loading) {
    return <LoadingSkeleton type="cards" count={3} />;
  }

  if (error) {
    return <ErrorState message="Unable to load opportunities" description="Guardian couldn't retrieve the latest opportunity data." onRetry={onRetry} />;
  }

  if (!opportunities.length) {
    return <EmptyState title="No opportunities available" description="Guardian will display opportunities here when data sources are connected." />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {opportunities.map((o) => (
        <OpportunityCard key={o.id} opportunity={o} onView={onView} />
      ))}
    </div>
  );
}
