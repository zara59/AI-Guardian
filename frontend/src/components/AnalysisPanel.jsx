import { ShieldCheck, AlertTriangle, ListChecks } from 'lucide-react';

export default function AnalysisPanel({ opportunity }) {
  const sections = [
    {
      icon: ShieldCheck,
      title: "Why Guardian likes this opportunity",
      description: opportunity.whyGuardianLikesIt,
      accent: "bg-teal-50 text-teal-600",
      border: "border-teal-100"
    }
  ];

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <div key={section.title} className={`bg-white border ${section.border} rounded-xl p-4`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${section.accent}`}>
              <section.icon size={16} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-1">{section.title}</h4>
              <p className="text-sm text-slate-600 leading-relaxed">{section.description}</p>
            </div>
          </div>
        </div>
      ))}

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-amber-50 text-amber-500">
            <AlertTriangle size={16} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-2">What could go wrong?</h4>
            <ul className="space-y-1.5">
              {opportunity.risks.map((risk) => (
                <li key={risk.title} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="w-1 h-1 bg-amber-400 rounded-full mt-1.5 shrink-0"></span>
                  <span>
                    <strong className="font-medium text-slate-700">{risk.title}: </strong>
                    {risk.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-brand-50 text-brand-600">
            <ListChecks size={16} />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">What you would need</h4>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Minimum allocation</span>
                <span className="font-medium text-slate-900">{opportunity.minimumAllocation}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Risk level</span>
                <span className="font-medium text-slate-900">{opportunity.risk} Risk</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Expected interaction</span>
                <span className="font-medium text-slate-900">{opportunity.expectedInteraction}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}