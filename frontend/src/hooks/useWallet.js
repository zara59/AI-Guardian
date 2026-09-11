import { useAccount, useConnect, useDisconnect } from 'wagmi';

/**
 * Wallet connection state used by the header and the execution flows.
 * Wraps wagmi so pages never import wagmi hooks directly and tests can
 * mock this single module.
 */
export function useWallet() {
  const {
    address,
    isConnected,
    isConnecting: accountConnecting,
    isReconnecting,
    chainId,
    chain,
    status,
  } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const handleConnect = () => {
    const connector = connectors[0];
    if (connector) {
      connect({ connector });
    } else {
      connect();
    }
  };

  return {
    address,
    isConnected,
    isConnecting: accountConnecting || isReconnecting || isPending,
    chainId,
    chainName: chain?.name ?? null,
    status,
    connect: handleConnect,
    disconnect,
  };
}

export default useWallet;