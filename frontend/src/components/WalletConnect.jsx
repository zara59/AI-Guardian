import { Wallet, LogOut, Loader2 } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { shortAddress } from '../services/transactionStatus';

/**
 * Connect/disconnect control used in the header and the execution flows.
 * Connected state shows the shortened address plus the active chain.
 */
export default function WalletConnect() {
  const { address, isConnected, isConnecting, chainName, connect, disconnect } = useWallet();

  if (isConnecting) {
    return (
      <span className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-500 self-start sm:self-auto">
        <Loader2 size={16} className="animate-spin" />
        Connecting…
      </span>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 self-start sm:self-auto">
        <span
          className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700"
          title={`Connected · ${chainName || 'unknown chain'}`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {shortAddress(address)}
        </span>
        <button
          onClick={disconnect}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          title="Disconnect wallet"
        >
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      className="flex items-center gap-2 px-4 py-2.5 bg-white border border-brand-200 text-brand-600 rounded-xl text-sm font-medium hover:bg-brand-50 transition-colors duration-150 self-start sm:self-auto"
    >
      <Wallet size={16} />
      Connect Wallet
    </button>
  );
}