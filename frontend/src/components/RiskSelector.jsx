import { ShieldCheck, AlertTriangle } from 'lucide-react';

const options = [
  { id: "conservative", label: "Conservative", icon: ShieldCheck, color: "green" },
  { id: "moderate", label: "Moderate", icon: AlertTriangle, color: "amber" },
  { id: "aggressive", label: "Aggressive", icon: ShieldCheck, color: "red" },
];

export default function RiskSelector({ value, onChange }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-2.5">Risk preference</p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => {
          const selected = value === opt.id;
          const colorMap = {
            green: selected ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 hover:border-slate-300 text-slate-600",
            amber: selected ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 hover:border-slate-300 text-slate-600",
            red: selected ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 hover:border-slate-300 text-slate-600",
          };
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors duration-150 ${colorMap[opt.color]}`}
            >
              <span className="flex flex-col items-center gap-1.5">
                <opt.icon size={16} />
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}