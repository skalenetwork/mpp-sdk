# SKALE MPP Package

Payment method implementation for SKALE Network using MPP (Metered Payment Protocol).

## Package Structure

```
src/
├── method.ts      # Payment method definition (schemas)
├── client.ts      # Client-side implementation with 4 modes
├── server.ts      # Server-side implementation with 4 modes
└── index.ts       # Main exports

examples/
├── client/        # Client usage examples
│   ├── normal.ts
│   ├── gasless.ts
│   ├── confidential.ts
│   └── confidential-gasless.ts
├── server/        # Server usage examples  
│   ├── normal.ts
│   ├── gasless.ts
│   ├── confidential.ts
│   └── confidential-gasless.ts
├── package.json   # Bun workspace setup
└── README.md      # Running instructions
```

## Key Files

- **method.ts**: Defines the `skale/charge` payment method with credential schemas
- **client.ts**: Exports `skale.charge()` function supporting 4 modes
- **server.ts**: Exports `skale.charge()` function with verification logic

## 4 Payment Modes

| Mode | Parameters | Description |
|------|-----------|-------------|
| Normal | `confidential: false, gasless: false` | Standard ERC-20 transfer |
| Gasless | `confidential: false, gasless: true` | EIP-3009 authorization |
| Confidential | `confidential: true, gasless: false` | BITE encrypted |
| Confidential Gasless | `confidential: true, gasless: true` | BITE + EIP-3009 |

## Usage

```typescript
import { Mppx, skale } from '@skalenetwork/mpp/client'
// or
import { Mppx, skale } from '@skalenetwork/mpp/server'

Mppx.create({
  methods: [skale.charge({ 
    confidential: true, 
    gasless: false 
  })]
})
```

## Commands

```bash
# Build package
bun run build

# Type check
bun run typecheck

# Run examples
cd examples
bun install
bun run client:transfer
```

## Network

- Chain: SKALE BITE Sandbox
- Chain ID: 103698795
- RPC: https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox

## Dependencies

### Core Dependencies
- `mppx`: ^0.4.7 - Core MPP SDK
- `@skalenetwork/bite`: ^0.7.2 - BITE encryption library
- `viem`: ^2.47.5 - Ethereum interactions

### Web Demo Dependencies (React 19)
- `react`: ^19.2.4 - React framework
- `react-dom`: ^19.2.4 - React DOM renderer
- `@rainbow-me/rainbowkit`: ^2.2.10 - Wallet connection UI
- `wagmi`: ^3.5.0 - Ethereum React hooks
- `@tanstack/react-query`: ^5.91.2 - Data fetching
- `vite`: ^8.0.1 - Build tool
- `typescript`: ^5.9.3 - Type system
