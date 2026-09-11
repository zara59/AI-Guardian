import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { decodeError } from '../services/transactionStatus';

export const PHASES = {
  idle: 'idle',
  preparing: 'preparing',
  prepared: 'prepared',
  approving: 'approving',
  awaitingApproval: 'awaitingApproval',
  signing: 'signing',
  signed: 'signed',
  awaitingConfirmation: 'awaitingConfirmation',
  verifying: 'verifying',
  verified: 'verified',
  failed: 'failed',
};

const BUSY_PHASES = new Set([
  PHASES.preparing,
  PHASES.approving,
  PHASES.awaitingApproval,
  PHASES.signing,
  PHASES.signed,
  PHASES.awaitingConfirmation,
  PHASES.verifying,
]);

/**
 * Phase 4 transaction state machine.
 *
 * The backend PREPARES a risk-gated, server-derived transaction (targets never
 * come from the client); the wallet SIGNS and submits it; the backend VERIFIES
 * the receipt plus the resulting vault state.
 *
 * `walletActions` is injected (see useWalletActions) so this hook is pure of
 * wagmi and fully testable.
 */
export function useTransaction(opportunity, walletActions = {}) {
  const [phase, setPhase] = useState(PHASES.idle);
  const [transaction, setTransaction] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [approval, setApproval] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [verification, setVerification] = useState(null);
  const [error, setError] = useState(null);
  const busyRef = useRef(false);

  const opportunityId = opportunity?.id;
  const walletAddress = walletActions.address;

  const prepare = useCallback(
    async ({ amount, type = 'deposit' } = {}) => {
      if (busyRef.current || !walletAddress) return;
      busyRef.current = true;
      setPhase(PHASES.preparing);
      setError(null);
      setWarnings([]);
      try {
        const tx = await api.prepareTransaction({
          opportunityId,
          walletAddress,
          amount: String(amount),
          type,
        });
        setTransaction(tx);
        setWarnings(tx.warnings || []);

        let needed = false;
        if (tx.type === 'deposit' && walletActions.allowance) {
          try {
            const current = await walletActions.allowance({
              token: tx.asset.address,
              spender: tx.vault.address,
            });
            needed = current < BigInt(tx.amount.raw);
          } catch {
            needed = true;
          }
        }
        setApproval({ needed });
        setPhase(PHASES.prepared);
      } catch (e) {
        setError(decodeError(e));
        setPhase(PHASES.failed);
      } finally {
        busyRef.current = false;
      }
    },
    [opportunityId, walletAddress, walletActions],
  );

  const execute = useCallback(async () => {
    if (busyRef.current || !transaction || !walletActions.walletConnected) {
      return;
    }
    busyRef.current = true;
    setError(null);
    try {
      if (walletActions.ensureChain) {
        await walletActions.ensureChain(transaction.chainId);
      }

      if (transaction.type === 'deposit') {
        const current = await walletActions.allowance({
          token: transaction.asset.address,
          spender: transaction.vault.address,
        });
        if (current < BigInt(transaction.amount.raw)) {
          setPhase(PHASES.approving);
          const approveHash = await walletActions.approve({
            token: transaction.asset.address,
            spender: transaction.vault.address,
          });
          setApproval({ needed: true, hash: approveHash });
          setPhase(PHASES.awaitingApproval);
          const approveReceipt = await walletActions.waitForTx(approveHash);
          setApproval((prev) => ({ ...prev, receipt: approveReceipt }));
          if (approveReceipt.status !== 'success') {
            throw new Error('Token approval reverted on-chain.');
          }
        }
      }

      setPhase(PHASES.signing);
      const hash = await walletActions.send(transaction.tx);
      setTxHash(hash);
      await api.signTransaction(transaction.prepareId, {
        txHash: hash,
        status: 'signed',
      });
      setPhase(PHASES.signed);

      setPhase(PHASES.awaitingConfirmation);
      const confirmedReceipt = await walletActions.waitForTx(hash);
      setReceipt(confirmedReceipt);
      if (confirmedReceipt.status !== 'success') {
        throw new Error('The transaction reverted on-chain.');
      }

      setPhase(PHASES.verifying);
      const verdict = await api.verifyTransaction(transaction.prepareId);
      setVerification(verdict);
      setPhase(PHASES.verified);
    } catch (e) {
      setError(decodeError(e));
      setPhase(PHASES.failed);
    } finally {
      busyRef.current = false;
    }
  }, [transaction, walletActions]);

  const reset = useCallback(() => {
    setPhase(PHASES.idle);
    setTransaction(null);
    setWarnings([]);
    setApproval(null);
    setTxHash(null);
    setReceipt(null);
    setVerification(null);
    setError(null);
  }, []);

  useEffect(() => {
    reset();
  }, [walletAddress, reset]);

  return {
    transaction,
    warnings,
    approval,
    txHash,
    receipt,
    verification,
    phase,
    error,
    needsApproval: approval?.needed === true,
    isBusy: BUSY_PHASES.has(phase),
    prepare,
    execute,
    reset,
  };
}

export default useTransaction;