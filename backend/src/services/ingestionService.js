// Ingestion — broker between the real provider pipeline and PostgreSQL.
// Persisting the fetched records makes PostgreSQL the durable snapshot that
// serves every read, even while providers are temporarily unreachable.

import { refreshOpportunities } from './refreshService.js';
import * as opportunityRepository from '../repositories/opportunityRepository.js';

export async function syncOpportunitiesFromProviders({ force = false } = {}) {
  const report = await refreshOpportunities({ force });
  return {
    synced: report.refreshed || 0,
    removed: report.removed || 0,
    skipped: Boolean(report.skipped),
    total: await opportunityRepository.count(),
  };
}