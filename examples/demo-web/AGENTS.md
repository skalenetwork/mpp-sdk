# Web Demo

React + Vite web interface for SKALE MPP payments with wallet connection.

## Files

- **server.ts**: Bun HTTP server with 4 payment endpoints (transfer, authorization, confidential, confidential-auth)
- **src/App.tsx**: Main UI with payment buttons and logs
- **src/wagmi.ts**: Wagmi config for SKALE BITE Sandbox
- **src/components/**: PaymentButton, ConfidentialRegistration, BalanceDisplay
- **.env.example**: Required environment variables

## Quick Start

```bash
cd examples/demo-web
bun install

# Copy and edit .env
cp .env.example .env
# - SERVER_ADDRESS: Server's receiving address
# - SERVER_PRIVATE_KEY: Required for gasless modes
# - VITE_WALLET_CONNECT_PROJECT_ID: For web wallet connection

# Run server + client
bun run dev

# Or separately
bun run dev:server  # Terminal 1
bun run dev:client  # Terminal 2 (after server starts)
```

## What It Demonstrates

1. Web wallet connection via AppKit/Reown
2. Real-time balance display (sFUEL, USDC, eUSDC deposit)
3. 4 payment mode buttons with visual feedback
4. Automatic MPP 402 challenge handling
5. Confidential registration flow (on-chain viewer setup)
6. Live transaction logs in UI

## Architecture

**Web Client** (port 5173)
- React 19 + Vite + TypeScript
- Wagmi for wallet connection and blockchain reads
- AppKit for wallet selection UI
- MPP client library for payment handling
- Direct HTTP calls to server (CORS enabled)

**HTTP Server** (port 3000)
- Bun.serve() with 4 Mppx instances (one per mode)
- CORS headers for browser access
- Endpoints: `/pay/transfer`, `/pay/authorization`, `/pay/confidential`, `/pay/confidential-auth`
- Returns 402 challenge → verifies payment → returns content

## Configuration

```bash
# .env - All values required
SERVER_ADDRESS=0x...           # Server's receiving address
SERVER_PRIVATE_KEY=0x...       # Server wallet (for gasless modes)
SERVER_SECRET_KEY=...          # Receipt signing secret
VITE_WALLET_CONNECT_PROJECT_ID=...  # Get from cloud.reown.com
```

## Payment Modes

| Button | Mode | Token | Gas | Description |
|--------|------|-------|-----|-------------|
| MPP Transfer | `transfer` | USDC | User | Standard ERC-20 transfer |
| MPP Gasless | `authorization` | USDC | Server | EIP-3009 authorization |
| MPP Confidential | `confidential` | eUSDC | User | BITE encrypted transfer |
| MPP Confidential + Gasless | `confidential-auth` | eUSDC | Server | BITE + EIP-3009 |

**Note:** Confidential modes require on-chain registration (handled automatically on first use).

## Network

- **Chain:** SKALE BITE Sandbox
- **Chain ID:** 103698795
- **RPC:** https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox
- **USDC:** `0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8`
- **eUSDC:** `0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200`
