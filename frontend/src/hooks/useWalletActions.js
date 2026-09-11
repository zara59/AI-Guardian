// Wallet-signing primitives for the Guardian execution bridge.
//
// This is the ONLY module in the frontend that touches wagmi hooks that sign
// or read on-chain. useTransaction receives these actions by injection, which
// keeps the transaction state machine testable without a wallet.

import { useAccount, usePublicClient, useSendTransaction, useSwitchChain, useWriteContract } from 'wagmi';
import { erc20Abi, MAX_APPROVAL } from '../contracts/erc20';

/** Rejections from the wallet provider (user cancelled, wrong chain, ...). */
export class WalletActionError extends Error {
  constructor(message, code, meta = {}) {
    super(message);
    this.name = 'WalletActionError';
    this.code = code;
    this.meta = meta;
  }
}

export function useWalletActions() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  return {
    address,
    chainId,
    walletConnected: Boolean(address),

    /** Switch the wallet to a given chain; no-op when already there. */
    async ensureChain(targetChainId) {
      if (chainId && chainId !== targetChainId) {
        try {
          await switchChainAsync({ chainId: targetChainId });
        } catch {
          // user may reject the switch — leave it to the caller to surface
        }
      }
    },

    /** Send a raw prepared transaction (to + calldata) from the wallet. */
    async send({ to, data, value = '0x0' }) {
      if (!sendTransactionAsync) {
        throw new WalletActionError('Wallet is not available for signing.', 'NO_WALLET');
      }
      return sendTransactionAsync({ to, data, value: BigInt(value || 0) });
    },

    /** Approve the vault to spend `amount` of `token` (defaults to unlimited). */
    async approve({ token, spender, amount = MAX_APPROVAL }) {
      if (!writeContractAsync) {
        throw new WalletActionError('Wallet is not available for signing.', 'NO_WALLET');
      }
      return writeContractAsync({
        address: token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, amount],
      });
    },

    /** Read the token allowance granted to `spender`. */
    async allowance({ token, spender }) {
      return publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, spender],
      });
    },

    /** Wait for a mined receipt. */
    async waitForTx(hash) {
      return publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    },
  };
}

export default useWalletActions;