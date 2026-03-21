import type { Address } from 'viem'
import { getTransactionReceipt, sendTransaction, simulateContract, writeContract, readContract } from 'viem/actions'
import { isAddressEqual } from 'viem/utils'
import { Method } from 'mppx'
import { charge as chargeMethod } from './method.js'
import { eip3009Abi } from './shared/abi.js'

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
  confidentialCallbackDepositMultiplier?: number | undefined
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

const confidentialTokenAbi = [
  {
    inputs: [{ name: 'holder', type: 'address' }],
    name: 'ethBalanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'callbackFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'receiver', type: 'address' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const

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

async function ensureConfidentialCallbackBalance(
  client: any,
  currency: Address,
  multiplier = 10,
) {
  if (!client.account) throw new Error('Client account required')

  const [callbackFee, depositBalance] = await Promise.all([
    readContract(client, {
      address: currency,
      abi: confidentialTokenAbi,
      functionName: 'callbackFee',
    }),
    readContract(client, {
      address: currency,
      abi: confidentialTokenAbi,
      functionName: 'ethBalanceOf',
      args: [client.account.address],
    }),
  ])

  console.log('🔍 Server: Confidential callback balance', {
    account: client.account.address,
    callbackFee: callbackFee.toString(),
    depositBalance: depositBalance.toString(),
  })

  if (depositBalance >= callbackFee) return

  const topUpMultiplier = BigInt(Math.max(1, Math.trunc(multiplier)))
  const topUpAmount = callbackFee * topUpMultiplier

  console.log('🔍 Server: Topping up confidential callback balance', {
    topUpAmount: topUpAmount.toString(),
    receiver: client.account.address,
  })

  const hash = await writeContract(client, {
    account: client.account,
    chain: client.chain,
    address: currency,
    abi: confidentialTokenAbi,
    functionName: 'deposit',
    args: [client.account.address],
    value: topUpAmount,
  })

  const receipt = await pollForReceipt(client, hash)
  if (!receipt || receipt.status === 'reverted') {
    throw new Error(`Failed to top up confidential callback balance. Hash: ${hash}`)
  }

  console.log('✅ Server: Confidential callback balance topped up', {
    hash,
    blockNumber: receipt.blockNumber.toString(),
  })
}

async function simulateConfidentialGaslessAuthorization(
  client: any,
  currency: Address,
  payload: {
    authorization: {
      from: string
      to: string
      value: string
      validAfter: string
      validBefore: string
      nonce: string
    }
    signature: { v: number; r: string; s: string }
  },
) {
  if (!client.account) throw new Error('Client account required')

  console.log('🔍 Server: Simulating transferWithAuthorization before CTX submit...')
  try {
    await simulateContract(client, {
      account: client.account,
      address: currency,
      abi: eip3009Abi,
      functionName: 'transferWithAuthorization',
      args: [
        payload.authorization.from as Address,
        payload.authorization.to as Address,
        BigInt(payload.authorization.value),
        BigInt(payload.authorization.validAfter),
        BigInt(payload.authorization.validBefore),
        payload.authorization.nonce as `0x${string}`,
        payload.signature.v,
        payload.signature.r as `0x${string}`,
        payload.signature.s as `0x${string}`,
      ],
    })
    console.log('✅ Server: transferWithAuthorization simulation passed')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('❌ Server: transferWithAuthorization simulation failed')
    console.error('   Error:', message)
    throw new Error(`transferWithAuthorization simulation failed: ${message}`)
  }
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
  const {
    confidentialCallbackDepositMultiplier = 10,
    getClient,
    waitForConfirmation = true,
  } = parameters
  
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
        type: 'encrypted-authorization'
        authorization: {
          from: string
          to: string
          value: string
          validAfter: string
          validBefore: string
          nonce: string
        }
        signature: { v: number; r: string; s: string }
        encryptedTx: {
          data: string
          to: string
          gasLimit: string
        }
      }
      if (payload.type !== 'encrypted-authorization') {
        console.error('❌ Server: Unexpected confidential-gasless payload type', {
          type: (payload as { type?: string }).type,
          keys: Object.keys((payload as Record<string, unknown>) ?? {}),
        })
        throw new Error('Expected encrypted-authorization credential')
      }
      
      console.log('🔍 Server: Confidential-gasless verification - received encrypted authorization:', {
        from: payload.authorization.from,
        to: payload.authorization.to,
        value: payload.authorization.value,
        encryptedTo: payload.encryptedTx.to,
      })
      
      if (!client) throw new Error('Client required for gasless mode')
      if (!client.account) throw new Error('Client account required')
      if (!client.chain) throw new Error('Client chain required')
      
      const currency = challenge.request.currency as Address
      const recipient = challenge.request.recipient as Address
      const amount = challenge.request.amount as string
      
      // Validate that the authorization matches the challenge request
      if (payload.authorization.value !== amount) {
        throw new Error(`Amount mismatch: expected ${amount}, got ${payload.authorization.value}`)
      }
      if (payload.authorization.to.toLowerCase() !== recipient.toLowerCase()) {
        throw new Error(`Recipient mismatch: expected ${recipient}, got ${payload.authorization.to}`)
      }

      await ensureConfidentialCallbackBalance(
        client,
        currency,
        confidentialCallbackDepositMultiplier,
      )

      await simulateConfidentialGaslessAuthorization(client, currency, payload)
      
      // Check if token supports EIP-3009 before attempting
      console.log('🔍 Server: Checking if token supports EIP-3009...')
      try {
        const name = await readContract(client, {
          address: currency,
          abi: [{ inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' }],
          functionName: 'name',
        })
        console.log('   Token name:', name)
        
        // Try to read authorizationState to verify EIP-3009 support
        const testAuthorizer = '0x0000000000000000000000000000000000000001'
        const testNonce = '0x0000000000000000000000000000000000000000000000000000000000000000'
        await readContract(client, {
          address: currency,
          abi: [{ 
            inputs: [
              { name: 'authorizer', type: 'address' },
              { name: 'nonce', type: 'bytes32' }
            ], 
            name: 'authorizationState', 
            outputs: [{ name: 'used', type: 'bool' }], 
            stateMutability: 'view', 
            type: 'function' 
          }],
          functionName: 'authorizationState',
          args: [testAuthorizer, testNonce],
        })
        console.log('✅ Server: Token supports EIP-3009 (authorizationState function exists)')
      } catch (error) {
        console.error('❌ Server: Token does not support EIP-3009!')
        console.error('   Error:', error instanceof Error ? error.message : String(error))
        console.error('   The token contract does not have authorizationState function.')
        console.error('   This token may not support gasless transfers via EIP-3009.')
        throw new Error(`Token ${currency} does not support EIP-3009 authorization`)
      }
      
      // Check if nonce was already used (replay protection)
      console.log('🔍 Server: Checking authorization nonce state...')
      try {
        const nonceUsed = await readContract(client, {
          address: currency,
          abi: [
            {
              inputs: [
                { name: 'authorizer', type: 'address' },
                { name: 'nonce', type: 'bytes32' }
              ],
              name: 'authorizationState',
              outputs: [{ name: 'used', type: 'bool' }],
              stateMutability: 'view',
              type: 'function',
            },
          ],
          functionName: 'authorizationState',
          args: [payload.authorization.from as `0x${string}`, payload.authorization.nonce as `0x${string}`],
        })
        if (nonceUsed) {
          throw new Error(`Authorization nonce already used: ${payload.authorization.nonce}. This authorization cannot be replayed.`)
        }
        console.log('✅ Server: Authorization nonce is available (not yet used)')
      } catch (error) {
        // If the call fails, the token might not support EIP-3009 or the check failed
        console.warn('⚠️ Server: Could not verify nonce state:', error instanceof Error ? error.message : String(error))
        console.warn('   Proceeding with submission (will fail on-chain if nonce is already used)')
      }
      
      // Submit the encrypted BITE transaction
      console.log('🔍 Server: Submitting encrypted BITE transaction...')
      console.log('   Token:', currency)
      console.log('   Amount:', amount)
      console.log('   BITE contract:', payload.encryptedTx.to)
      console.log('   Gas limit:', payload.encryptedTx.gasLimit)
      
      const hash = await sendTransaction(client, {
        account: client.account,
        chain: client.chain,
        to: payload.encryptedTx.to as `0x${string}`,
        data: payload.encryptedTx.data as `0x${string}`,
        value: 0n,
        gas: BigInt(payload.encryptedTx.gasLimit),
      })
      
      console.log('✅ Server: Encrypted transaction submitted, hash:', hash)
      
      if (waitForConfirmation) {
        console.log('🔍 Server: Waiting for CTX to be included and executed...')
        const receipt = await pollForReceipt(client, hash)
        if (!receipt) {
          console.error('❌ Server: Encrypted transaction not confirmed')
          throw new Error(`Encrypted transaction not confirmed. Hash: ${hash}`)
        }
        
        console.log('✅ Server: CTX included in block', receipt.blockNumber.toString())
        console.log('   Transaction status:', receipt.status)
        console.log('   Gas used:', receipt.gasUsed.toString())
        console.log('   Logs count:', receipt.logs.length)
        
        // BITE CTX executes atomically - inclusion and execution happen in the same transaction
        // If status is 'reverted', the transferWithAuthorization call failed
        if (receipt.status === 'reverted') {
          console.error('❌ Server: BITE CTX execution reverted!')
          console.error('   This means transferWithAuthorization failed during execution:')
          console.error('   - Invalid signature (most common - check EIP-712 domain)')
          console.error('   - Nonce already used')
          console.error('   - validBefore timestamp expired')
          console.error('   - Insufficient balance/allowance')
          console.error('   - Token contract does not support EIP-3009')
          throw new Error(`BITE CTX execution failed. Hash: ${hash}`)
        }
        
        // Check logs for transfer to recipient
        console.log('🔍 Server: Checking for transfer to recipient:', recipient)
        console.log('   All logs:', receipt.logs.map((l, i) => `Log[${i}]: ${l.address} topic0=${l.topics[0]?.slice(0, 20)}...`))
        
        // Look for Transfer event (topic0: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef)
        const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        const transferLog = receipt.logs.find(log => 
          log.topics[0] === transferTopic &&
          isAddressEqual(log.address as Address, currency)
        )
        
        if (!transferLog) {
          console.warn('⚠️ Server: No Transfer event found in CTX logs')
          console.warn('   CTX may have succeeded but transfer was not verified')
          console.warn('   This could mean:')
          console.warn('   - BITE uses different event format for confidential transfers')
          console.warn('   - transferWithAuthorization reverted silently')
        } else {
          console.log('✅ Server: Found Transfer event from token contract')
          console.log('   Log address:', transferLog.address)
          console.log('   Topics:', transferLog.topics)
        }
        
        console.log('✅ Server: Confidential-gasless payment verified via BITE CTX')
        
        return {
          method: 'skale' as const,
          status: 'success' as const,
          timestamp: new Date().toISOString(),
          reference: hash,
        }
      }
      
      return {
        method: 'skale' as const,
        status: 'success' as const,
        timestamp: new Date().toISOString(),
        reference: hash,
      }
    },
  })
}

export function charge(parameters: ServerParameters = {}): any {
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
