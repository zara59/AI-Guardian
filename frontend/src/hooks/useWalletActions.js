// Phase 4 code lives in the security layer.
// This path is kept as a re-export seam so Phase 1-3 imports keep working.
export * from '../../../security-layer/frontend/hooks/useWalletActions.js';
export { default } from '../../../security-layer/frontend/hooks/useWalletActions.js';