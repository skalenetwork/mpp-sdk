/**
 * SKALE MPP Demo Web Server
 * 
 * HTTP server with 4 payment endpoints for the web demo
 * Updated for the new evm API with chain presets
 * 
 * Run: bun run server.ts
 */

// @ts-nocheck

import { Mppx } from 'mppx/server'
import { skaleServer as skale } from '../../src/index.js'
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
    blockTime: 1,
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

if (!SERVER_ADDRESS) {
  console.error('❌ Error: SERVER_ADDRESS not set in .env')
  console.error('   Create a .env file with: SERVER_ADDRESS=0x...')
  process.exit(1)
}

// Create wallet client for gasless modes
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

// Create MPP servers using new evm API
const servers = {
  transfer: Mppx.create({
    methods: [skale({
      client: publicClient,
      chain: 'bite-sandbox',
      currency: USDC,
      extensions: {
        skale: { encrypted: false, confidentialToken: false },
        gasless: false,
      },
      testnet: true,
    })],
    realm: `localhost:${PORT}`,
    secretKey: SECRET_KEY,
  }),
  
  authorization: Mppx.create({
    methods: [skale({
      client: serverWallet || publicClient,
      chain: 'bite-sandbox',
      currency: USDC,
      extensions: {
        skale: { encrypted: false, confidentialToken: false },
        gasless: true,
      },
      serverAccount: serverWallet?.account,
      testnet: true,
    })],
    realm: `localhost:${PORT}`,
    secretKey: SECRET_KEY,
  }),
  
  confidential: Mppx.create({
    methods: [skale({
      client: publicClient,
      chain: 'bite-sandbox',
      currency: EUSDC,
      extensions: {
        skale: { encrypted: true, confidentialToken: true },
        gasless: false,
      },
      testnet: true,
    })],
    realm: `localhost:${PORT}`,
    secretKey: SECRET_KEY,
  }),
  
  'confidential-auth': Mppx.create({
    methods: [skale({
      client: serverWallet || publicClient,
      chain: 'bite-sandbox',
      currency: EUSDC,
      extensions: {
        skale: { encrypted: true, confidentialToken: true },
        gasless: true,
      },
      serverAccount: serverWallet?.account,
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

// Helper to handle payment
async function handlePayment(mppxInstance: any, request: Request, paymentType: string, tokenAddress: string, decimals: number = 18) {
  console.log(`\n🔔 New payment request:`)
  console.log(`   Type: ${paymentType}`)
  console.log(`   Token: ${tokenAddress}`)
  console.log(`   Decimals: ${decimals}`)
  console.log(`   Server: ${SERVER_ADDRESS}`)
  console.log(`   Amount: 0.001 tokens`)
  
  const startTime = Date.now()
  
  try {
    console.log('   Calling MPP charge handler...')
    const result = await mppxInstance['charge']({
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
      
      const newHeaders = new Headers(challenge.headers)
      newHeaders.set('Access-Control-Allow-Origin', '*')
      newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, WWW-Authenticate, Accept')
      newHeaders.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Content-Type, Authorization')
      
      return new Response(challenge.body, { 
        status: 402, 
        headers: newHeaders 
      })
    }
    
    if (result.status === 200) {
      console.log(`✅ Payment successful!`)
      
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
            method: 'evm',
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
    
    console.error(`❌ Unexpected status: ${result.status}`)
    return new Response(`Payment verification failed with status ${result.status}`, { status: 500 })
    
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`\n❌ Payment handler error (${duration}ms):`)
    console.error('   Error:', error instanceof Error ? error.message : String(error))
    
    return new Response(`Payment verification failed: ${error instanceof Error ? error.message : String(error)}`, { status: 500 })
  }
}

// HTTP Server
const httpServer = Bun.serve({
  port: PORT,
  async fetch(request: Request) {
    const url = new URL(request.url)
    
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
    
    const tokenParam = url.searchParams.get('token')?.toLowerCase()
    
    // Route per payment type
    if (url.pathname === '/pay/transfer') {
      console.log('   → Route: /pay/transfer')
      const token = tokenParam === 'eusdc' ? EUSDC : USDC
      const decimals = tokenParam === 'eusdc' ? 18 : 6
      console.log(`   Using ${token === USDC ? 'USDC' : 'eUSDC'} with ${decimals} decimals`)
      const response = await handlePayment(servers.transfer, request, 'transfer', token, decimals)
      console.log(`   ← Response: ${response.status}`)
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
console.log(`   cd examples/demo-web && bun run dev`)
console.log(`   Then open http://localhost:5173 in your browser.\n`)
