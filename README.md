# mpp-skale

SKALE payment method for [MPP](https://mpp.dev/) (Metered Payment Protocol)

Enables private, gasless payments on SKALE Network using confidential tokens with BITE encryption and EIP-3009 gasless transfers.

## Features

- **4 Payment Modes**:
  - **Normal**: Standard ERC-20 transfer
  - **Gasless**: EIP-3009 authorization (off-chain signing)
  - **Confidential**: BITE encrypted transfer (amount hidden)
  - **Confidential Gasless**: BITE + EIP-3009 (maximum privacy + convenience)

- **Multi-Token Support**: Accept multiple tokens in a single payment endpoint
- **Replay Protection**: Built-in authorization nonce tracking
- **SKALE BITE Sandbox**: Ready for testnet (Chain ID: 103698795)

## Installation

```bash
npm install mpp-skale
# or
pnpm add mpp-skale
# or
yarn add mpp-skale
```

## Quick Start

### Client (Browser/Agent)

```typescript
import { Mppx } from 'mppx/client'
import { skale as clientSkale } from 'mpp-skale'
import { privateKeyToAccount } from 'viem/accounts'

const account = privateKeyToAccount('0x...')

const mppx = Mppx.create({
  methods: [
    clientSkale({
      account,
      confidential: true,  // Enable BITE encryption
      gasless: false,      // Client submits tx
    }),
  ],
})

// Automatically handles 402 challenges
const response = await mppx.fetch('https://api.example.com/paid-resource')
console.log(response.status) // 200
```

### Server (API)

```typescript
import { Mppx } from 'mppx/server'
import { skale as serverSkale } from 'mpp-skale'
import { createPublicClient, http } from 'viem'

const client = createPublicClient({
  chain: {
    id: 103698795,
    name: 'SKALE BITE Sandbox',
    nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' },
    rpcUrls: { default: { http: ['https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox'] } },
  },
  transport: http(),
})

const mppx = Mppx.create({
  methods: [
    serverSkale({
      getClient: () => client,
      confidential: true,
      gasless: false,
      tokens: [
        { address: '0x36A9040...', symbol: 'STUB', decimals: 18 },
      ],
      recipient: '0xYourServerAddress',
      testnet: true,
    }),
  ],
  realm: 'api.example.com',
  secretKey: 'your-secret',
})

// Express-style handler
export async function handler(req, res) {
  const result = await Mppx.toNodeListener(
    mppx.charge({ amount: '0.1', decimals: 18 })
  )(req, res)
  
  if (result.status === 200) {
    console.log('Payment received:', result.receipt)
    res.end('Premium content')
  }
}
```

## Configuration

### Client Options

```typescript
clientSkale({
  account: Account,           // Required: Viem account
  getClient?: () => Client, // Optional: Custom viem client
  confidential?: boolean,   // Default: false
  gasless?: boolean,        // Default: false
  validDuration?: number,    // Default: 300 (5 minutes)
})
```

### Server Options

```typescript
serverSkale({
  getClient: () => Client,  // Required: Viem client factory
  confidential?: boolean,   // Default: false
  gasless?: boolean,        // Default: false
  currency?: string,        // Single token address
  tokens?: TokenOption[],   // Multiple tokens (overrides currency)
  recipient?: string,       // Payment recipient address
  testnet?: boolean,       // Default: true
  store?: AuthorizationStore, // Replay protection store
  useMulticall?: boolean,   // Default: false
  waitForConfirmation?: boolean, // Default: true
})
```

## Examples

See the `examples/` directory for complete working examples:

- `normal.ts` - Standard ERC-20 transfer
- `gasless.ts` - EIP-3009 authorization
- `confidential.ts` - BITE encrypted transfer
- `confidential-gasless.ts` - BITE + EIP-3009

## Network Details

**SKALE BITE Sandbox (Testnet)**
- Chain ID: 103698795
- RPC: https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox
- BITE Address: 0x42495445204D452049274d20454e435259505444
- STUB Token: 0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200

## License

MIT
