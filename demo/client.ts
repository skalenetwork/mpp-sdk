/**
 * SKALE MPP Demo Client
 * 
 * Makes a payment to access premium content using a specific payment type
 * 
 * Run: bun run client.ts [payment-type]
 * 
 * Payment types:
 *   transfer          - Standard ERC-20 transfer (user submits transaction)
 *   authorization     - EIP-3009 authorization (off-chain signature)
 *   confidential      - BITE encrypted transfer (hidden amount)
 *   confidential-auth - BITE + EIP-3009 (encrypted + off-chain)
 * 
 * Make sure the server is running first: bun run server
 */

// @ts-nocheck
// ^ Disable strict checking for demo purposes

import { Mppx } from 'mppx/client'
import { skale } from '../src/client.js'
import { createWalletClient, createPublicClient, http, formatEther, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000'
const PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY || ''
const PAYMENT_TYPE = process.argv[2] || process.env.PAYMENT_TYPE || 'transfer'
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8'

console.log(`🎯 SKALE MPP Demo Client`)
console.log(`   Server: ${SERVER_URL}`)
console.log(`   Payment Type: ${PAYMENT_TYPE}\n`)

if (!PRIVATE_KEY || PRIVATE_KEY === '') {
  console.error('❌ Error: CLIENT_PRIVATE_KEY not set in .env')
  console.error('   Create a .env file with: CLIENT_PRIVATE_KEY=0x...')
  process.exit(1)
}

// Map payment types to routes and skale parameters
const paymentConfig: Record<string, { route: string; confidential: boolean; gasless: boolean; description: string }> = {
  transfer: {
    route: '/pay/transfer',
    confidential: false,
    gasless: false,
    description: 'Standard ERC-20 transfer (user submits transaction)',
  },
  authorization: {
    route: '/pay/authorization',
    confidential: false,
    gasless: true,
    description: 'EIP-3009 authorization (off-chain signature, server submits)',
  },
  confidential: {
    route: '/pay/confidential',
    confidential: true,
    gasless: false,
    description: 'BITE encrypted transfer (amount hidden from public view)',
  },
  'confidential-auth': {
    route: '/pay/confidential-auth',
    confidential: true,
    gasless: true,
    description: 'BITE encrypted + EIP-3009 (confidential amount + off-chain)',
  },
}

const config = paymentConfig[PAYMENT_TYPE]

if (!config) {
  console.error(`❌ Invalid payment type: ${PAYMENT_TYPE}`)
  console.error(`\nValid types:`)
  Object.entries(paymentConfig).forEach(([type, cfg]) => {
    console.error(`   ${type.padEnd(18)} - ${cfg.description}`)
  })
  process.exit(1)
}

console.log(`📖 ${config.description}\n`)

const account = privateKeyToAccount(PRIVATE_KEY as any)
const accountAddress = typeof account === 'string' ? account : account.address

// SKALE BITE Sandbox chain config
const chain = {
  id: 103698795,
  name: 'SKALE BITE Sandbox',
  nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' },
  rpcUrls: {
    default: { http: ['https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox'] },
  },
}

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
})

// Public client for reading balances
const publicClient = createPublicClient({
  chain,
  transport: http(),
})

// ERC-20 ABI for balance checking
const erc20Abi = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Check and display balances
async function checkBalances() {
  console.log('💰 Checking wallet balances...\n')
  
  // Check sFUEL (gas) balance
  const sFuelBalance = await publicClient.getBalance({
    address: accountAddress,
  })
  console.log(`   sFUEL (gas): ${formatEther(sFuelBalance)} sFUEL`)
  if (sFuelBalance === 0n && !config.gasless) {
    console.error('   ⚠️  WARNING: No sFUEL balance! You need sFUEL for gas.')
    console.error('   Get sFUEL from https://faucet.skale.network/')
  }
  
  // Check USDC balance
  try {
    const [usdcBalance, usdcDecimals, usdcSymbol] = await Promise.all([
      publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [accountAddress],
      }),
      publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
      publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
    ])
    
    const formattedBalance = formatUnits(usdcBalance, usdcDecimals)
    console.log(`   ${usdcSymbol}: ${formattedBalance} ${usdcSymbol}`)
    
    // Calculate minimum balance based on actual token decimals (0.001 tokens)
    const minBalance = 10n ** BigInt(usdcDecimals - 3) // 10^(decimals-3) = 0.001
    if (usdcBalance < minBalance) {
      console.error(`   ⚠️  WARNING: Low ${usdcSymbol} balance! You need at least 0.001 ${usdcSymbol}.`)
      console.error(`   Get ${usdcSymbol} from https://faucet.skale.network/`)
    }
  } catch (error) {
    console.log(`   USDC: Unable to read balance (token may not exist at ${TOKEN_ADDRESS})`)
  }
  
  console.log('') // Empty line for spacing
}

const mppx = Mppx.create({
  methods: [
    skale.charge({
      account,
      getClient: () => Promise.resolve(walletClient as any),
      confidential: config.confidential,
      gasless: config.gasless,
      validDuration: 300,
    }),
  ],
  polyfill: false,
})

async function main() {
  try {
    // Check balances first
    await checkBalances()
    
    const url = `${SERVER_URL}${config.route}`
    console.log(`🌐 Fetching: ${url}`)
    console.log(`   Payment mode: ${config.confidential ? 'confidential' : 'normal'}, ${config.gasless ? 'gasless' : 'user pays gas'}`)
    console.log('')
    
    const response = await mppx.fetch(url)
    
    console.log(`\n📊 Response Status: ${response.status}`)
    
    if (response.ok) {
      const data = await response.json()
      console.log('\n✅ SUCCESS! Payment accepted.')
      console.log('\n📄 Premium Content:')
      console.log(JSON.stringify(data, null, 2))
      
      const receiptHeader = response.headers.get('Payment-Receipt')
      if (receiptHeader) {
        console.log('\n🧾 Payment Receipt Header:')
        console.log(receiptHeader)
      }
    } else {
      console.error(`\n❌ Request failed: ${response.status}`)
      const text = await response.text()
      console.error('Response:', text)
    }
  } catch (error) {
    console.error('\n❌ Error:', error)
    console.error('\n💡 Make sure:')
    console.error('   1. Server running: bun run server')
    console.error('   2. Valid private key with tokens')
    console.error('   3. Server address configured')
  }
}

main()
