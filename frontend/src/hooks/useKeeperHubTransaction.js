// Phase 5: KeeperHub transaction hook.
//
// State machine for the full Phase 5 flow:
//
//  idle → reviewing → approved → submitting → keeperhub_executing →
//    tx_pending → blockchain_confirmed → state_verified → complete
//    → failed
//
// Unlike Phase 4's useTransaction, this hook does NOT sign with the wallet.
// KeeperHub's non-custodial wallet executes the approved workflow. The user's
// only actions are: review, approve, and send to KeeperHub.

import { useCallback, useRef, useState } from 'react';
import api from '../services/api';
import { decodeError } from '../services/transactionStatus.js';

export const KH_PHASES = {
  idle: 'idle',
  preparing: 'preparing',
  reviewing: 'reviewing',
  approving: 'approving',
  approved: 'approved',
  submitting: 'submitting',
  keeperhubExecuting: 'keeperhub_executing',
  txPending: 'tx_pending',
  verifying: 'verifying',
  verified: 'verified',
  complete: 'complete',
  failed: 'failed',
};

const BUSY = new Set([
  KH_PHASES.preparing,
  KH_PHASES.approving,
  KH_PHASES.submitting,
  KH_PHASES.keeperhubExecuting,
  KH_PHASES.txPending,
  KH_PHASES.verifying,
]);

/**
 * Phase 5 KeeperHub execution state machine.
 *
 * The backend PREPARES a deterministic workflow (server-derived targets);
 * the user REVIEWS and APPROVES it; the backend SUBMITS the approved
 * workflow to KeeperHub; KeeperHub EXECUTES on Sepolia; the backend
 * VERIFIES the blockchain result.
 */
export function useKeeperHubTransaction(opportunity) {
  const [phase, setPhase] = useState(KH_PHASES.idle);
  const [workflow, setWorkflow] = useState(null);
  const [approvalId, setApprovalId] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [txHash, setTxHash] = useState(null);
  const [executionRecord, setExecutionRecord] = useState(null);
  const [verification, setVerification] = useState(null);
  const [error, setError] = useState(null);
  const busyRef = useRef(false);

  const opportunityId = opportunity?.id;

  /**
   * Step 1: prepare a deterministic workflow for review.
   */
  const prepare = useCallback(
    async ({ amount, type = 'deposit', wallet }) => {
      if (busyRef.current) return;
      if (!wallet) {
        setError({ code: 'NO_WALLET', message: 'Connect a wallet before preparing a workflow.' });
        setPhase(KH_PHASES.failed);
        return;
      }
      busyRef.current = true;
      setPhase(KH_PHASES.preparing);
      setError(null);
      try {
        const wf = await api.createWorkflow({
          opportunityId,
          walletAddress: wallet,
          amount: String(amount),
          type,
        });
        setWorkflow(wf);
        setWarnings(wf.metadata?.warnings || []);
        setPhase(KH_PHASES.reviewing);
      } catch (e) {
        setError(decodeError(e));
        setPhase(KH_PHASES.failed);
      } finally {
        busyRef.current = false;
      }
    },
    [opportunityId],
  );

  /**
   * Step 2: user explicitly approves the workflow.
   */
  const approve = useCallback(async () => {
    if (busyRef.current || !workflow?.workflowId) return;
    busyRef.current = true;
    setPhase(KH_PHASES.approving);
    setError(null);
    try {
      const wf = await api.approveWorkflow(workflow.workflowId);
      setWorkflow(wf);
      setApprovalId(wf.approvalId);
      setPhase(KH_PHASES.approved);
    } catch (e) {
      setError(decodeError(e));
      setPhase(KH_PHASES.failed);
    } finally {
      busyRef.current = false;
    }
  }, [workflow?.workflowId]);

  /**
   * Step 3: send the approved workflow to KeeperHub.
   */
  const sendToKeeperHub = useCallback(async () => {
    if (busyRef.current || !approvalId) return;
    busyRef.current = true;
    setPhase(KH_PHASES.submitting);
    setError(null);
    try {
      const wf = await api.executeWorkflow(workflow.workflowId, approvalId);
      setWorkflow(wf);
      setExecutionRecord(wf);
      if (wf.khExecutionId) {
        setPhase(KH_PHASES.keeperhubExecuting);
      } else if (wf.txHash) {
        setTxHash(wf.txHash);
        setPhase(KH_PHASES.txPending);
      } else if (wf.finalState === 'failed') {
        setError({ code: 'EXECUTION_FAILED', message: wf.failureReason || 'KeeperHub execution failed.' });
        setPhase(KH_PHASES.failed);
      } else {
        setPhase(KH_PHASES.keeperhubExecuting);
      }
    } catch (e) {
      setError(decodeError(e));
      // If the workflow reached a non-terminal state, allow polling.
      if (workflow?.finalState && !['failed', 'confirmed'].includes(workflow.finalState)) {
        setPhase(KH_PHASES.keeperhubExecuting);
      } else {
        setPhase(KH_PHASES.failed);
      }
    } finally {
      busyRef.current = false;
    }
  }, [approvalId, workflow?.finalState]);

  /**
   * Step 4: poll KeeperHub execution status.
   */
  const poll = useCallback(async () => {
    if (busyRef.current || !workflow?.workflowId) return;
    busyRef.current = true;
    setError(null);
    try {
      const wf = await api.pollWorkflow(workflow.workflowId);
      setWorkflow(wf);
      setExecutionRecord(wf);
      if (wf.txHash) setTxHash(wf.txHash);

      if (wf.finalState === 'confirmed') {
        setPhase(KH_PHASES.txPending);
        const verdict = await api.reconcileWorkflow(workflow.workflowId);
        setVerification(verdict.reconciliation);
        setWorkflow(verdict);
        setPhase(KH_PHASES.verified);
      } else if (wf.finalState === 'failed') {
        setError({ code: 'EXECUTION_FAILED', message: wf.failureReason || 'Execution failed.' });
        setPhase(KH_PHASES.failed);
      } else {
        setPhase(KH_PHASES.keeperhubExecuting);
      }
    } catch (e) {
      setError(decodeError(e));
      setPhase(KH_PHASES.failed);
    } finally {
      busyRef.current = false;
    }
  }, [workflow?.workflowId]);

  /**
   * Step 5: final reconciliation only.
   */
  const verify = useCallback(async () => {
    if (busyRef.current || !workflow?.workflowId) return;
    busyRef.current = true;
    setPhase(KH_PHASES.verifying);
    setError(null);
    try {
      const verdict = await api.reconcileWorkflow(workflow.workflowId);
      setVerification(verdict.reconciliation);
      setWorkflow(verdict);
      if (verdict.reconciliation?.verified) {
        setPhase(KH_PHASES.verified);
      } else {
        setError({
          code: 'VERIFY_FAILED',
          message: verdict.reconciliation?.reason || 'Blockchain verification failed.',
        });
        setPhase(KH_PHASES.failed);
      }
    } catch (e) {
      setError(decodeError(e));
      setPhase(KH_PHASES.failed);
    } finally {
      busyRef.current = false;
    }
  }, [workflow?.workflowId]);

  const reset = useCallback(() => {
    setPhase(KH_PHASES.idle);
    setWorkflow(null);
    setApprovalId(null);
    setWarnings([]);
    setTxHash(null);
    setExecutionRecord(null);
    setVerification(null);
    setError(null);
  }, []);

  return {
    workflow,
    approvalId,
    warnings,
    txHash,
    executionRecord,
    verification,
    phase,
    error,
    isBusy: BUSY.has(phase),
    prepare,
    approve,
    sendToKeeperHub,
    poll,
    verify,
    reset,
  };
}

export default useKeeperHubTransaction;