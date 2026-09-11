import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ErrorState({ message, description, onRetry }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
      <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <AlertTriangle size={24} className="text-red-500" />
      </div>
      <h3 className="text-base font-medium text-slate-900 mb-1">{message}</h3>
      <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed mb-5">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 transition-colors"
        >
          <RefreshCw size={16} />
          Try Again
        </button>
      )}
    </div>
  );
}
