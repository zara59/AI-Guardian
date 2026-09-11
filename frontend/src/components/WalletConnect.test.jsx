import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const walletMock = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useWallet.js', () => ({ useWallet: walletMock }));

import WalletConnect from './WalletConnect';

function baseWallet(overrides = {}) {
  return {
    isConnected: false,
    isConnecting: false,
    address: null,
    chainName: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  };
}

describe('WalletConnect', () => {
  beforeEach(() => {
    walletMock.mockReset();
  });

  it('renders a connect button when disconnected', () => {
    walletMock.mockReturnValue(baseWallet());
    render(<WalletConnect />);
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
  });

  it('triggers the wallet connect handler on click', () => {
    const connect = vi.fn();
    walletMock.mockReturnValue(baseWallet({ connect }));
    render(<WalletConnect />);
    fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
    expect(connect).toHaveBeenCalled();
  });

  it('shows the shortened address when connected', () => {
    walletMock.mockReturnValue(
      baseWallet({
        isConnected: true,
        address: '0x1111111111111111111111111111111111111111',
        chainName: 'Sepolia',
      }),
    );
    render(<WalletConnect />);
    expect(screen.getByText('0x1111…1111')).toBeInTheDocument();
  });

  it('shows a connecting indicator while connecting', () => {
    walletMock.mockReturnValue(baseWallet({ isConnecting: true }));
    render(<WalletConnect />);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });
});