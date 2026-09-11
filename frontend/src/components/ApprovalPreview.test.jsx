import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const walletMock = vi.hoisted(() => vi.fn());
const actionsMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../security-layer/frontend/hooks/useWallet.js', () => ({ useWallet: walletMock }));
vi.mock('../../../security-layer/frontend/hooks/useWalletActions.js', () => ({ useWalletActions: actionsMock }));
vi.mock('../../../security-layer/frontend/hooks/useTransaction.js', () => ({
  useTransaction: transactionMock,
  PHASES: {
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
  },
}));

import ApprovalPreview from './ApprovalPreview';

const OPPORTUNITY = { id: 42, name: 'Ethereum Staking' };

function baseTx(overrides = {}) {
  return {
    transaction: null,
    warnings: [],
    approval: null,
    txHash: null,
    receipt: null,
    verification: null,
    phase: 'idle',
    error: null,
    needsApproval: false,
    isBusy: false,
    prepare: vi.fn(),
    execute: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe('ApprovalPreview', () => {
  beforeEach(() => {
    walletMock.mockReset();
    actionsMock.mockReset();
    transactionMock.mockReset();
    transactionMock.mockReturnValue(baseTx());
  });

  it('prompts to connect a wallet when disconnected', () => {
    walletMock.mockReturnValue({ isConnected: false, isConnecting: false, chainId: null });
    actionsMock.mockReturnValue({ address: null, walletConnected: false, chainId: null });
    render(<ApprovalPreview opportunity={OPPORTUNITY} amount={100} riskPreference="moderate" />);
    expect(screen.getByText(/Connect a wallet to execute/i)).toBeInTheDocument();
  });

  it('renders the review-preparation card when connected and idle', () => {
    walletMock.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      chainId: 11155111,
      connect: vi.fn(),
    });
    actionsMock.mockReturnValue({ address: '0x' + '1'.repeat(40), walletConnected: true, chainId: 11155111 });
    render(<ApprovalPreview opportunity={OPPORTUNITY} amount={100} riskPreference="moderate" />);
    expect(screen.getByRole('button', { name: /review execution/i })).toBeInTheDocument();
  });

  it('shows the prepared execution card with sign targets after preparation', () => {
    walletMock.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      chainId: 11155111,
      connect: vi.fn(),
    });
    actionsMock.mockReturnValue({ address: '0x' + '1'.repeat(40), walletConnected: true, chainId: 11155111 });
    transactionMock.mockReturnValue(
      baseTx({
        phase: 'prepared',
        transaction: {
          type: 'deposit',
          chainId: 11155111,
          asset: { symbol: 'gTEST', decimals: 6 },
          vault: { address: '0x' + 'v'.repeat(40) },
          strategy: { address: '0x' + 's'.repeat(40) },
          amount: { raw: '100000000', human: '100' },
          tx: { from: '0x' + '1'.repeat(40) },
        },
        warnings: ['Extra warning'],
        needsApproval: true,
      }),
    );
    render(<ApprovalPreview opportunity={OPPORTUNITY} amount={100} riskPreference="moderate" />);
    expect(screen.getByText(/Server-prepared execution/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approve & Deposit/i })).toBeInTheDocument();
    expect(screen.getByText(/Extra warning/i)).toBeInTheDocument();
  });

  it('shows the confirmed deposit panel with vault state readback', () => {
    walletMock.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      chainId: 11155111,
      connect: vi.fn(),
    });
    actionsMock.mockReturnValue({ address: '0x' + '1'.repeat(40), walletConnected: true, chainId: 11155111 });
    transactionMock.mockReturnValue(
      baseTx({
        phase: 'verified',
        transaction: { chainId: 11155111, asset: { decimals: 6 } },
        txHash: '0x' + '2'.repeat(64),
        verification: {
          txHash: '0x' + '2'.repeat(64),
          verification: {
            receipt: { blockNumber: 9001 },
            onChain: {
              vaultState: {
                totalAssets: '200000000',
                // ERC-4626 receipt shares mirror asset decimals (6 here).
                sharesOf: '100000000',
                exchangeRateRaw: '1',
              },
            },
          },
        },
      }),
    );
    render(<ApprovalPreview opportunity={OPPORTUNITY} amount={100} riskPreference="moderate" />);
    expect(screen.getByText(/Deposit confirmed on-chain/i)).toBeInTheDocument();
    expect(screen.getByText(/200 gTEST/)).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument();
  });

  it('prepares a withdrawal when the withdraw tab is used', () => {
    walletMock.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      chainId: 11155111,
      connect: vi.fn(),
    });
    actionsMock.mockReturnValue({ address: '0x' + '1'.repeat(40), walletConnected: true, chainId: 11155111 });
    const tx = baseTx();
    transactionMock.mockReturnValue(tx);

    render(<ApprovalPreview opportunity={OPPORTUNITY} amount={100} riskPreference="moderate" />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.change(screen.getByLabelText(/withdrawal amount/i), { target: { value: '25.5' } });
    fireEvent.click(screen.getByRole('button', { name: /review withdrawal/i }));

    expect(tx.prepare).toHaveBeenCalledWith({ amount: '25.5', type: 'withdraw' });
  });

  it('shows the withdrawal confirmation title after a verified withdraw', () => {
    walletMock.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      chainId: 11155111,
      connect: vi.fn(),
    });
    actionsMock.mockReturnValue({ address: '0x' + '1'.repeat(40), walletConnected: true, chainId: 11155111 });
    transactionMock.mockReturnValue(
      baseTx({
        phase: 'verified',
        transaction: { type: 'withdraw', chainId: 11155111, asset: { decimals: 6 } },
        txHash: '0x' + '2'.repeat(64),
        verification: {
          txHash: '0x' + '2'.repeat(64),
          verification: { receipt: { blockNumber: 9002 }, onChain: { vaultState: {} } },
        },
      }),
    );
    render(<ApprovalPreview opportunity={OPPORTUNITY} amount={100} riskPreference="moderate" />);
    expect(screen.getByText(/Withdrawal confirmed on-chain/i)).toBeInTheDocument();
  });
});