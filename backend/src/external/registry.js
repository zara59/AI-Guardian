// Loads and validates the opportunity registry from Web3 Data/opportunities.json.
// Registry entries define REAL opportunities (real contracts, real provider
// pool ids). Nothing here is invented; registry drift is rejected loudly.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateOpportunityDefinition } from './normalizers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, '../../../Web3 Data/opportunities.json');

let cached = null;

export async function loadOpportunityDefinitions() {
  if (cached) return cached;

  const raw = JSON.parse(await readFile(REGISTRY_PATH, 'utf8'));
  const defs = (raw?.opportunities || []).map(validateOpportunityDefinition);
  if (!defs.length) {
    throw new Error('opportunities.json must define at least one opportunity');
  }
  cached = defs;
  return cached;
}

export async function getOpportunityDefinition(slug) {
  const defs = await loadOpportunityDefinitions();
  return defs.find((d) => d.slug === slug) || null;
}