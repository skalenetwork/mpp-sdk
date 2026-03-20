# SKALE MPP Web Demo

A complete web-based demo for SKALE Metered Payment Protocol (MPP) with wallet connection.

## ⚠️ IMPORTANT: Run from `demo-web` directory!

Make sure you're in the **correct directory** before running commands:

```bash
cd /Users/thegreataxios/skale/mpp-explore/mpp-skale/demo-web  # ✓ CORRECT
# NOT: cd /Users/thegreataxios/skale/mpp-explore/mpp-skale/demo  # ✗ WRONG
```

## Features

- **Wallet Connection**: Connect with MetaMask, Rainbow, or any WalletConnect-compatible wallet via RainbowKit
- **Dual Token Support**: 
  - USDC (Normal ERC-20)
  - eUSDC (Confidential/BITE encrypted)
- **4 Payment Modes**:
  1. Standard Transfer (user submits transaction)
  2. EIP-3009 Authorization (off-chain signature, server pays gas)
  3. Confidential Transfer (BITE encrypted, user pays gas)
  4. Confidential + Authorization (BITE + EIP-3009, server pays gas)
- **Confidential Token Registration**: Register your public key for confidential transfers
- **Real-time Balance Display**: Shows sFUEL, USDC, and eUSDC balances
- **Transaction Logs**: Detailed logging of all payment attempts

## Quick Start

**⚠️ Make sure you're in the `demo-web` directory!**

```bash
cd /Users/thegreataxios/skale/mpp-explore/mpp-skale/demo-web
```

1. **Get a WalletConnect Project ID**:
   - Go to https://cloud.walletconnect.com
   - Create a new project
   - Copy the Project ID

2. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

3. **Edit .env** and add your values:
   ```
   VITE_WALLET_CONNECT_PROJECT_ID=your_project_id_here
   VITE_SERVER_URL=http://localhost:3000
   ```

4. **Install dependencies** (one-time setup):
   ```bash
   bun install
   ```

5. **Run the complete demo** (server + web client):
   ```bash
   # Make sure you're in demo-web directory!
   pwd  # Should show: .../mpp-explore/mpp-skale/demo-web
   bun run dev
   ```
   
   This will start:
   - MPP server on http://localhost:3000
   - Web client on http://localhost:5173

6. **Open your browser**:
   Navigate to http://localhost:5173

## Development Mode

Run server and client separately:

```bash
# Terminal 1: Start server
 bun run dev:server

# Terminal 2: Start web client
 bun run dev:client
```

## Usage

### 1. Connect Wallet
Click "Connect Wallet" button in the top right to connect your MetaMask or other wallet.

### 2. Select Token
- **USDC**: Normal ERC-20 token for standard transfers
- **eUSDC**: Confidential token with BITE encryption

### 3. Check Balances
The app will display your:
- sFUEL balance (for gas)
- USDC balance
- eUSDC balance

### 4. For Confidential Tokens (eUSDC)
If using eUSDC for the first time, you'll need to:
- Click "Register for Confidential Transfers"
- Confirm the transaction in your wallet
- This registers your public key on the contract

### 5. Make Payment
Choose a payment method:
- **Standard Transfer**: Normal ERC-20 transfer (you pay gas)
- **EIP-3009 Authorization**: Sign off-chain, server submits and pays gas
- **Confidential Transfer**: BITE encrypted transfer (you pay gas)
- **Confidential + Auth**: Encrypted + server pays gas

### 6. View Results
Successful payments will show:
- Success message
- Transaction reference
- Premium content from the server
- Entry in the transaction logs

## Architecture

```
Web Client (React + RainbowKit)
         │
         ├── Wallet Connection (MetaMask/Rainbow/etc.)
         ├── Balance Display (sFUEL, USDC, eUSDC)
         ├── Token Selection (USDC/eUSDC)
         ├── Confidential Registration (if eUSDC)
         └── Payment Buttons (4 modes)
         │
         │ HTTP 402 Payment Flow
         │
Server (Bun + MPP)
         │
         ├── Route: /pay/transfer
         ├── Route: /pay/authorization
         ├── Route: /pay/confidential
         └── Route: /pay/confidential-auth
         │
         │ Transaction Verification
         │
SKALE BITE Sandbox
         │
         ├── USDC: 0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8
         └── eUSDC: 0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200
```

## Development

### Project Structure
```
demo-web/
├── src/
│   ├── components/
│   │   ├── PaymentButton.tsx      # Payment method buttons
│   │   ├── BalanceDisplay.tsx     # Wallet balance display
│   │   └── ConfidentialRegistration.tsx  # eUSDC registration
│   ├── App.tsx                    # Main app component
│   ├── App.css                    # Main styles
│   └── main.tsx                   # Entry point with RainbowKit
├── index.html                     # HTML template
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
└── vite.config.ts                # Vite configuration
```

### Key Dependencies
- `@rainbow-me/rainbowkit`: Wallet connection UI
- `wagmi`: Ethereum interactions
- `viem`: Low-level blockchain operations
- `@tanstack/react-query`: Data fetching
- `mppx`: Metered Payment Protocol client
- `@skalenetwork/bite`: BITE encryption (for confidential mode)

## Troubleshooting

### "Cannot connect to wallet"
- Make sure you have MetaMask or another wallet installed
- Check that you're on the SKALE BITE Sandbox network (Chain ID: 103698795)

### "Low balance" warnings
- Get sFUEL (gas) from https://faucet.skale.network
- Get USDC/eUSDC from the same faucet

### "Transaction failed"
- Check the transaction logs in the UI
- Verify you have enough gas (sFUEL)
- For confidential transfers, make sure you're registered

## Network Details

- **Chain**: SKALE BITE Sandbox
- **Chain ID**: 103698795
- **RPC**: https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox
- **USDC**: 0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8
- **eUSDC**: 0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200

## License

MIT License - See LICENSE file for details
