import { ExternalLink } from 'lucide-react';
import { explorerTxUrl, shortAddress } from '../services/transactionStatus';

const STATUS_TONES = {
  prepared: 'bg-slate-100 text-slate-600',
  signed: 'bg-brand-50 text-brand-700',
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  rejected: 'bg-slate-100 text-slate-500',
  expired: 'bg-slate-100 text-slate-500',
};

export default function TransactionRow({ transaction }) {
  const link = transaction.txHash ? explorerTxUrl(transaction.chainId, transaction.txHash) : null;
  const tone = STATUS_TONES[transaction.status] || STATUS_TONES.prepared;

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold capitalize text-slate-900">{transaction.type}</span>
          <span className="text-xs text-slate-400">
            {transaction.amount?.human} {transaction.asset?.symbol}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          Vault {shortAddress(transaction.vault?.address)} · {transaction.chain}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${tone}`}>
          {transaction.status}
        </span>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
          >
            <ExternalLink size={12} />
            Tx
          </a>
        )}
      </div>
    </div>
  );
}