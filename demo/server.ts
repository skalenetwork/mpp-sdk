/**
 * SKALE MPP Demo Server
 * 
 * A simple HTTP server with separate routes for each payment type
 * Each route has its own MPP instance configured for ONE payment method
 * Supports both USDC (normal) and eUSDC (confidential)
 * 
 * Run: bun run server.ts
 * Server will start on http://localhost:3000
 */

// @ts-nocheck
// ^ Disable strict checking for demo purposes

import { Mppx } from 'mppx/server'
import { skale } from '../src/server.js'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// Setup public client for SKALE BITE Sandbox
const publicClient = createPublicClient({
  chain: {
    id: 103698795,
    name: 'SKALE BITE Sandbox',
    nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' },
    rpcUrls: {
      default: { http: ['https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox'] },
    },
    blockTime: 1, // 1 second block time
  },
  transport: http(),
})

// Server configuration
const SERVER_ADDRESS = process.env.SERVER_ADDRESS || ''
const SECRET_KEY = process.env.SERVER_SECRET_KEY || 'demo-secret-key-change-in-production'
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY || ''
const PORT = parseInt(process.env.SERVER_PORT || '3000')

// Token addresses
const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8'
const EUSDC = '0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200'

if (!SERVER_ADDRESS || SERVER_ADDRESS === '') {
  console.error('❌ Error: SERVER_ADDRESS not set in .env')
  console.error('   Create a .env file with: SERVER_ADDRESS=0x...')
  process.exit(1)
}

// Create wallet client for gasless modes (EIP-3009 authorization)
// The server needs a funded account to submit transactions on behalf of users
let serverWallet: any = null
if (SERVER_PRIVATE_KEY) {
  serverWallet = createWalletClient({
    account: privateKeyToAccount(SERVER_PRIVATE_KEY as `0x${string}`),
    chain: {
      id: 103698795,
      name: 'SKALE BITE Sandbox',
      nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' },
      rpcUrls: {
        default: { http: ['https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox'] },
      },
    },
    transport: http(),
  })
  console.log(`🔑 Server wallet configured: ${serverWallet.account.address}`)
} else {
  console.log(`⚠️  SERVER_PRIVATE_KEY not set - gasless modes will fail`)
}

// Create 4 separate MPP instances - one for each payment type
// This ensures each route only accepts ONE specific payment method
const servers = {
  // Standard ERC-20 transfer (user submits transaction)
  transfer: Mppx.create({
    methods: [skale.charge({
      getClient: () => Promise.resolve(publicClient as any),
      confidential: false,
      gasless: false,
      testnet: true,
    })],
    realm: `localhost:${PORT}`,
    secretKey: SECRET_KEY,
  }),
  
  // EIP-3009 authorization (off-chain signature, server submits)
  // REQUIRES server wallet with sFUEL for gas
  authorization: Mppx.create({
    methods: [skale.charge({
      getClient: () => Promise.resolve(serverWallet || publicClient as any),
      confidential: false,
      gasless: true,
      testnet: true,
    })],
    realm: `localhost:${PORT}`,
    secretKey: SECRET_KEY,
  }),
  
  // BITE confidential transfer (encrypted amount)
  confidential: Mppx.create({
    methods: [skale.charge({
      getClient: () => Promise.resolve(publicClient as any),
      confidential: true,
      gasless: false,
      testnet: true,
    })],
    realm: `localhost:${PORT}`,
    secretKey: SECRET_KEY,
  }),
  
  // BITE confidential + EIP-3009 authorization
  // REQUIRES server wallet with sFUEL for gas
  'confidential-auth': Mppx.create({
    methods: [skale.charge({
      getClient: () => Promise.resolve(serverWallet || publicClient as any),
      confidential: true,
      gasless: true,
      testnet: true,
    })],
    realm: `localhost:${PORT}`,
    secretKey: SECRET_KEY,
  }),
}

// Helper to log request details
function logRequest(request: Request, url: URL) {
  console.log(`\n📥 ${request.method} ${url.pathname}${url.search}`)
  console.log(`   Headers:`)
  request.headers.forEach((value, key) => {
    if (key.toLowerCase().includes('authorization') || key.toLowerCase().includes('payment')) {
      console.log(`     ${key}: ${value.substring(0, 50)}...`)
    } else {
      console.log(`     ${key}: ${value}`)
    }
  })
}

// Helper to handle payment and return content
async function handlePayment(mppxInstance: any, request: Request, paymentType: string, tokenAddress: string, decimals: number = 18) {
  console.log(`\n🔔 New payment request:`)
  console.log(`   Type: ${paymentType}`)
  console.log(`   Token: ${tokenAddress}`)
  console.log(`   Decimals: ${decimals}`)
  console.log(`   Server: ${SERVER_ADDRESS}`)
  console.log(`   Amount: 0.001 tokens`)
  
  const startTime = Date.now()
  
  try {
    // Call the charge handler with explicit parameters
    console.log('   Calling MPP charge handler...')
    const result = await mppxInstance['skale/charge']({
      amount: '0.001',
      decimals,
      currency: tokenAddress,
      recipient: SERVER_ADDRESS,
      description: `Premium content via ${paymentType}`,
    })(request)
    
    const duration = Date.now() - startTime
    console.log(`   Handler completed in ${duration}ms`)
    console.log(`   Result status: ${result.status}`)
    
    if (result.status === 402) {
      console.log('📤 Sending 402 challenge to client')
      const challenge = result.challenge
      
      // Clone the response so we can read it for logging without consuming the original
      const clonedResponse = challenge.clone()
      
      try {
        const bodyText = await clonedResponse.text()
        const challengeData = JSON.parse(bodyText)
        console.log('   Challenge details:')
        console.log('     ID:', challengeData.id || 'N/A')
        console.log('     Amount:', challengeData.request?.amount)
        console.log('     Currency:', challengeData.request?.currency)
        console.log('     Expires:', challengeData.expires)
      } catch (e) {
        console.log('   (Could not parse challenge body for logging)')
      }
      
      // Ensure challenge has proper headers for browser
      const newHeaders = new Headers(challenge.headers)
      newHeaders.set('Access-Control-Allow-Origin', '*')
      newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, WWW-Authenticate, Accept')
      newHeaders.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Content-Type, Authorization')
      
      console.log('   Response headers set with CORS')
      
      return new Response(challenge.body, { 
        status: 402, 
        headers: newHeaders 
      })
    }
    
    if (result.status === 200) {
      console.log(`✅ Payment successful!`)
      console.log('   Status: 200 OK')
      console.log('   Type:', paymentType)
      console.log('   Token:', tokenAddress)
      console.log('   Server wallet:', serverWallet?.account?.address || 'N/A')
      
      // The receipt is embedded by withReceipt() method
      // We construct the response data here
      return result.withReceipt(new Response(
        JSON.stringify({
          message: '🎉 Welcome to Premium Content!',
          data: {
            secret: 'This is exclusive content only for paying customers',
            timestamp: new Date().toISOString(),
          },
          payment: {
            type: paymentType,
            token: tokenAddress,
            method: 'skale',
            timestamp: new Date().toISOString(),
          },
        }, null, 2),
        {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
          },
        }
      ))
    }
    
    // Unexpected status
    console.error(`❌ Unexpected status: ${result.status}`)
    return new Response(`Payment verification failed with status ${result.status}`, { status: 500 })
    
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`\n❌ Payment handler error (${duration}ms):`)
    console.error('   Error:', error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.stack) {
      console.error('   Stack:', error.stack.split('\n').slice(0, 3).join('\n     '))
    }
    
    return new Response(`Payment verification failed: ${error instanceof Error ? error.message : String(error)}`, { status: 500 })
  }
}

// HTTP Server
const httpServer = Bun.serve({
  port: PORT,
  async fetch(request: Request) {
    const url = new URL(request.url)
    
    // Log all requests
    logRequest(request, url)
    
    // Enable CORS for web client
    if (request.method === 'OPTIONS') {
      console.log('   → Responding to OPTIONS (CORS preflight)')
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, WWW-Authenticate, Accept',
          'Access-Control-Expose-Headers': 'WWW-Authenticate, Content-Type, Authorization',
        },
      })
    }
    
    // Parse token from query param (default to appropriate token for the route)
    const tokenParam = url.searchParams.get('token')?.toLowerCase()
    
    // Route per payment type - each has its own MPP instance
    if (url.pathname === '/pay/transfer') {
      console.log('   → Route: /pay/transfer')
      const token = tokenParam === 'eusdc' ? EUSDC : USDC
      const decimals = tokenParam === 'eusdc' ? 18 : 6  // eUSDC: 18, USDC: 6
      console.log(`   Using ${token === USDC ? 'USDC' : 'eUSDC'} with ${decimals} decimals`)
      const response = await handlePayment(servers.transfer, request, 'transfer', token, decimals)
      console.log(`   ← Response: ${response.status}`)
      // Add CORS headers to response
      const newHeaders = new Headers(response.headers)
      newHeaders.set('Access-Control-Allow-Origin', '*')
      newHeaders.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Content-Type, Authorization')
      return new Response(response.body, { status: response.status, headers: newHeaders })
    }
    
    if (url.pathname === '/pay/authorization') {
      console.log('   → Route: /pay/authorization')
      const token = tokenParam === 'eusdc' ? EUSDC : USDC
      const decimals = tokenParam === 'eusdc' ? 18 : 6
      console.log(`   Using ${token === USDC ? 'USDC' : 'eUSDC'} with ${decimals} decimals`)
      console.log(`   Server wallet available: ${serverWallet ? 'Yes' : 'No (will fail)'}`)
      const response = await handlePayment(servers.authorization, request, 'authorization', token, decimals)
      console.log(`   ← Response: ${response.status}`)
      const newHeaders = new Headers(response.headers)
      newHeaders.set('Access-Control-Allow-Origin', '*')
      newHeaders.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Content-Type, Authorization')
      return new Response(response.body, { status: response.status, headers: newHeaders })
    }
    
    if (url.pathname === '/pay/confidential') {
      console.log('   → Route: /pay/confidential')
      console.log('   Using eUSDC with 18 decimals (confidential mode)')
      const response = await handlePayment(servers.confidential, request, 'confidential', EUSDC, 18)
      console.log(`   ← Response: ${response.status}`)
      const newHeaders = new Headers(response.headers)
      newHeaders.set('Access-Control-Allow-Origin', '*')
      newHeaders.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Content-Type, Authorization')
      return new Response(response.body, { status: response.status, headers: newHeaders })
    }
    
    if (url.pathname === '/pay/confidential-auth') {
      console.log('   → Route: /pay/confidential-auth')
      console.log('   Using eUSDC with 18 decimals (confidential + gasless)')
      console.log(`   Server wallet available: ${serverWallet ? 'Yes' : 'No (will fail)'}`)
      const response = await handlePayment(servers['confidential-auth'], request, 'confidential-auth', EUSDC, 18)
      console.log(`   ← Response: ${response.status}`)
      const newHeaders = new Headers(response.headers)
      newHeaders.set('Access-Control-Allow-Origin', '*')
      newHeaders.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Content-Type, Authorization')
      return new Response(response.body, { status: response.status, headers: newHeaders })
    }
    
    if (url.pathname === '/') {
      console.log('   → Route: / (info page)')
      return new Response(
        'SKALE MPP Demo Server\n\n' +
        'Payment Types:\n' +
        '  /pay/transfer?token=USDC|eUSDC     - Standard ERC-20 transfer\n' +
        '  /pay/authorization?token=USDC|eUSDC - EIP-3009 authorization\n' +
        '  /pay/confidential?token=eUSDC      - BITE encrypted transfer\n' +
        '  /pay/confidential-auth?token=eUSDC - BITE + EIP-3009\n\n' +
        'Supported Tokens:\n' +
        `  USDC:  ${USDC}\n` +
        `  eUSDC: ${EUSDC}\n`,
        { 
          status: 200,
          headers: { 
            'Content-Type': 'text/plain', 
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'WWW-Authenticate, Content-Type, Authorization'
          } 
        }
      )
    }
    
    console.log(`   → Route: ${url.pathname} (404 Not Found)`)
    return new Response('Not Found. Try: /pay/transfer, /pay/authorization, /pay/confidential, /pay/confidential-auth', { 
      status: 404,
      headers: { 
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'WWW-Authenticate, Content-Type, Authorization'
      }
    })
  },
})

console.log(`🚀 SKALE MPP Demo Server running on http://localhost:${PORT}`)
console.log(`   Server address: ${SERVER_ADDRESS}`)
if (!SERVER_PRIVATE_KEY) {
  console.log(`\n⚠️  Warning: SERVER_PRIVATE_KEY not set`)
  console.log(`   Gasless modes (/pay/authorization, /pay/confidential-auth) will fail`)
  console.log(`   Transfer modes (/pay/transfer, /pay/confidential) will still work`)
}
console.log(`\n📋 Available endpoints:`)
console.log(`   GET /pay/transfer?token=USDC|eUSDC     - Standard ERC-20 transfer`)  
console.log(`   GET /pay/authorization?token=USDC|eUSDC - EIP-3009 authorization ${!SERVER_PRIVATE_KEY ? '(⚠️ needs SERVER_PRIVATE_KEY)' : ''}`)
console.log(`   GET /pay/confidential?token=eUSDC       - BITE confidential transfer`)
console.log(`   GET /pay/confidential-auth?token=eUSDC   - BITE + EIP-3009 ${!SERVER_PRIVATE_KEY ? '(⚠️ needs SERVER_PRIVATE_KEY)' : ''}`)
console.log(`\n💡 Supported Tokens:`)
console.log(`   USDC:  ${USDC}`)
console.log(`   eUSDC: ${EUSDC}`)
console.log(`\n💡 This is the SERVER only.`)
console.log(`   To run the web demo, use:`)
console.log(`   cd /Users/thegreataxios/skale/mpp-explore/mpp-skale/demo-web && bun run dev`)
console.log(`\n   The web demo will start both the server and web client.`)
console.log(`   Then open http://localhost:5173 in your browser.\n`)
