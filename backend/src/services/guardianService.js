import { checkDatabaseConnection } from '../config/db.js';
import { isCacheAvailable } from '../cache/redisClient.js';

// Guardian protection module statuses. In later phases these reflect real
// connected services; today they are configuration-level statuses.
const MODULES = [
  {
    id: 'wallet-monitoring',
    name: 'Wallet Monitoring',
    status: 'ready',
    description: 'Continuously monitor wallet activity for unusual patterns.',
  },
  {
    id: 'suspicious-activity',
    name: 'Suspicious Activity Detection',
    status: 'ready',
    description: 'Identify unusual transactions, approvals and signatures.',
  },
  {
    id: 'transaction-review',
    name: 'Transaction Review',
    status: 'ready',
    description: 'Review each transaction before any execution is approved.',
  },
  {
    id: 'keeperhub-execution',
    name: 'KeeperHub Execution',
    status: 'connected',
    description: 'Automated execution of approved workflows via KeeperHub controlled on-chain execution.',
  },
];

export async function getProtectionStatus() {
  let database = 'unavailable';
  let cache = 'unavailable';
  try {
    await checkDatabaseConnection();
    database = 'available';
  } catch {
    database = 'unavailable';
  }
  if (await isCacheAvailable()) {
    cache = 'available';
  }

  return {
    protection: 'active',
    warning: 'Visual status only. Monitoring and execution backends are connected in later phases.',
    modules: MODULES,
    infrastructure: { database, cache },
  };
}