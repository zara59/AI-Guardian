import { getStatusConfig } from '../utils/formatting';

export default function StatusBadge({ status }) {
  const config = getStatusConfig(status);
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      {label}
    </span>
  );
}
