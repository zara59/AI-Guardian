// Request-time validation for routes that accept a path id.
// Accepts a numeric id or a slug so both /api/opportunities/3 and
// /api/opportunities/ethereum-staking resolve.
export function parseOpportunityId(raw) {
  if (/^\d+$/.test(raw)) {
    return Promise.resolve({ id: Number(raw) });
  }
  return Promise.resolve({ slug: raw });
}