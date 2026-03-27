# SKALE MPP Web Demo

Full-stack React web demonstration of SKALE Metered Payment Protocol (MPP).

## Features

- **Wallet Integration** - RainbowKit + wagmi + AppKit
- **4 Payment Modes** - Transfer, gasless, confidential, confidential+gasless
- **Live Balance Display** - Real-time sFUEL, USDC, eUSDC balances
- **Confidential Registration** - One-time setup for encrypted transfers
- **Transaction Logs** - Live payment status in terminal-style panel

## Quick Start

```bash
cd examples/demo-web
bun install

# Copy and edit environment variables
cp .env.example .env
# Edit .env:
#   SERVER_ADDRESS=0x...           # Server wallet address
#   SERVER_PRIVATE_KEY=0x...       # Server private key (for gasless modes)
#   VITE_WALLET_CONNECT_PROJECT_ID=...  # Get from walletconnect.com

# Start both server and dev server
bun run dev

# Or separately:
bun run server      # Terminal 1 - HTTP server on port 3000
bun run dev:client  # Terminal 2 - Vite dev server on port 5173
```

Open http://localhost:5173 and connect your wallet.

## Architecture

```
┌─────────────┐      HTTP/CORS      ┌──────────────┐
│   Browser   │ ←────────────────→  │  Bun Server  │
│  (React)    │    402 Challenge    │   Port 3000  │
│  Port 5173  │    Payment Headers  │              │
└─────────────┘                     └──────────────┘
```

**Client**: React + Vite + wagmi for wallet connection, @skalenetwork/mpp for payment
**Server**: Bun HTTP server with MPP verification endpoints

## Payment Modes

| Button | Token | Gas | Description |
|--------|-------|-----|-------------|
| **MPP Transfer** | USDC | You pay | Standard ERC-20 transfer |
| **MPP Gasless** | USDC | Server pays | EIP-3009 authorization |
| **MPP Confidential** | eUSDC | You pay | BITE encrypted transfer |
| **MPP Confidential + Gasless** | eUSDC | Server pays | BITE + EIP-3009 |

## Configuration

### Environment Variables

```bash
# Server (for bun run server)
SERVER_ADDRESS=0x...
SERVER_PRIVATE_KEY=0x...
SERVER_SECRET_KEY=demo-secret-key
SERVER_PORT=3000

# Client (Vite - prefixed with VITE_)
VITE_SERVER_URL=http://localhost:3000
VITE_WALLET_CONNECT_PROJECT_ID=...
```

### Network

- **Chain**: SKALE BITE Sandbox (Chain ID: 103698795)
- **USDC**: `0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8`
- **eUSDC**: `0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200`
- **RPC**: https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox

## Development

### Project Structure

```
demo-web/
├── server.ts              # Bun HTTP server
├── src/
│   ├── main.tsx          # React entry point
│   ├── App.tsx           # Main app component
│   ├── wagmi.ts          # Wallet connection config
│   └── components/
│       ├── PaymentButton.tsx
│       ├── ConfidentialRegistration.tsx
│       └── BalanceDisplay.tsx
├── package.json
└── vite.config.ts        # Vite + alias config
```

### Key Files

- **server.ts**: 4 payment endpoints (`/pay/transfer`, `/pay/authorization`, etc.)
- **App.tsx**: Main UI with payment mode selection
- **ConfidentialRegistration.tsx**: Handles eUSDC registration

## Troubleshooting

**404 errors**: Make sure server is running on port 3000
**Gasless modes fail**: Check SERVER_PRIVATE_KEY is set
**Wallet won't connect**: Verify VITE_WALLET_CONNECT_PROJECT_ID
**Low balance**: Get test funds from https://faucet.skale.network/

## Learn More

- [MPP Protocol](https://mpp.dev/)
- [SKALE Network](https://skale.network/)
- [BITE Encryption](https://docs.skale.network/bite/)
