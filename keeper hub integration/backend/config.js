// Phase 5: KeeperHub configuration.
//
// All KeeperHub settings are read from environment variables and validated
// once at startup. The API key NEVER leaves this module — callers receive
// a frozen config object without the raw key.

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function optionalEnv(name, fallback = undefined) {
  return process.env[name] || fallback;
}

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
}

let _config = null;

export function loadConfig() {
  if (_config) return _config;

  const apiKey = optionalEnv('KEEPERHUB_API_KEY', '');
  const baseUrl = optionalEnv('KEEPERHUB_BASE_URL', 'https://app.keeperhub.com');
  const walletAddress = optionalEnv('KEEPERHUB_WALLET_ADDRESS', '');
  const simulateFirst = optionalEnv('KEEPERHUB_SIMULATE_FIRST', 'true') === 'true';
  const pollMaxAttempts = Number(optionalEnv('KEEPERHUB_POLL_MAX_ATTEMPTS', '30'));
  const pollIntervalMs = Number(optionalEnv('KEEPERHUB_POLL_INTERVAL_MS', '5000'));

  // Phase 6 policy: when execution is REQUIRED but no key is present, do NOT
  // silently settle for direct execution. Reported as mode 'blocked' so the
  // workflow layer can refuse with a clear, honest error.
  const executionRequired = envFlag('KEEPERHUB_EXECUTION_REQUIRED', false);

  _config = Object.freeze({
    apiKey,
    apiKeyPresent: typeof apiKey === 'string' && apiKey.length > 0 && apiKey.startsWith('kh_'),
    baseUrl: baseUrl.replace(/\/+$/, ''),
    walletAddress: walletAddress.toLowerCase(),
    walletAddressValid: !walletAddress || ADDRESS_RE.test(walletAddress),
    simulateFirst,
    pollMaxAttempts: Math.max(1, Math.min(100, pollMaxAttempts)),
    pollIntervalMs: Math.max(1000, Math.min(60000, pollIntervalMs)),
    executionRequired,
    executionMode: apiKey ? 'keeperhub' : executionRequired ? 'blocked' : 'direct',
  });

  return _config;
}

export function getConfig() {
  if (!_config) return loadConfig();
  return _config;
}

export function resetConfig() {
  _config = null;
}
