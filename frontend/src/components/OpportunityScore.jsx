import { getScoreColor, getScoreLabel } from '../utils/scoring';

export default function OpportunityScore({ score, size = "default" }) {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);

  const sizes = {
    small: { circle: "w-14 h-14", text: "text-lg", ring: "3" },
    default: { circle: "w-20 h-20", text: "text-2xl", ring: "4" },
    large: { circle: "w-28 h-28", text: "text-3xl", ring: "5" },
  };

  const s = sizes[size];
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`${s.circle} relative`}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#E2E8F0" strokeWidth={s.ring} />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke={color}
            strokeWidth={s.ring}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${s.text} font-bold text-slate-900`}>{score}</span>
        </div>
      </div>
      {size !== "small" && (
        <span className="text-xs font-medium text-slate-500">{label}</span>
      )}
    </div>
  );
}
