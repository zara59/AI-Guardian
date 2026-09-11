import { ScanSearch, TrendingUp, Eye, Clock, ShieldCheck } from 'lucide-react';
import StatusBadge from './StatusBadge';

const typeConfig = {
  analyzed: { icon: ScanSearch, bg: "bg-blue-50 text-blue-600" },
  ranking: { icon: TrendingUp, bg: "bg-teal-50 text-teal-600" },
  review: { icon: Eye, bg: "bg-green-50 text-green-600" },
  alert: { icon: ShieldCheck, bg: "bg-amber-50 text-amber-600" },
  executed: { icon: Clock, bg: "bg-slate-100 text-slate-600" },
};

export default function ActivityItem({ activity }) {
  const config = typeConfig[activity.type] || typeConfig.analyzed;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${config.bg}`}>
        <config.icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <h3 className="text-sm font-medium text-slate-900">{activity.title}</h3>
          <StatusBadge status={activity.status} />
        </div>
        <p className="text-xs text-slate-500">{activity.description}</p>
      </div>
      <span className="text-xs text-slate-400 shrink-0">{activity.timestamp}</span>
    </div>
  );
}