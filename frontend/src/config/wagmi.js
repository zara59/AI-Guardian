// wagmi configuration for the Guardian demo.
// Connecting on Sepolia, where the Guardian contracts get deployed.

import { createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

const rpcUrl =
  import.meta.env.VITE_SEPOLIA_RPC_URL ||
  'https://ethereum-sepolia-rpc.publicnode.com';

/** Chain both the wallet and the frontend operate on. */
export const guardianChain = sepolia;

export const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(rpcUrl),
  },
  connectors: [injected()],
  ssr: false,
});

export default wagmiConfig;