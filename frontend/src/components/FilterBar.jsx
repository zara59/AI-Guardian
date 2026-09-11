export default function FilterBar({ filter, setFilter, loading, error }) {
  const filters = ["all", "low", "medium", "high-potential"];
  const labels = {
    all: "All",
    low: "Low Risk",
    medium: "Medium Risk",
    "high-potential": "High Potential"
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      {filters.map((f) => (
        <button
          key={f}
          onClick={() => setFilter(f)}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors duration-150 ${
            filter === f
              ? 'bg-brand-50 border-brand-200 text-brand-600'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {labels[f]}
        </button>
      ))}
      {(loading || error) && (
        <span className="text-xs text-slate-400 ml-auto">
          {loading ? "Loading..." : ""}
        </span>
      )}
    </div>
  );
}
