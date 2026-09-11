const TONES = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function ConfidenceBadge({ level = 'Unknown', tone = 'amber' }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${TONES[tone] || TONES.amber}`}
    >
      {level} confidence
    </span>
  );
}