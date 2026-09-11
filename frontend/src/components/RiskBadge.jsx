import { getRiskColor } from '../utils/formatting';

export default function RiskBadge({ risk }) {
  const colors = getRiskColor(risk);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
      {risk} Risk
    </span>
  );
}
