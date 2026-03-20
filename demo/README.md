# SKALE MPP Demo Server

HTTP server component for the web-based SKALE MPP payment demo.

## Overview

This server handles payment verification for the SKALE MPP web demo. It supports 4 payment types across 2 tokens:

**Tokens:**
- USDC (Normal): `0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8`
- eUSDC (Confidential): `0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200`

**Payment Types:**
1. **Transfer** - Standard ERC-20 transfer (user submits transaction)
2. **Authorization** - EIP-3009 authorization (off-chain signature, server submits)
3. **Confidential** - BITE encrypted transfer (amount hidden from public)
4. **Confidential-Auth** - BITE encrypted + EIP-3009 (confidential + off-chain)

## Quick Start

### 1. Configure

Create a `.env` file in the demo directory:

```bash
# Server Configuration  
SERVER_ADDRESS=0xYourServerAddress
SERVER_SECRET_KEY=demo-secret-key-change-in-production
SERVER_PORT=3000
```

**Required values:**

| Variable | Description | How to get |
|----------|-------------|------------|
| `SERVER_ADDRESS` | Address to receive payments | Use a separate wallet address |
| `SERVER_SECRET_KEY` | Secret for signing receipts | Any random string |

### 2. Run Server

```bash
cd demo
bun install
bun run dev
```

Server will start on http://localhost:3000

## API Endpoints

All endpoints accept payments and return premium content after verification:

### Standard Transfer
```
GET /pay/transfer?token=USDC|eUSDC
```
User submits ERC-20 transfer transaction directly.

### EIP-3009 Authorization
```
GET /pay/authorization?token=USDC|eUSDC
```
User signs authorization off-chain, server submits and pays gas.

### Confidential Transfer
```
GET /pay/confidential?token=eUSDC
```
User submits BITE encrypted transaction. Amount is hidden on-chain.

### Confidential + Authorization
```
GET /pay/confidential-auth?token=eUSDC
```
User signs encrypted authorization off-chain. Server submits. Amount hidden, server pays gas.

## Response Format

### 402 Payment Required (Initial Request)
```json
{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "challenge": "..."
}
```

### 200 Success (After Payment)
```json
{
  "message": "🎉 Welcome to Premium Content!",
  "data": {
    "secret": "This is exclusive content...",
    "timestamp": "..."
  },
  "payment": {
    "type": "transfer",
    "token": "0xc408...",
    "method": "skale",
    "reference": "0x...",
    "timestamp": "..."
  }
}
```

## Web Client

This server is designed to work with the web-based demo client in `../demo-web/`.

See [demo-web/README.md](../demo-web/README.md) for the complete web demo setup.

## Network Details

- **Chain**: SKALE BITE Sandbox
- **Chain ID**: 103698795
- **RPC**: https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox
- **Explorer**: https://base-sepolia-testnet-explorer.skalenodes.com:10032

## Architecture

```
Web Client (React + RainbowKit)
         │
         │ HTTP 402 Payment Flow
         │
         ▼
   ┌─────────────┐
   │   Server    │
   │  (this dir) │
   │             │
   │ MPP Handler │
   │  - Verify   │
   │  - Submit   │
   └─────────────┘
         │
         │ Transaction Verification
         │
         ▼
SKALE BITE Sandbox
   ┌─────────────┐
   │    USDC     │
   │ 0xc408...   │
   ├─────────────┤
   │   eUSDC     │
   │ 0x36A9...   │
   │ (BITE)      │
   └─────────────┘
```

## Troubleshooting

### Server won't start
- Check that `SERVER_ADDRESS` is set in `.env`
- Verify port 3000 is not already in use

### Transactions not verifying
- Check server logs for detailed error messages
- Ensure the server has a funded wallet for gasless transactions
- Verify the token contract addresses are correct

## Next Steps

- Integrate with your own API
- Add session-based billing (streaming payments)
- Deploy to production with mainnet
- Add webhook notifications
