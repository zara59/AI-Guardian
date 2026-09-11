import WalletConnect from './WalletConnect';

export default function Header({ title, subtitle }) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
      <div className="pl-12 lg:pl-0">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        )}
      </div>
      <WalletConnect />
    </header>
  );
}