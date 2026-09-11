import { Inbox } from 'lucide-react';

export default function EmptyState({ title, description }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Inbox size={24} className="text-slate-400" />
      </div>
      <h3 className="text-base font-medium text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">{description}</p>
    </div>
  );
}
