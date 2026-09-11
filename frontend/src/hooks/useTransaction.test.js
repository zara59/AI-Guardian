import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const apiMock = vi.hoisted(() => ({
  prepareTransaction: vi.fn(),
  signTransaction: vi.fn(),
  verifyTransaction: vi.fn(),
  getTransactionStatus: vi.fn(),
  listTransactions: vi.fn(),
}));

vi.mock('../services/api', () => ({
  default: apiMock,
  ApiRequestError: class extends Error {
    constructor(message, options = {}) {
      super(message);
      this.status = options.status;
      this.code = options.code;
      this.detail = options.detail;
    }
  },
}));

import { useTransaction, PHASES } from './useTransaction';

const OPPORTUNITY = { id: 42, name: 'Ethereum Staking' };

const DEPOSIT_TX = {
  prepareId: 'abc123defghijklmnopqr',
  type: 'deposit',
  chain: 'sepolia',
  chainId: 11155111,
  status: 'prepared',
  validUntil: new Date(Date.now() + 3600e3).toISOString(),
  asset: { address: '0x'.padEnd(42, 'a'), symbol: 'gTEST', decimals: 6 },
  vault: { address: '0x'.padEnd(42, 'v'), strategy: null },
  strategy: { address: '0x'.padEnd(42, 's') },
  amount: { raw: '100000000', human: '100' },
  tx: { to: '0x'.padEnd(42, 'v'), data: '0x6e553f65', value: '0x0', from: '0x'.padEnd(42, 'f') },
  warnings: ['Wallet allowance covers only part of this deposit — an approval step is needed.'],
  opportunity: { id: 42, name: 'Ethereum Staking', score: 90 },
};

const WITHDRAW_TX = {
  ...DEPOSIT_TX,
  prepareId: 'abc123defghijklmnopqs',
  type: 'withdraw',
  amount: { raw: '25000000', human: '25' },
  tx: {
    to: '0x'.padEnd(42, 'v'),
    data: '0xb460af94',
    value: '0x0',
    from: '0x'.padEnd(42, 'f'),
  },
  warnings: [],
};

function walletFake(overrides = {}) {
  return {
    address: '0x'.padEnd(42, 'w'),
    walletConnected: true,
    chainId: 11155111,
    ensureChain: vi.fn().mockResolvedValue(undefined),
    allowance: vi.fn().mockResolvedValue(1_000_000_000_000n),
    approve: vi.fn().mockResolvedValue('0x'.padEnd(66, '1')),
    send: vi.fn().mockResolvedValue('0x'.padEnd(66, '2')),
    waitForTx: vi.fn().mockResolvedValue({ status: 'success', blockNumber: 9001n }),
    ...overrides,
  };
}

function apiError(code, message) {
  return Object.assign(new Error(message), { code });
}

describe('useTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepares a deposit and reports whether approval is needed', async () => {
    apiMock.prepareTransaction.mockResolvedValue(DEPOSIT_TX);
    const wallet = walletFake({ allowance: vi.fn().mockResolvedValue(0n) });

    const { result } = renderHook(() => useTransaction(OPPORTUNITY, wallet));
    await act(async () => {
      await result.current.prepare({ amount: '100', type: 'deposit' });
    });

    expect(result.current.phase).toBe(PHASES.prepared);
    expect(result.current.transaction).toEqual(DEPOSIT_TX);
    expect(result.current.needsApproval).toBe(true);
    expect(apiMock.prepareTransaction).toHaveBeenCalledWith({
      opportunityId: 42,
      walletAddress: wallet.address,
      amount: '100',
      type: 'deposit',
    });
  });

  it('decodes backend gate refusals (e.g. NOT_DEPLOYED) into a terminal error', async () => {
    apiMock.prepareTransaction.mockRejectedValue(apiError('NOT_DEPLOYED', 'No deployment on chain 1'));
    const wallet = walletFake();

    const { result } = renderHook(() => useTransaction(OPPORTUNITY, wallet));
    await act(async () => {
      await result.current.prepare({ amount: '100', type: 'deposit' });
    });

    expect(result.current.phase).toBe(PHASES.failed);
    expect(result.current.error).toMatchObject({
      code: 'NOT_DEPLOYED',
    });
  });

  it('runs the full deposit: approve → sign → receipt → verify', async () => {
    apiMock.prepareTransaction.mockResolvedValue(DEPOSIT_TX);
    apiMock.signTransaction.mockResolvedValue({ ...DEPOSIT_TX, status: 'signed', txHash: '0x2' });
    apiMock.verifyTransaction.mockResolvedValue({
      ...DEPOSIT_TX,
      status: 'confirmed',
      txHash: '0x2',
      verification: {
        mined: true,
        receipt: { status: 'success', blockNumber: 9001n },
        onChain: {
          vaultState: { totalAssets: '200000000', totalSupply: '1000000000000000000', sharesOf: '1000000000000000000', exchangeRateRaw: '1' },
        },
      },
    });

    const wallet = walletFake({ allowance: vi.fn().mockResolvedValue(0n) });

    const { result } = renderHook(() => useTransaction(OPPORTUNITY, wallet));
    await act(async () => {
      await result.current.prepare({ amount: '100', type: 'deposit' });
    });
    expect(result.current.phase).toBe(PHASES.prepared);

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.phase).toBe(PHASES.verified);
    expect(wallet.approve).toHaveBeenCalledWith({
      token: DEPOSIT_TX.asset.address,
      spender: DEPOSIT_TX.vault.address,
    });
    expect(wallet.send).toHaveBeenCalledWith(DEPOSIT_TX.tx);
    expect(apiMock.signTransaction).toHaveBeenCalledWith(DEPOSIT_TX.prepareId, {
      txHash: '0x' + '2'.padEnd(64, '2'),
      status: 'signed',
    });
    expect(apiMock.verifyTransaction).toHaveBeenCalledWith(DEPOSIT_TX.prepareId);
    expect(result.current.verification).toBeTruthy();
  });

  it('skips the approval step when allowance already covers the deposit', async () => {
    apiMock.prepareTransaction.mockResolvedValue(DEPOSIT_TX);
    apiMock.signTransaction.mockResolvedValue({ ...DEPOSIT_TX, status: 'signed' });
    apiMock.verifyTransaction.mockResolvedValue({ ...DEPOSIT_TX, verification: { mined: true } });

    const wallet = walletFake(); // high allowance

    const { result } = renderHook(() => useTransaction(OPPORTUNITY, wallet));
    await act(async () => {
      await result.current.prepare({ amount: '100', type: 'deposit' });
    });
    expect(result.current.needsApproval).toBe(false);

    await act(async () => {
      await result.current.execute();
    });

    expect(wallet.approve).not.toHaveBeenCalled();
    expect(result.current.phase).toBe(PHASES.verified);
  });

  it('prepares a withdrawal without flagging token approval', async () => {
    apiMock.prepareTransaction.mockResolvedValue(WITHDRAW_TX);
    const wallet = walletFake({ allowance: vi.fn().mockRejectedValue(new Error('must not read')) });

    const { result } = renderHook(() => useTransaction(OPPORTUNITY, wallet));
    await act(async () => {
      await result.current.prepare({ amount: '25', type: 'withdraw' });
    });

    expect(result.current.phase).toBe(PHASES.prepared);
    expect(result.current.needsApproval).toBe(false);
    expect(wallet.allowance).not.toHaveBeenCalled();
  });

  it('executes a withdrawal without ever touching token approval', async () => {
    apiMock.prepareTransaction.mockResolvedValue(WITHDRAW_TX);
    apiMock.signTransaction.mockResolvedValue({ ...WITHDRAW_TX, status: 'signed' });
    apiMock.verifyTransaction.mockResolvedValue({ ...WITHDRAW_TX, verification: { mined: true } });

    const wallet = walletFake({ allowance: vi.fn().mockRejectedValue(new Error('must not read')) });

    const { result } = renderHook(() => useTransaction(OPPORTUNITY, wallet));
    await act(async () => {
      await result.current.prepare({ amount: '25', type: 'withdraw' });
    });
    await act(async () => {
      await result.current.execute();
    });

    expect(wallet.approve).not.toHaveBeenCalled();
    expect(wallet.allowance).not.toHaveBeenCalled();
    expect(wallet.send).toHaveBeenCalledWith(WITHDRAW_TX.tx);
    expect(apiMock.verifyTransaction).toHaveBeenCalledWith(WITHDRAW_TX.prepareId);
    expect(result.current.phase).toBe(PHASES.verified);
  });

  it('surfaces wallet signature cancellations without recording a tx', async () => {
    apiMock.prepareTransaction.mockResolvedValue(DEPOSIT_TX);
    const wallet = walletFake({
      allowance: vi.fn().mockResolvedValue(1_000_000_000_000n),
      send: vi.fn().mockRejectedValue(apiError(4001, 'User rejected')),
    });

    const { result } = renderHook(() => useTransaction(OPPORTUNITY, wallet));
    await act(async () => {
      await result.current.prepare({ amount: '100', type: 'deposit' });
    });
    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.phase).toBe(PHASES.failed);
    expect(result.current.error.code).toBe('USER_REJECTED');
    expect(apiMock.signTransaction).not.toHaveBeenCalled();
  });

  it('resets the machine back to idle', async () => {
    apiMock.prepareTransaction.mockResolvedValue(DEPOSIT_TX);
    const wallet = walletFake();

    const { result } = renderHook(() => useTransaction(OPPORTUNITY, wallet));
    await act(async () => {
      await result.current.prepare({ amount: '100', type: 'deposit' });
    });
    expect(result.current.phase).toBe(PHASES.prepared);

    await act(async () => {
      result.current.reset();
    });

    expect(result.current.phase).toBe(PHASES.idle);
    expect(result.current.transaction).toBeNull();
    expect(result.current.error).toBeNull();
  });
});