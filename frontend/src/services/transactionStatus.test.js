import { describe, it, expect } from 'vitest';
import {
  computeSteps,
  stepStates,
  phaseOrder,
  explorerTxUrl,
  explorerAddressUrl,
  shortAddress,
  decodeError,
} from './transactionStatus';

describe('computeSteps', () => {
  it('includes the approval step only for deposits that need approval', () => {
    const withApprove = computeSteps({ type: 'deposit', needsApproval: true });
    expect(withApprove.map((s) => s.key)).toEqual([
      'prepared',
      'approve',
      'signed',
      'confirmed',
      'verified',
    ]);

    const noApprove = computeSteps({ type: 'deposit', needsApproval: false });
    expect(noApprove.map((s) => s.key)).not.toContain('approve');

    const withdraw = computeSteps({ type: 'withdraw', needsApproval: true });
    expect(withdraw.map((s) => s.key)).not.toContain('approve');
  });
});

describe('phaseOrder', () => {
  it('orders phases sequentially', () => {
    expect(phaseOrder('idle')).toBe(0);
    expect(phaseOrder('preparing')).toBe(1);
    expect(phaseOrder('prepared')).toBe(2);
    expect(phaseOrder('verified')).toBe(9);
    expect(phaseOrder('nonexistent')).toBe(-1);
  });
});

describe('stepStates', () => {
  const steps = computeSteps({ type: 'deposit', needsApproval: true });

  it('starts all pending in the idle phase', () => {
    const states = stepStates({ phase: 'idle', steps, edge: {} });
    expect(states.map((s) => s.state)).toEqual(['pending', 'pending', 'pending', 'pending', 'pending']);
  });

  it('marks the prepared step active while preparing', () => {
    const states = stepStates({ phase: 'preparing', steps, edge: {} });
    expect(states[0].state).toBe('active');
    expect(states[1].state).toBe('pending');
  });

  it('progresses through signing once approval is recorded', () => {
    const states = stepStates({ phase: 'signing', steps, edge: { approvalHash: '0xabc' } });
    expect(states[0].state).toBe('active');
    expect(states[1].state).toBe('done');
    expect(states[2].state).toBe('active');
  });

  it('completes every step when verified', () => {
    const states = stepStates({ phase: 'verified', steps, edge: { approvalHash: '0x', hasTxHash: true, hasReceipt: true } });
    expect(states.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
  });
});

describe('explorer + address helpers', () => {
  it('builds sepolia/ethereum explorer links and null for unknown chains', () => {
    const hash = '0x' + 'ab'.repeat(32);
    expect(explorerTxUrl(11155111, hash)).toBe(`https://sepolia.etherscan.io/tx/${hash}`);
    expect(explorerTxUrl(1, hash)).toBe(`https://etherscan.io/tx/${hash}`);
    expect(explorerTxUrl(5, hash)).toBeNull();
    expect(explorerAddressUrl(11155111, '0xdead')).toBe(
      'https://sepolia.etherscan.io/address/0xdead',
    );
  });

  it('shortens addresses deterministically', () => {
    expect(shortAddress('0x1111111111111111111111111111111111111111')).toBe('0x1111…1111');
    expect(shortAddress('')).toBe('');
  });
});

describe('decodeError', () => {
  it('maps API errors to code+message', () => {
    const e = Object.assign(new Error('no deployment'), { code: 'NOT_DEPLOYED' });
    expect(decodeError(e)).toEqual({ code: 'NOT_DEPLOYED', message: 'no deployment' });
  });

  it('maps wallet user-rejection to a friendly message', () => {
    const e = Object.assign(new Error('User rejected'), { code: 4001 });
    expect(decodeError(e).code).toBe('USER_REJECTED');
    expect(decodeError({ name: 'UserRejectedRequestError' }).code).toBe('USER_REJECTED');
  });

  it('maps chain-switch rejections', () => {
    expect(decodeError({ code: 4901 }).code).toBe('CHAIN_DISCONNECTED');
  });

  it('maps arbitrary failures', () => {
    expect(decodeError(new Error('boom')).code).toBe('EXECUTION_ERROR');
    expect(decodeError(new Error('boom')).message).toBe('boom');
  });
});