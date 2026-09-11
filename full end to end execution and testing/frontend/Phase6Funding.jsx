// Phase 6: execution-wallet funding status.
// Reads real on-chain balances and reports the honest classification.

import { useEffect, useState } from 'react';
import { Coins, Loader2, TriangleAlert } from 'lucide-react';
import { phase6Api } from '../api.js';

export default function Phase6Funding({ operation, amountRaw, token, vault, wallet }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    phase6Api
      .getFunding({
        operation: operation || 'deposit',
        amountRaw,
        tokenAddress: token,
        vaultAddress: vault,
        walletAddress: wallet,
      })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation, amountRaw, token, vault, wallet]);

  if (error) {
    return (
      <div className="text-xs text-red-300">
        <TriangleAlert className="mr-1 inline h-3 w-3" /> {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-xs text-muted-foreground">
        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Reading on-chain funding…
      </div>
    );
  }

  const ev = data.evidence || {};
  const rows = [
    ['state', data.state],
    ['Sepolia ETH', ev.nativeEth ?? 'unavailable'],
    ['token balance', ev.tokenBalanceHuman ?? 'unavailable'],
    ['vault allowance', ev.tokenAllowanceHuman ?? 'unavailable'],
  ];
  return (
    <div className="space-y-1 text-xs">
      <div className={data.ready ? 'text-emerald-300' : 'text-amber-200'}>
        <Coins className="mr-1 inline h-3 w-3" /> {data.state}
      </div>
      <div className="text-muted-foreground">{data.detail}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="w-28 shrink-0 text-muted-foreground">{k}</span>
          <span className="truncate">{v}</span>
        </div>
      ))}
    </div>
  );
}