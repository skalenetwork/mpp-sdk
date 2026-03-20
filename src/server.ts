import type { Address } from 'viem'
import { getTransactionReceipt, writeContract } from 'viem/actions'
import { isAddressEqual } from 'viem/utils'
import { Method } from 'mppx'
import { charge as chargeMethod } from './method.js'

const chainId = 103698795

export class PaymentExpiredError extends Error {
  override readonly name = 'PaymentExpiredError'
  expires: string
  constructor({ expires }: { expires: string }) {
    super(`Payment expired at ${expires}`)
    this.expires = expires
  }
}

export type TokenOption = {
  address: Address
  symbol: string
  decimals: number
}

export type ServerParameters = {
  amount?: string | undefined
  confidential?: boolean | undefined
  currency?: string | undefined
  decimals?: number | undefined
  description?: string | undefined
  externalId?: string | undefined
  gasless?: boolean | undefined
  getClient?: () => Promise<any>
  recipient?: string | undefined
  testnet?: boolean | undefined
  tokens?: TokenOption[] | undefined
  waitForConfirmation?: boolean | undefined
}

// Helper to poll for transaction receipt with retries
async function pollForReceipt(client: any, hash: `0x${string}`, maxAttempts = 40, intervalMs = 250) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const receipt = await getTransactionReceipt(client, { hash })
      if (receipt) return receipt
    } catch (error) {
      // Receipt not found yet, continue polling
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return null
}

// Server implementation WITHOUT defaults - params passed at call time
function createNormalMode(parameters: ServerParameters) {
  const { getClient, waitForConfirmation = true } = parameters
  
  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return { ...request, chainId }
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = await getClient?.()
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) throw new PaymentExpiredError({ expires })
      
      const payload = credential.payload as { type: 'hash'; hash: `0x${string}` }
      if (payload.type !== 'hash') throw new Error('Expected hash credential')
      
      if (waitForConfirmation && client) {
        console.log('🔍 Server: Looking for transaction receipt:', payload.hash)
        const receipt = await pollForReceipt(client, payload.hash)
        if (!receipt) {
          console.error('❌ Server: Transaction not confirmed after polling. Hash:', payload.hash)
          throw new Error(`Transaction not confirmed after 10 attempts. Hash: ${payload.hash}`)
        }
        console.log('✅ Server: Found receipt with', receipt.logs.length, 'logs')
        console.log('   Transaction hash:', receipt.transactionHash)
        console.log('   Block number:', receipt.blockNumber)
        
        console.log('🔍 Server: Searching for Transfer event (topic0: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef)')
        receipt.logs.forEach((log, i) => {
          console.log(`   Log[${i}]: address=${log.address}, topic0=${log.topics[0]}`)
        })
        
        const transferLog = receipt.logs.find(log => 
          log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        )
        if (!transferLog) {
          console.error('❌ Server: No Transfer event found in transaction logs')
          throw new Error('No transfer found in transaction')
        }
        console.log('✅ Server: Found Transfer event at address:', transferLog.address)
        
        const currency = challenge.request.currency as Address
        console.log('🔍 Server: Checking token match. Expected:', currency, 'Got:', transferLog.address)
        if (!isAddressEqual(transferLog.address as Address, currency)) {
          console.error('❌ Server: Token address mismatch!')
          throw new Error(`Token mismatch: expected ${currency}, got ${transferLog.address}`)
        }
        console.log('✅ Server: Token address verified')
        
        return {
          method: 'skale' as const,
          status: 'success' as const,
          timestamp: new Date().toISOString(),
          reference: receipt.transactionHash,
        }
      }
      
      return {
        method: 'skale' as const,
        status: 'success' as const,
        timestamp: new Date().toISOString(),
        reference: payload.hash,
      }
    },
  })
}

function createGaslessMode(parameters: ServerParameters) {
  const { getClient } = parameters
  
  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return { ...request, chainId }
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = await getClient?.()
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) throw new PaymentExpiredError({ expires })
      
      const payload = credential.payload as { 
        type: 'authorization'
        authorization: {
          from: string
          to: string
          value: string
          validAfter: string
          validBefore: string
          nonce: string
        }
        signature: { v: number; r: string; s: string }
      }
      if (payload.type !== 'authorization') throw new Error('Expected authorization credential')
      
      console.log('🔍 Server: Gasless verification - received authorization:', {
        from: payload.authorization.from,
        to: payload.authorization.to,
        value: payload.authorization.value,
        validAfter: payload.authorization.validAfter,
        validBefore: payload.authorization.validBefore,
        nonce: payload.authorization.nonce,
        v: payload.signature.v,
        r: payload.signature.r.slice(0, 20) + '...',
        s: payload.signature.s.slice(0, 20) + '...',
      })
      
      if (!client) throw new Error('Client required for gasless mode')
      if (!client.account) throw new Error('Client account required')
      if (!client.chain) throw new Error('Client chain required')
      
      console.log('🔍 Server: Server wallet:', client.account.address)
      
      const currency = challenge.request.currency as Address
      const recipient = challenge.request.recipient as Address
      const amount = challenge.request.amount as string
      
      console.log('🔍 Server: About to submit transaction with args:', {
        from: payload.authorization.from,
        to: recipient,
        value: amount,
        validAfter: payload.authorization.validAfter,
        validBefore: payload.authorization.validBefore,
        nonce: payload.authorization.nonce,
        v: payload.signature.v,
        r: payload.signature.r,
        s: payload.signature.s,
      })
      
      const hash = await writeContract(client, {
        account: client.account,
        chain: client.chain,
        address: currency,
        abi: [
          {
            inputs: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'validAfter', type: 'uint256' },
              { name: 'validBefore', type: 'uint256' },
              { name: 'nonce', type: 'bytes32' },
              { name: 'v', type: 'uint8' },
              { name: 'r', type: 'bytes32' },
              { name: 's', type: 'bytes32' },
            ],
            name: 'transferWithAuthorization',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ],
        functionName: 'transferWithAuthorization',
        args: [
          payload.authorization.from as Address,
          recipient,
          BigInt(amount),
          BigInt(payload.authorization.validAfter),
          BigInt(payload.authorization.validBefore),
          payload.authorization.nonce as `0x${string}`,
          payload.signature.v,
          payload.signature.r as `0x${string}`,
          payload.signature.s as `0x${string}`,
        ],
      })
      
      console.log('✅ Server: Transaction submitted, hash:', hash)
      
      return {
        method: 'skale' as const,
        status: 'success' as const,
        timestamp: new Date().toISOString(),
        reference: hash,
      }
    },
  })
}

function createConfidentialMode(parameters: ServerParameters) {
  const { getClient, waitForConfirmation = true } = parameters
  
  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return { ...request, chainId }
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = await getClient?.()
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) throw new PaymentExpiredError({ expires })
      
      const payload = credential.payload as { type: 'hash'; hash: `0x${string}` }
      if (payload.type !== 'hash') throw new Error('Expected hash credential')
      
      if (waitForConfirmation && client) {
        console.log('🔍 Server: Looking for confidential transaction receipt:', payload.hash)
        const receipt = await pollForReceipt(client, payload.hash)
        if (!receipt) {
          console.error('❌ Server: Transaction not confirmed after polling. Hash:', payload.hash)
          throw new Error(`Transaction not confirmed after 10 attempts. Hash: ${payload.hash}`)
        }
        
        console.log('✅ Server: Found receipt with', receipt.logs.length, 'logs')
        console.log('   Transaction hash:', receipt.transactionHash)
        console.log('   Block number:', receipt.blockNumber)
        
        const currency = challenge.request.currency as Address
        console.log('🔍 Server: Checking for interaction with token:', currency)
        
        // For confidential transfers, check if ANY log is from the token contract
        // BITE doesn't emit standard Transfer events, it emits encrypted events
        const tokenInteraction = receipt.logs.find(log => 
          isAddressEqual(log.address as Address, currency)
        )
        
        if (!tokenInteraction) {
          console.error('❌ Server: No interaction found with token contract')
          throw new Error('No matching transfer found')
        }
        
        console.log('✅ Server: Found interaction with token contract')
        console.log('   Log address:', tokenInteraction.address)
        console.log('   Topic0:', tokenInteraction.topics[0])
        
        return {
          method: 'skale' as const,
          status: 'success' as const,
          timestamp: new Date().toISOString(),
          reference: receipt.transactionHash,
        }
      }
      
      return {
        method: 'skale' as const,
        status: 'success' as const,
        timestamp: new Date().toISOString(),
        reference: payload.hash,
      }
    },
  })
}

function createConfidentialGaslessMode(parameters: ServerParameters) {
  const { getClient } = parameters
  
  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return { ...request, chainId }
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = await getClient?.()
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) throw new PaymentExpiredError({ expires })
      
      const payload = credential.payload as { 
        type: 'authorization'
        authorization: {
          from: string
          to: string
          value: string
          validAfter: string
          validBefore: string
          nonce: string
        }
        signature: { v: number; r: string; s: string }
      }
      if (payload.type !== 'authorization') throw new Error('Expected authorization credential')
      
      if (!client) throw new Error('Client required for gasless mode')
      if (!client.account) throw new Error('Client account required')
      if (!client.chain) throw new Error('Client chain required')
      
      const currency = challenge.request.currency as Address
      const recipient = challenge.request.recipient as Address
      const amount = challenge.request.amount as string
      
      const hash = await writeContract(client, {
        account: client.account,
        chain: client.chain,
        address: currency,
        abi: [
          {
            inputs: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'validAfter', type: 'uint256' },
              { name: 'validBefore', type: 'uint256' },
              { name: 'nonce', type: 'bytes32' },
              { name: 'v', type: 'uint8' },
              { name: 'r', type: 'bytes32' },
              { name: 's', type: 'bytes32' },
            ],
            name: 'transferWithAuthorization',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ],
        functionName: 'transferWithAuthorization',
        args: [
          payload.authorization.from as Address,
          recipient,
          BigInt(amount),
          BigInt(payload.authorization.validAfter),
          BigInt(payload.authorization.validBefore),
          payload.authorization.nonce as `0x${string}`,
          payload.signature.v,
          payload.signature.r as `0x${string}`,
          payload.signature.s as `0x${string}`,
        ],
      })
      
      return {
        method: 'skale' as const,
        status: 'success' as const,
        timestamp: new Date().toISOString(),
        reference: hash,
      }
    },
  })
}

export function charge(parameters: ServerParameters = {}) {
  const { confidential = false, gasless = false } = parameters
  
  if (confidential && gasless) {
    return createConfidentialGaslessMode(parameters)
  } else if (confidential) {
    return createConfidentialMode(parameters)
  } else if (gasless) {
    return createGaslessMode(parameters)
  } else {
    return createNormalMode(parameters)
  }
}

// Export skale namespace for convenience
export const skale = { charge }
export type { ServerParameters as Parameters }
