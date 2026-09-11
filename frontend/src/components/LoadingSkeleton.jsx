export default function LoadingSkeleton({ type = "cards", count = 3 }) {
  if (type === "cards") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-100 rounded-xl animate-pulse"></div>
                <div className="space-y-2">
                  <div className="w-32 h-4 bg-slate-100 rounded animate-pulse"></div>
                  <div className="w-24 h-3 bg-slate-100 rounded animate-pulse"></div>
                </div>
              </div>
              <div className="w-14 h-14 bg-slate-100 rounded-full animate-pulse"></div>
            </div>
            <div className="space-y-2">
              <div className="h-2.5 bg-slate-200 rounded-full w-full animate-pulse"></div>
              <div className="h-2.5 bg-slate-200 rounded-full w-3/4 animate-pulse"></div>
              <div className="h-2.5 bg-slate-200 rounded-full w-1/2 animate-pulse"></div>
            </div>
            <div className="pt-3">
              <div className="h-9 w-full bg-brand-50 rounded-xl animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "text") {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-3.5 bg-slate-200 rounded w-full animate-pulse"></div>
        ))}
      </div>
    );
  }

  if (type === "list") {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-100 rounded-xl animate-pulse"></div>
            <div className="flex-1 space-y-2">
              <div className="w-1/2 h-3.5 bg-slate-200 rounded animate-pulse"></div>
              <div className="w-1/3 h-3 bg-slate-100 rounded animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
