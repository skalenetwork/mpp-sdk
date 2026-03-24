# SKALE MPP Package

Payment method implementation for SKALE Network and EVM chains using MPP (Machine Payments Protocol -- mpp.dev).

## Package Structure

```
src/
├── index.ts         # Main exports (Mppx, evm, evmServer, presets)
├── client.ts        # Client-side implementation with 8 payment strategies
├── server.ts        # Server-side implementation with verification logic
├── method.ts        # Payment method definition (schemas)
├── chains/
│   ├── presets.ts   # Chain presets (bite-sandbox, skale-base, base, etc.)
│   ├── resolver.ts  # Chain resolution utilities
│   └── index.ts     # Chain types
├── extensions/
│   ├── index.ts     # Extension types and validation
│   └── resolver.ts  # Payment strategy resolution
├── payments/
│   ├── index.ts     # Payment submission functions
│   ├── types.ts     # Authorization/Permit types
│   ├── eip3009.ts   # EIP-3009 authorization
│   ├── eip2612.ts   # EIP-2612 permit
│   ├── erc20.ts     # Standard transfer
│   └── bite.ts      # BITE encryption
├── tokens/
│   ├── index.ts     # Token resolution
│   └── registry.ts  # Token configurations
└── shared/
    ├── types.ts     # Shared TypeScript types
    ├── utils.ts     # Helper functions
    └── abi.ts       # Contract ABIs

examples/
├── demo/            # Complete CLI demo (Bun server + client)
├── demo-web/        # Full-stack React web demo
├── mppx/            # mppx SDK integration examples
├── skale-base/      # SKALE Base chain examples
├── bite-sandbox/    # BITE confidential token examples
├── base/            # Base chain (non-SKALE) examples
├── server/          # Server-side only examples
└── custom-chain/    # Custom viem chain configuration
```

## Key Files

- **method.ts**: Defines the `evm/charge` payment method with credential schemas
- **client.ts**: Exports `charge()` function supporting 8 payment strategies
- **server.ts**: Exports server-side `charge()` with verification logic
- **chains/presets.ts**: Pre-configured chains (bite-sandbox, skale-base, base, etc.)
- **extensions/resolver.ts**: Determines payment strategy from extensions

## Payment Strategies

| Strategy | Extensions | Description |
|----------|-----------|-------------|
| `transfer` | None | Standard ERC-20 transfer (user pays gas) |
| `eip3009` | `gasless: 'eip3009'` | EIP-3009 authorization (gasless) |
| `eip2612` | `gasless: 'eip2612'` | EIP-2612 permit (gasless) |
| `encrypted-transfer` | `skale: { encrypted: true }` | BITE encrypted transfer |
| `encrypted-eip3009` | `skale: { encrypted: true }, gasless: 'eip3009'` | BITE + EIP-3009 |
| `encrypted-eip2612` | `skale: { encrypted: true }, gasless: 'eip2612'` | BITE + EIP-2612 |
| `confidential-eip3009` | `skale: { encrypted: true, confidentialToken: true }, gasless: 'eip3009'` | Confidential token + EIP-3009 |
| `confidential-eip2612` | `skale: { encrypted: true, confidentialToken: true }, gasless: 'eip2612'` | Confidential token + EIP-2612 |

## Chain Presets

Use preset names or `ChainConfig` objects:

```typescript
import { presets, biteSandbox, skaleBaseSepolia } from '@skalenetwork/mpp'

// Preset names
'bite-sandbox'      // SKALE BITE Sandbox (Chain ID: 103698795)
'skale-base'        // SKALE Base Mainnet (Chain ID: 1187947933)
'skale-base-sepolia' // SKALE Base Sepolia (Chain ID: 324705682)
'base'              // Base Mainnet (Chain ID: 8453)
'base-sepolia'      // Base Sepolia (Chain ID: 84532)
```

## Extensions API

Extensions control payment behavior through a structured object:

```typescript
type Extension = {
  skale?: {
    encrypted?: boolean        // Enable BITE encryption (SKALE only)
    confidentialToken?: boolean // Use confidential token (SKALE only)
  }
  gasless?: boolean | 'eip3009' | 'eip2612'  // Gasless payment type
}
```

## Usage

### Client-side

```typescript
import { Mppx, evm } from '@skalenetwork/mpp/client'

// Basic transfer on SKALE Base
Mppx.create({
  methods: [evm.charge({
    chain: 'skale-base',
    currency: 'USDC.e'
  })]
})

// Gasless with EIP-3009
Mppx.create({
  methods: [evm.charge({
    chain: 'skale-base',
    currency: 'USDC.e',
    extensions: { gasless: 'eip3009' }
  })]
})

// BITE encrypted (confidential amount)
Mppx.create({
  methods: [evm.charge({
    chain: 'bite-sandbox',
    currency: 'eUSDC',
    extensions: {
      skale: { encrypted: true, confidentialToken: true }
    }
  })]
})

// Confidential + gasless
Mppx.create({
  methods: [evm.charge({
    chain: 'bite-sandbox',
    currency: 'eUSDC',
    extensions: {
      skale: { encrypted: true, confidentialToken: true },
      gasless: 'eip3009'
    }
  })]
})
```

### Server-side

```typescript
import { Mppx, evmServer } from '@skalenetwork/mpp/server'

Mppx.create({
  methods: [evmServer.charge({
    chain: 'skale-base',
    currency: 'USDC.e',
    extensions: { gasless: 'eip3009' },
    serverAccount: serverWallet.account,
    authorizationStore: new MapAuthorizationStore()
  })]
})
```

## Commands

```bash
# Build package
bun run build

# Type check
bun run typecheck

# Run demo
bun run demo

# Run tests
bun test
```

## Examples

### CLI Demo
```bash
cd examples/demo
bun install
bun run dev
```

### Web Demo
```bash
cd examples/demo-web
bun install
bun run dev
```

### Minimal Examples
```bash
# SKALE Base transfer
cd examples/skale-base
bun run transfer

# BITE confidential gasless
cd examples/bite-sandbox
bun run confidential-gasless

# Base chain gasless
cd examples/base
bun run gasless-eip2612
```

## Networks

### SKALE BITE Sandbox (Testnet)
- Chain ID: 103698795
- RPC: https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox
- USDC: 0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8
- eUSDC: 0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200

### SKALE Base Mainnet
- Chain ID: 1187947933
- RPC: https://skale-base.skalenodes.com/v1/base
- USDC.e: 0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20

### Base Mainnet
- Chain ID: 8453
- RPC: https://mainnet.base.org
- USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

## Dependencies

### Core
- `mppx`: ^0.4.7 - Core MPP SDK
- `@skalenetwork/bite`: ^0.8.1-develop.0 - BITE encryption library
- `viem`: ^2.47.5 - Ethereum interactions

### Web Demo
- `react`: ^19.2.4
- `@rainbow-me/rainbowkit`: ^2.2.10
- `wagmi`: ^3.5.0
- `vite`: ^8.0.1
