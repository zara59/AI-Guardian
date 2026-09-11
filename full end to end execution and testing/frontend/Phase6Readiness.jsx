// Phase 6: Guard rails status panel.
//
// Tells the user the REAL readiness state of the system — deployment,
// KeeperHub authentication and execution-wallet funding — never a claim.

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, Wallet, KeyRound, Layers } from 'lucide-react';
import { phase6Api } from '../api.js';

export default function Phase6Readiness() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    phase6Api
      .getReadiness()
      .then((r) => alive && setReport(r))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking execution readiness…
      </div>
    );
  }
  if (error || !report) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
        <ShieldAlert className="mr-2 inline h-4 w-4" />
        Readiness check unavailable: {error || 'no data'}
      </div>
    );
  }

  const rows = [
    {
      icon: Layers,
      label: 'Sepolia deployment',
      ok: report.deployment?.deployed === true,
      detail: report.deployment?.deployed
        ? `Vault ${report.deployment.artifact?.vault?.slice(0, 10)}… · bytecode verified`
        : report.deployment?.reason || 'not deployed',
    },
    {
      icon: KeyRound,
      label: 'KeeperHub key',
      ok: report.keeperhub?.authenticated === true,
      detail: report.keeperhub?.authenticated
        ? 'authenticated'
        : report.keeperhub?.error || 'not configured',
    },
    {
      icon: Wallet,
      label: 'Execution wallet',
      ok: report.funding?.ready === true,
      detail: report.funding?.state
        ? `${report.funding.state} — ${report.funding.detail || ''}`.replace(/\s+/g, ' ').trim()
        : 'funding not verified',
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {report.ready ? (
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-amber-400" />
        )}
        {report.ready ? 'Ready for controlled execution' : 'Not ready to execute'}
      </div>
      {report.blockers?.length > 0 && (
        <ul className="text-xs text-amber-200/90">
          {report.blockers.map((b, i) => (
            <li key={i}>· {b}</li>
          ))}
        </ul>
      )}
      {rows.map((r) => (
        <div key={r.label} className="flex items-start gap-2 text-xs">
          <r.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="w-32 shrink-0 text-muted-foreground">{r.label}</span>
          <span className={r.ok ? 'text-emerald-300' : 'text-amber-200'}>{r.detail}</span>
        </div>
      ))}
    </div>
  );
}