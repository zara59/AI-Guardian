// Centralized HTTP client for the AI Guardian backend.
// Every page and hook talks to the API through this module only.

const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
).replace(/\/+$/, '');

export class ApiRequestError extends Error {
  constructor(message, { status, code, detail } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiRequestError(
      'Guardian is unreachable. Start the backend and try again.',
      { code: 'NETWORK_ERROR' },
    );
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new ApiRequestError(
      json?.error || `Request failed (HTTP ${res.status})`,
      { status: res.status, code: json?.code, detail: json },
    );
  }

  return json?.data ?? null;
}

export const api = {
  /** GET /api/opportunities?risk=&category=&chain=&minScore=&sort=&order=&limit= */
  getOpportunities(params) {
    return request('/api/opportunities', { params });
  },

  /** GET /api/opportunities/:id (numeric id or slug) */
  getOpportunity(idOrSlug) {
    return request(`/api/opportunities/${encodeURIComponent(idOrSlug)}`);
  },

  /** GET /api/opportunities/discovery — on-chain registry cursors + screening queue. */
  getDiscovery() {
    return request('/api/opportunities/discovery');
  },

  /** POST /api/rankings - deterministic personalized ranking */
  createRanking({ allocation, riskPreference }) {
    return request('/api/rankings', {
      method: 'POST',
      body: { allocation, riskPreference },
    });
  },

  /** GET /api/preferences */
  getPreferences() {
    return request('/api/preferences');
  },

  /** POST /api/preferences */
  savePreferences(patch) {
    return request('/api/preferences', { method: 'POST', body: patch });
  },

  /** GET /api/activities?limit= */
  getActivities(limit = 50) {
    return request('/api/activities', { params: { limit } });
  },

  /** GET /api/guardian/status */
  getGuardianStatus() {
    return request('/api/guardian/status');
  },

  /** GET /api/health */
  getHealth() {
    return request('/api/health');
  },

  /**
   * POST /api/transactions/prepare — risk-gated, server-derived execution
   * payload. Resolves to a prepared transaction object. Throws an
   * ApiRequestError (see .code) when the risk gate or registry refuses.
   */
  async prepareTransaction({ opportunityId, walletAddress, amount, type }) {
    const data = await request('/api/transactions/prepare', {
      method: 'POST',
      body: { opportunityId, walletAddress, amount, type },
    });
    return data.transaction;
  },

  /** GET /api/transactions/:prepareId — live preparation status. */
  async getTransactionStatus(prepareId) {
    const data = await request(`/api/transactions/${encodeURIComponent(prepareId)}`);
    return data.transaction;
  },

  /** POST /api/transactions/:prepareId/sign — record the wallet-signed hash. */
  async signTransaction(prepareId, { txHash, status = 'signed' }) {
    const data = await request(`/api/transactions/${encodeURIComponent(prepareId)}/sign`, {
      method: 'POST',
      body: { txHash, status },
    });
    return data.transaction;
  },

  /** POST /api/transactions/:prepareId/verify — on-chain verification result. */
  async verifyTransaction(prepareId) {
    const data = await request(`/api/transactions/${encodeURIComponent(prepareId)}/verify`, {
      method: 'POST',
    });
    return data.transaction;
  },

  /** GET /api/transactions — recent signed/confirmed records. */
  async listTransactions(limit = 20) {
    const data = await request('/api/transactions', { params: { limit } });
    return data.items;
  },

  /**
   * POST /api/workflows/prepare — create a deterministic workflow for review.
   * Phase 5 (KeeperHub execution).
   */
  async createWorkflow({ opportunityId, walletAddress, amount, type }) {
    const data = await request('/api/workflows/prepare', {
      method: 'POST',
      body: { opportunityId, walletAddress, amount, type },
    });
    return data.workflow;
  },

  /** POST /api/workflows/:workflowId/approve — user explicitly approves. */
  async approveWorkflow(workflowId) {
    const data = await request(
      `/api/workflows/${encodeURIComponent(workflowId)}/approve`,
      { method: 'POST' },
    );
    return data.workflow;
  },

  /** POST /api/workflows/:workflowId/execute — send approved workflow to KeeperHub. */
  async executeWorkflow(workflowId, approvalId) {
    const data = await request(
      `/api/workflows/${encodeURIComponent(workflowId)}/execute`,
      { method: 'POST', body: { approvalId } },
    );
    return data.workflow;
  },

  /** POST /api/workflows/:workflowId/execute-and-poll — send + poll to completion. */
  async executeAndPollWorkflow(workflowId, approvalId) {
    const data = await request(
      `/api/workflows/${encodeURIComponent(workflowId)}/execute-and-poll`,
      { method: 'POST', body: { approvalId } },
    );
    return data.workflow;
  },

  /** POST /api/workflows/:workflowId/poll — poll KeeperHub status. */
  async pollWorkflow(workflowId, maxAttempts = 12) {
    const data = await request(
      `/api/workflows/${encodeURIComponent(workflowId)}/poll`,
      { method: 'POST', body: { maxAttempts } },
    );
    return data.workflow;
  },

  /** POST /api/workflows/:workflowId/reconcile — independent blockchain verify. */
  async reconcileWorkflow(workflowId) {
    const data = await request(
      `/api/workflows/${encodeURIComponent(workflowId)}/reconcile`,
      { method: 'POST' },
    );
    return data;
  },

  /** GET /api/workflows — recent KeeperHub workflows. */
  async listWorkflows(limit = 20) {
    const data = await request('/api/workflows', { params: { limit } });
    return data.items;
  },
};

export default api;