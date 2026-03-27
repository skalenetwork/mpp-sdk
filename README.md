# @skalenetwork/mpp

SKALE payment method for [MPP](https://mpp.dev/) (Machine Payments Protocol)

Enables private, gasless payments on SKALE Network using confidential tokens with BITE encryption and EIP-3009 gasless transfers.

## Installation

```bash
npm install @skalenetwork/mpp
# or
pnpm add @skalenetwork/mpp
# or
yarn add @skalenetwork/mpp
```

## Quick Start

```typescript
import { mpp } from '@skalenetwork/mpp/client'

// Standard transfer on SKALE Base
const method = mpp.charge({
  chain: 'skale-base',
  currency: 'USDC.e'
})

// Gasless with EIP-3009
const gaslessMethod = mpp.charge({
  chain: 'skale-base',
  currency: 'USDC.e',
  extensions: { gasless: 'eip3009' }
})

// Encrypted (BITE Phase I)
const encryptedMethod = mpp.charge({
  chain: 'skale-base',
  currency: 'USDC.e',
  extensions: { skale: { encrypted: true } }
})

// Confidential token (BITE Phase II) + gasless
const confidentialMethod = mpp.charge({
  chain: 'bite-sandbox',
  currency: 'eUSDC',
  extensions: {
    skale: { encrypted: true, confidentialToken: true },
    gasless: 'eip3009'
  }
})
```

## Supported Chains

| Chain | Network | Chain ID |
|-------|---------|----------|
| `skale-base` | SKALE Base Mainnet | 284351530983 |
| `skale-base-sepolia` | SKALE Base Testnet | 2024883468 |
| `bite-sandbox` | BITE Sandbox Testnet | 103698795 |
| `base` | Base Mainnet | 8453 |
| `base-sepolia` | Base Sepolia | 84532 |

## Extensions

### Gasless

Enable gasless payments via EIP-3009 or EIP-2612 permit:

```typescript
extensions: { gasless: 'eip3009' }  // Default gasless mode
extensions: { gasless: 'eip2612' }  // ERC-2612 permit
extensions: { gasless: true }       // Auto-detect EIP-3009
```

### BITE Encryption (Phase I)

Encrypt transfer amounts on-chain:

```typescript
extensions: { skale: { encrypted: true } }
```

### Confidential Tokens (Phase II)

Use native confidential tokens with BITE:

```typescript
extensions: {
  skale: {
    encrypted: true,
    confidentialToken: true
  }
}
```

## Payment Strategies

| Chain | Currency | Gasless | Encrypted | Confidential Token | Mode |
|-------|----------|---------|-----------|-------------------|------|
| skale-base | USDC.e | - | - | - | Standard transfer |
| skale-base | USDC.e | EIP-3009 | - | - | Gasless permit |
| skale-base | USDC.e | - | ✓ | - | Encrypted amount |
| skale-base | USDC.e | EIP-3009 | ✓ | - | Gasless + encrypted |
| bite-sandbox | eUSDC | - | - | ✓ | Confidential token |
| bite-sandbox | eUSDC | EIP-3009 | - | ✓ | Confidential + gasless |
| bite-sandbox | eUSDC | - | ✓ | ✓ | Confidential + encrypted |
| bite-sandbox | eUSDC | EIP-3009 | ✓ | ✓ | Full privacy (all) |

## Custom Chains

Use any viem `Chain` object:

```typescript
import { mpp } from '@skalenetwork/mpp/client'
import { defineChain } from 'viem'

const myChain = defineChain({
  id: 123456,
  name: 'My Chain',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://mychain.rpc'] }
  }
})

const method = mpp.charge({
  chain: myChain,
  currency: {
    address: '0xTokenAddress...',
    symbol: 'TOKEN',
    decimals: 18,
    eip3009: true
  }
})
```

## Server Usage

```typescript
import { mpp } from '@skalenetwork/mpp/server'

const method = mpp.charge({
  chain: 'skale-base',
  currency: 'USDC.e',
  extensions: { gasless: 'eip3009' }
})

// In your MPPx server setup
const mppx = Mppx.create({
  methods: [method],
  realm: 'api.example.com',
  secretKey: process.env.MPP_SECRET
})
```

## License

MIT
