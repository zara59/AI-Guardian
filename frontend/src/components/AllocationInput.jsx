export default function AllocationInput({ amount, onAmountChange }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700 mb-2 flex items-center justify-between">
        <span>How much are you willing to allocate?</span>
      </label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
        <input
          type="text"
          inputMode="numeric"
          value={amount.toString()}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="100"
          className="w-full py-2.5 pl-8 pr-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
        />
      </div>
    </div>
  );
}