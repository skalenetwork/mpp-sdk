import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { injected } from 'wagmi/connectors'

// SKALE BITE Sandbox chain
const biteSandbox = {
  id: 103698795,
  name: 'SKALE BITE Sandbox',
  nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' },
  rpcUrls: {
    default: { http: ['https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox'] },
  },
} as const

export const config = createConfig({
  chains: [biteSandbox],
  connectors: [injected()],
  transports: {
    [biteSandbox.id]: http(),
  },
})

export const queryClient = new QueryClient()
