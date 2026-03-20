// Polyfill Buffer for BITE SDK in browser
import { Buffer } from 'buffer'
window.Buffer = Buffer

import React from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { defineChain } from 'viem'
import App from './App'

// Define SKALE BITE Sandbox as a viem chain
const skaleBiteSandbox = defineChain({
  id: 103698795,
  name: 'SKALE BITE Sandbox',
  network: 'skale-bite-sandbox',
  nativeCurrency: {
    decimals: 18,
    name: 'sFUEL',
    symbol: 'sFUEL',
  },
  rpcUrls: {
    default: {
      http: ['https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox'],
    },
    public: {
      http: ['https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Blockscout',
      url: 'https://base-sepolia-testnet-explorer.skalenodes.com:10032',
    },
  },
  testnet: true,
  blockTime: 1, // 1 second block time
})

const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || 'YOUR_WALLET_CONNECT_PROJECT_ID'

// 0. Setup queryClient
const queryClient = new QueryClient()

// 1. Create metadata object
const metadata = {
  name: 'SKALE MPP Demo',
  description: 'SKALE Metered Payment Protocol Demo',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://example.com',
  icons: ['https://avatars.githubusercontent.com/u/179229932']
}

// 2. Create Wagmi Adapter
const wagmiAdapter = new WagmiAdapter({
  networks: [skaleBiteSandbox],
  projectId,
  ssr: false
})

// 3. Create AppKit modal
createAppKit({
  adapters: [wagmiAdapter],
  networks: [skaleBiteSandbox],
  projectId,
  metadata,
  features: {
    analytics: true
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
