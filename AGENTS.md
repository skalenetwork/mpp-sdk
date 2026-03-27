# SKALE MPP Package

Payment method implementation for SKALE Network and EVM chains using MPP (Machine Payments Protocol).

## Clean SDK Structure

```
src/
├── server/
│   └── index.ts           # Server implementation (transfer, eip3009, eip2612 verification)
├── client/
│   └── index.ts           # Client implementation (8 payment strategies)
├── config/
│   ├── chains.ts          # Chain configs, presets (bite-sandbox, skale-base, base)
│   └── tokens.ts          # Token configs and registry
├── methods/
│   ├── evm.ts             # EVM plugin (main entry for standard EVM payments)
│   ├── transfer.ts        # Standard ERC-20 transfer
│   ├── eip3009.ts         # EIP-3009 authorization
│   └── eip2612.ts         # EIP-2612 permit
├── extensions/
│   ├── index.ts           # Extension types (Extension, SkaleExtensions)
│   ├── skale.ts           # SKALE plugin (encrypted + confidential features)
│   ├── resolver.ts        # Payment strategy resolution
│   └── skale/
│       └── bite.ts        # BITE encryption utilities
├── utils/
│   ├── abi.ts             # Contract ABIs
│   ├── types.ts           # Shared TypeScript types
│   └── utils.ts            # Helper functions
├── method.ts              # MPP method definition and schemas
├── constants.ts           # Constants (gas limits, addresses)
├── defaults.ts            # Default values
└── index.ts               # Root exports ONLY (no subfolder barrel files)
```

**Key Principles:**
- No `index.ts` barrel files in subfolders (only root `index.ts` exports)
- Methods = payment methods (ERC-20, EIP-3009, EIP-2612)
- Extensions = SKALE-specific features (encryption, confidential tokens)
- Config = chains and tokens configuration
- Utils = shared utilities and types

## Key Files

- **methods/evm.ts**: EVM plugin entry point
- **methods/transfer.ts**: Standard ERC-20 transfer implementation
- **methods/eip3009.ts**: EIP-3009 authorization creation/submission
- **methods/eip2612.ts**: EIP-2612 permit creation/submission
- **extensions/skale.ts**: SKALE plugin with BITE encryption
- **config/chains.ts**: Chain presets and resolver
- **config/tokens.ts**: Token configurations
- **server/index.ts**: Server-side verification logic
- **client/index.ts**: Client-side payment creation
- **method.ts**: MPP credential schemas

## Payment Methods

| Method | Description | Gas |
|--------|-------------|-----|
| `transfer` | Standard ERC-20 transfer | User |
| `eip3009` | EIP-3009 authorization | Server (gasless) |
| `eip2612` | EIP-2612 permit | Server (gasless) |

## SKALE Extensions

Extensions add SKALE-specific features to base methods:

```typescript
// Encrypted transfer (BITE Phase 1)
extensions: {
  skale: { encrypted: true }
}

// Confidential token (BITE Phase 2)
extensions: {
  skale: { encrypted: true, confidentialToken: true }
}

// Gasless + encrypted
extensions: {
  skale: { encrypted: true },
  gasless: 'eip3009'
}
```

## Chain Presets

```typescript
import { presets, biteSandbox, skaleBase, base } from '@skalenetwork/mpp'

'bite-sandbox'       // SKALE BITE Sandbox (103698795)
'skale-base'         // SKALE Base Mainnet (1187947933)
'skale-base-sepolia' // SKALE Base Sepolia (324705682)
'base'               // Base Mainnet (8453)
'base-sepolia'       // Base Sepolia (84532)
```

## Usage

### Standard EVM (transfer, eip3009, eip2612)

```typescript
import { Mppx, evm } from '@skalenetwork/mpp'

const mppx = Mppx.create({
  methods: [evm({
    chain: 'base',
    currency: 'USDC',
    account,
    client
  })]
})
```

### SKALE with Extensions

```typescript
import { Mppx, skale } from '@skalenetwork/mpp'

// Encrypted transfer
const mppx = Mppx.create({
  methods: [skale({
    chain: 'bite-sandbox',
    currency: 'eUSDC',
    account,
    client,
    extensions: {
      skale: { encrypted: true }
    }
  })]
})

// Confidential + gasless
const mppx = Mppx.create({
  methods: [skale({
    chain: 'bite-sandbox',
    currency: 'eUSDC',
    account,
    client,
    extensions: {
      skale: { encrypted: true, confidentialToken: true },
      gasless: 'eip3009'
    }
  })]
})
```

### Server-side

```typescript
import { Mppx, skaleServer } from '@skalenetwork/mpp'

const mppx = Mppx.create({
  methods: [skaleServer({
    chain: 'bite-sandbox',
    currency: 'eUSDC',
    client,
    serverAccount,
    extensions: {
      skale: { encrypted: true },
      gasless: 'eip3009'
    }
  })]
})
```

## Commands

```bash
# Build package
bun run build

# Type check
bun run typecheck

# Run web demo
cd examples/demo-web
bun run dev
```

## Networks

### SKALE BITE Sandbox
- Chain ID: 103698795
- USDC: 0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8
- eUSDC: 0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200

### SKALE Base Mainnet
- Chain ID: 1187947933
- USDC.e: 0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20

### Base Mainnet
- Chain ID: 8453
- USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

## Dependencies

- `mppx`: ^0.4.7 - Core MPP SDK
- `@skalenetwork/bite`: ^0.8.1 - BITE encryption
- `viem`: ^2.47.5 - Ethereum interactions
