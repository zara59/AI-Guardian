// Phase 6: frontend API surface for readiness/funding/state/reconciliation.
// All calls hit the same backend the rest of the app uses. No secrets live
// here — the API key never leaves the server.

const BASE = '/api/phase6';

async function get(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== ''),
  ).toString();
  const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || data?.message || `request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data.data ?? data;
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || data?.message || `request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data.data ?? data;
}

export const phase6Api = {
  getReadiness: () => get('/readiness'),
  getFunding: (opts = {}) => get('/funding', opts),
  getVaultState: (owner) => get('/vault-state', { owner }),
  getStates: () => get('/states'),
  getWorkflowState: (workflowId) => get(`/state/${encodeURIComponent(workflowId)}`),
  reconcileWorkflow: (workflowId) => post(`/reconcile/${encodeURIComponent(workflowId)}`),
  reconcileStuck: () => post('/reconcile/stuck'),
  getAudit: () => get('/audit'),
};

export default phase6Api;