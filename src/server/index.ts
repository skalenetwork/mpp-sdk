import type { Account, Address, Chain, Client, Hex } from 'viem'
import type { TransactionReceipt } from 'viem'
import { getTransactionReceipt, sendTransaction, readContract } from 'viem/actions'
import { isAddressEqual } from 'viem/utils'
import { Method } from 'mppx'
import { charge as chargeMethod } from '../utils/method'
import type { ChainConfig, TokenConfig, ChainInput } from '../config/chains'
import { resolveChain } from '../config/chains'
import type { Extension } from '../extensions'
import { validateExtensions as validateExt } from '../extensions'
import type { PaymentStrategy, PaymentStrategyType } from '../extensions/resolver'
import { determinePaymentStrategy } from '../extensions/resolver'
import type { Authorization, AuthorizationSignature, Permit, PermitSignature } from '../utils/types'
import { submitAuthorization } from '../methods/eip3009'
import { submitPermitAndTransfer } from '../methods/eip2612'
import type { AuthorizationStore } from '../utils/types'
import { eip3009Abi } from '../utils/abi'

export type ServerChargeParameters = {
  chain: ChainInput
  client?: Client
  currency?: string | TokenConfig
  token?: TokenConfig
  extensions?: Extension
  serverAccount?: Account | Address
  authorizationStore?: AuthorizationStore
  waitForConfirmation?: boolean
}

const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

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

async function waitForReceipt(client: Client, hash: Hex, maxAttempts = 40, intervalMs = 250): Promise<TransactionReceipt | null> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const receipt = await getTransactionReceipt(client, { hash })
      if (receipt) return receipt
    } catch {
      // Receipt not found yet, continue polling
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return null
}

async function verifyTransferEvent(client: Client, receipt: TransactionReceipt, tokenAddress: Address): Promise<boolean> {
  const transferLog = receipt.logs.find(log =>
    log.topics[0] === TRANSFER_EVENT_TOPIC &&
    isAddressEqual(log.address as Address, tokenAddress)
  )
  return !!transferLog
}

async function validateAuthorizationMatchesChallenge(
  authorization: { from: string; to: string; value: string },
  request: { amount: string; recipient: string }
): Promise<void> {
  if (authorization.value !== request.amount) {
    throw new Error(`Amount mismatch: expected ${request.amount}, got ${authorization.value}`)
  }
  if (authorization.to.toLowerCase() !== request.recipient.toLowerCase()) {
    throw new Error(`Recipient mismatch: expected ${request.recipient}, got ${authorization.to}`)
  }
}

async function validatePermitMatchesChallenge(
  permit: { spender: string; value: string },
  request: { amount: string; recipient: string }
): Promise<void> {
  if (permit.value.toString() !== request.amount) {
    throw new Error(`Amount mismatch: expected ${request.amount}, got ${permit.value}`)
  }
  if (permit.spender.toLowerCase() !== request.recipient.toLowerCase()) {
    throw new Error(`Spender mismatch: expected ${request.recipient}, got ${permit.spender}`)
  }
}

async function ensureConfidentialCallbackBalance(
  client: Client,
  currency: Address,
  multiplier = 10
): Promise<void> {
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

  if (depositBalance >= callbackFee) return

  const topUpMultiplier = BigInt(Math.max(1, Math.trunc(multiplier)))
  const topUpAmount = callbackFee * topUpMultiplier

  const { writeContract } = await import('viem/actions')
  const hash = await writeContract(client, {
    account: client.account,
    chain: client.chain,
    address: currency,
    abi: confidentialTokenAbi,
    functionName: 'deposit',
    args: [client.account.address],
    value: topUpAmount,
  })

  const receipt = await waitForReceipt(client, hash)
  if (!receipt || receipt.status === 'reverted') {
    throw new Error(`Failed to top up confidential callback balance. Hash: ${hash}`)
  }
}

async function checkAuthorizationNonce(
  client: Client,
  token: Address,
  authorizer: Address,
  nonce: Hex
): Promise<boolean> {
  try {
    const used = await readContract(client, {
      address: token,
      abi: eip3009Abi,
      functionName: 'authorizationState',
      args: [authorizer, nonce],
    })
    return used
  } catch {
    return false
  }
}

function resolveToken(
  chain: ChainConfig,
  currency?: string | TokenConfig,
  tokenConfig?: TokenConfig
): TokenConfig {
  if (tokenConfig) {
    return tokenConfig
  }

  if (!currency) {
    throw new Error('Currency or tokenConfig required')
  }

  if (typeof currency === 'object' && 'address' in currency) {
    return currency as TokenConfig
  }

  if (chain.tokens[currency]) {
    return chain.tokens[currency]
  }

  if (currency.startsWith('0x') && currency.length === 42) {
    return {
      address: currency as Address,
      decimals: 18,
      supportsEIP3009: true,
      supportsEIP2612: true,
    }
  }

  throw new Error(`Token not found: ${currency}`)
}

function validateExtensions(extensions: Extension | undefined, chain: ChainConfig, token: TokenConfig): void {
  const isSkaleChain = chain.isSkale

  if (!extensions) return

  if (extensions.skale?.confidentialToken && !isSkaleChain) {
    throw new Error('confidentialToken is only supported on SKALE chains')
  }

  if (extensions.skale?.encrypted && !isSkaleChain) {
    throw new Error('encryption is only supported on SKALE chains')
  }

  validateExt(extensions, { id: chain.id, name: chain.name } as Chain, token)
}

function createServerTransferMode(parameters: ServerChargeParameters) {
  const { client, waitForConfirmation = true } = parameters

  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return request
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = parameters.client
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) {
        throw new Error(`Payment expired at ${expires}`)
      }

      const payload = credential.payload as {
        type: 'charge'
        payload: { hash: Hex }
        extensions?: { gasless?: boolean | string; skale?: { encrypted?: boolean } }
      }
      if (payload.type !== 'charge') throw new Error('Expected charge credential')
      if (payload.extensions?.gasless !== false) throw new Error('Expected non-gasless payment')

      const hash = payload.payload.hash
      if (!hash) throw new Error('Missing transaction hash')

      if (waitForConfirmation && client) {
        const receipt = await waitForReceipt(client, hash)
        if (!receipt) {
          throw new Error(`Transaction not confirmed. Hash: ${hash}`)
        }

        const tokenAddress = challenge.request.currency as Address
        const hasTransfer = await verifyTransferEvent(client, receipt, tokenAddress)
        if (!hasTransfer) {
          throw new Error('No transfer found in transaction')
        }

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
        reference: hash,
      }
    },
  })
}

function createServerEIP3009Mode(parameters: ServerChargeParameters) {
  const { client, serverAccount, authorizationStore, waitForConfirmation = true } = parameters

  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return request
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = parameters.client
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) {
        throw new Error(`Payment expired at ${expires}`)
      }

      const payload = credential.payload as {
        type: 'charge'
        payload: {
          authorization: {
            from: string
            to: string
            value: string
            validAfter: string
            validBefore: string
            nonce: Hex
          }
          signature: { v: number; r: string; s: string }
        }
        extensions?: { gasless?: boolean | string }
      }
      if (payload.type !== 'charge') throw new Error('Expected charge credential')
      if (payload.extensions?.gasless !== 'eip3009') throw new Error('Expected EIP-3009 gasless extension')

      if (!client) throw new Error('Client required for eip3009 mode')

      const account = serverAccount
      if (!account) throw new Error('serverAccount required for eip3009 mode')

      const tokenAddress = challenge.request.currency as Address
      const request = challenge.request

      await validateAuthorizationMatchesChallenge(payload.payload.authorization, request as { amount: string; recipient: string })

      const now = Math.floor(Date.now() / 1000)
      const validBefore = Number(payload.payload.authorization.validBefore)
      if (now > validBefore) {
        throw new Error(`Authorization expired: validBefore ${validBefore}, now ${now}`)
      }

      const nonce = payload.payload.authorization.nonce
      if (authorizationStore) {
        const seen = await authorizationStore.hasSeen(nonce)
        if (seen) throw new Error(`Authorization nonce already used: ${nonce}`)
      }

      const nonceUsed = await checkAuthorizationNonce(
        client,
        tokenAddress,
        payload.payload.authorization.from as Address,
        nonce
      )
      if (nonceUsed) {
        throw new Error(`Authorization nonce already used on-chain: ${nonce}`)
      }

      const authorization: Authorization = {
        from: payload.payload.authorization.from as Address,
        to: payload.payload.authorization.to as Address,
        value: BigInt(payload.payload.authorization.value),
        validAfter: BigInt(payload.payload.authorization.validAfter),
        validBefore: BigInt(payload.payload.authorization.validBefore),
        nonce,
      }

      const signature: AuthorizationSignature = {
        v: payload.payload.signature.v,
        r: payload.payload.signature.r as Hex,
        s: payload.payload.signature.s as Hex,
      }

      const hash = await submitAuthorization(client, {
        token: tokenAddress,
        authorization,
        signature,
        account,
      })

      if (authorizationStore) {
        await authorizationStore.markSeen(nonce)
      }

      if (waitForConfirmation) {
        const receipt = await waitForReceipt(client, hash)
        if (!receipt || receipt.status === 'reverted') {
          throw new Error(`Authorization submission failed. Hash: ${hash}`)
        }

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

function createServerEIP2612Mode(parameters: ServerChargeParameters) {
  const { client, serverAccount, waitForConfirmation = true } = parameters

  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return request
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = parameters.client
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) {
        throw new Error(`Payment expired at ${expires}`)
      }

      const payload = credential.payload as {
        type: 'charge'
        payload: {
          permit: {
            owner: string
            spender: string
            value: string
            nonce: string
            deadline: string
          }
          signature: { v: number; r: string; s: string }
        }
        extensions?: { gasless?: boolean | string }
      }
      if (payload.type !== 'charge') throw new Error('Expected charge credential')
      if (payload.extensions?.gasless !== 'eip2612') throw new Error('Expected EIP-2612 gasless extension')

      if (!client) throw new Error('Client required for eip2612 mode')

      const account = serverAccount
      if (!account) throw new Error('serverAccount required for eip2612 mode')

      const tokenAddress = challenge.request.currency
      const request = challenge.request

      await validatePermitMatchesChallenge(payload.payload.permit, request as { amount: string; recipient: string })

      const now = Math.floor(Date.now() / 1000)
      const deadline = Number(payload.payload.permit.deadline)
      if (now > deadline) {
        throw new Error(`Permit expired: deadline ${deadline}, now ${now}`)
      }

      const permit: Permit = {
        owner: payload.payload.permit.owner as Address,
        spender: payload.payload.permit.spender as Address,
        value: BigInt(payload.payload.permit.value),
        nonce: BigInt(payload.payload.permit.nonce),
        deadline: BigInt(payload.payload.permit.deadline),
      }

      const signature: PermitSignature = {
        v: payload.payload.signature.v,
        r: payload.payload.signature.r as Hex,
        s: payload.payload.signature.s as Hex,
      }

      const hash = await submitPermitAndTransfer(client, {
        token: tokenAddress as Address,
        permit,
        signature,
        recipient: request.recipient as Address,
        amount: BigInt(request.amount),
        account,
      })

      if (waitForConfirmation) {
        const receipt = await waitForReceipt(client, hash)
        if (!receipt || receipt.status === 'reverted') {
          throw new Error(`Permit submission failed. Hash: ${hash}`)
        }

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

function createServerEncryptedTransferMode(parameters: ServerChargeParameters) {
  const { client, waitForConfirmation = true } = parameters

  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return request
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = parameters.client
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) {
        throw new Error(`Payment expired at ${expires}`)
      }

      const payload = credential.payload as {
        type: 'charge'
        payload: { hash: Hex }
        extensions?: {
          skale?: {
            encrypted?: boolean
          }
          gasless?: boolean | string
        }
      }
      if (payload.type !== 'charge') throw new Error('Expected charge credential')
      if (!payload.extensions?.skale?.encrypted) throw new Error('Expected encrypted extension')
      if (payload.extensions?.gasless !== false) throw new Error('Expected non-gasless payment')

      const hash = payload.payload.hash
      if (!hash) throw new Error('Missing transaction hash')

      if (waitForConfirmation && client) {
        const receipt = await waitForReceipt(client, hash)
        if (!receipt) {
          throw new Error(`Transaction not confirmed. Hash: ${hash}`)
        }

        if (receipt.status === 'reverted') {
          throw new Error(`Encrypted transaction reverted. Hash: ${hash}`)
        }

        const tokenAddress = challenge.request.currency as Address
        const tokenInteraction = receipt.logs.find(log =>
          isAddressEqual(log.address as Address, tokenAddress)
        )

        if (!tokenInteraction) {
          throw new Error('No interaction with token contract found')
        }

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
        reference: hash,
      }
    },
  })
}

function createServerEncryptedEIP3009Mode(parameters: ServerChargeParameters) {
  const { client, serverAccount, authorizationStore, waitForConfirmation = true } = parameters

  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return request
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = parameters.client
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) {
        throw new Error(`Payment expired at ${expires}`)
      }

      const payload = credential.payload as {
        type: 'charge'
        payload: {
          authorization: {
            from: string
            to: string
            value: string
            validAfter: string
            validBefore: string
            nonce: Hex
          }
          signature: { v: number; r: string; s: string }
        }
        encryptedTx?: { to: string; data: string; gasLimit: string }
        extensions?: {
          skale?: {
            encrypted?: boolean
          }
          gasless?: boolean | string
        }
      }
      if (payload.type !== 'charge') throw new Error('Expected charge credential')
      if (!payload.extensions?.skale?.encrypted) throw new Error('Expected encrypted extension')
      if (payload.extensions?.gasless !== 'eip3009') throw new Error('Expected EIP-3009 gasless extension')

      if (!client) throw new Error('Client required for encrypted-eip3009 mode')

      const account = serverAccount
      if (!account) throw new Error('serverAccount required for encrypted-eip3009 mode')

      const request = challenge.request

      await validateAuthorizationMatchesChallenge(payload.payload.authorization, request as { amount: string; recipient: string })

      const nonce = payload.payload.authorization.nonce
      if (authorizationStore) {
        const seen = await authorizationStore.hasSeen(nonce)
        if (seen) throw new Error(`Authorization nonce already used: ${nonce}`)
      }

      if (!payload.encryptedTx) {
        throw new Error('encryptedTx required for encrypted-eip3009 mode')
      }

      const hash = await sendTransaction(client, {
        account,
        chain: client.chain,
        to: payload.encryptedTx.to as Address,
        data: payload.encryptedTx.data as Hex,
        value: 0n,
        gas: BigInt(payload.encryptedTx.gasLimit),
      })

      if (authorizationStore) {
        await authorizationStore.markSeen(nonce)
      }

      if (waitForConfirmation) {
        const receipt = await waitForReceipt(client, hash)
        if (!receipt || receipt.status === 'reverted') {
          throw new Error(`Encrypted EIP-3009 transaction failed. Hash: ${hash}`)
        }

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

function createServerEncryptedEIP2612Mode(parameters: ServerChargeParameters) {
  const { client, serverAccount, waitForConfirmation = true } = parameters

  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return request
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = parameters.client
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) {
        throw new Error(`Payment expired at ${expires}`)
      }

      const payload = credential.payload as {
        type: 'charge'
        payload: {
          permit: {
            owner: string
            spender: string
            value: string
            nonce: string
            deadline: string
          }
          signature: { v: number; r: string; s: string }
        }
        encryptedTx?: { to: string; data: string; gasLimit: string }
        extensions?: {
          skale?: {
            encrypted?: boolean
          }
          gasless?: boolean | string
        }
      }
      if (payload.type !== 'charge') throw new Error('Expected charge credential')
      if (!payload.extensions?.skale?.encrypted) throw new Error('Expected encrypted extension')
      if (payload.extensions?.gasless !== 'eip2612') throw new Error('Expected EIP-2612 gasless extension')

      if (!client) throw new Error('Client required for encrypted-eip2612 mode')

      const account = serverAccount
      if (!account) throw new Error('serverAccount required for encrypted-eip2612 mode')

      const request = challenge.request

      await validatePermitMatchesChallenge(payload.payload.permit, request as { amount: string; recipient: string })

      if (!payload.encryptedTx) {
        throw new Error('encryptedTx required for encrypted-eip2612 mode')
      }

      const hash = await sendTransaction(client, {
        account,
        chain: client.chain,
        to: payload.encryptedTx.to as Address,
        data: payload.encryptedTx.data as Hex,
        value: 0n,
        gas: BigInt(payload.encryptedTx.gasLimit),
      })

      if (waitForConfirmation) {
        const receipt = await waitForReceipt(client, hash)
        if (!receipt || receipt.status === 'reverted') {
          throw new Error(`Encrypted EIP-2612 transaction failed. Hash: ${hash}`)
        }

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

function createServerConfidentialEIP3009Mode(parameters: ServerChargeParameters) {
  const {
    getClient,
    serverAccount,
    authorizationStore,
    waitForConfirmation = true,
  } = parameters

  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return request
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = parameters.client
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) {
        throw new Error(`Payment expired at ${expires}`)
      }

      const payload = credential.payload as {
        type: 'charge'
        payload: {
          authorization: {
            from: string
            to: string
            value: string
            validAfter: string
            validBefore: string
            nonce: Hex
          }
          signature: { v: number; r: string; s: string }
        }
        encryptedTx?: { to: string; data: string; gasLimit: string }
        extensions?: {
          skale?: {
            encrypted?: boolean
            confidentialToken?: boolean
          }
          gasless?: boolean | string
        }
      }
      if (payload.type !== 'charge') throw new Error('Expected charge credential')
      if (!payload.extensions?.skale?.encrypted || !payload.extensions?.skale?.confidentialToken) {
        throw new Error('Expected confidential token extension')
      }
      if (payload.extensions?.gasless !== 'eip3009') throw new Error('Expected EIP-3009 gasless extension')

      if (!client) throw new Error('Client required for confidential-eip3009 mode')
      if (!client.account) throw new Error('Client account required')

      const account = serverAccount
      if (!account) throw new Error('serverAccount required for confidential-eip3009 mode')

      const tokenAddress = challenge.request.currency
      const request = challenge.request

      await validateAuthorizationMatchesChallenge(payload.payload.authorization, request as { amount: string; recipient: string })

      const nonce = payload.payload.authorization.nonce
      if (authorizationStore) {
        const seen = await authorizationStore.hasSeen(nonce)
        if (seen) throw new Error(`Authorization nonce already used: ${nonce}`)
      }

      await ensureConfidentialCallbackBalance(client, tokenAddress as Address, 10)

      const nonceUsed = await checkAuthorizationNonce(
        client,
        tokenAddress as Address,
        payload.payload.authorization.from as Address,
        nonce
      )
      if (nonceUsed) {
        throw new Error(`Authorization nonce already used on-chain: ${nonce}`)
      }

      if (!payload.encryptedTx) {
        throw new Error('encryptedTx required for confidential-eip3009 mode')
      }

      const hash = await sendTransaction(client, {
        account,
        chain: client.chain,
        to: payload.encryptedTx.to as Address,
        data: payload.encryptedTx.data as Hex,
        value: 0n,
        gas: BigInt(payload.encryptedTx.gasLimit),
      })

      if (authorizationStore) {
        await authorizationStore.markSeen(nonce)
      }

      if (waitForConfirmation) {
        const receipt = await waitForReceipt(client, hash)
        if (!receipt) {
          throw new Error(`Confidential transaction not confirmed. Hash: ${hash}`)
        }

        if (receipt.status === 'reverted') {
          throw new Error(`Confidential EIP-3009 transaction reverted. Hash: ${hash}`)
        }

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

function createServerConfidentialEIP2612Mode(parameters: ServerChargeParameters) {
  const {
    getClient,
    serverAccount,
    waitForConfirmation = true,
  } = parameters

  return Method.toServer(chargeMethod, {
    async request({ request }) {
      return request
    },
    async verify({ credential }) {
      const { challenge } = credential
      const client = parameters.client
      const expires = challenge.expires
      if (expires && new Date(expires) < new Date()) {
        throw new Error(`Payment expired at ${expires}`)
      }

      const payload = credential.payload as {
        type: 'charge'
        payload: {
          permit: {
            owner: string
            spender: string
            value: string
            nonce: string
            deadline: string
          }
          signature: { v: number; r: string; s: string }
        }
        encryptedTx?: { to: string; data: string; gasLimit: string }
        extensions?: {
          skale?: {
            encrypted?: boolean
            confidentialToken?: boolean
          }
          gasless?: boolean | string
        }
      }
      if (payload.type !== 'charge') throw new Error('Expected charge credential')
      if (!payload.extensions?.skale?.encrypted || !payload.extensions?.skale?.confidentialToken) {
        throw new Error('Expected confidential token extension')
      }
      if (payload.extensions?.gasless !== 'eip2612') throw new Error('Expected EIP-2612 gasless extension')

      if (!client) throw new Error('Client required for confidential-eip2612 mode')
      if (!client.account) throw new Error('Client account required')

      const account = serverAccount
      if (!account) throw new Error('serverAccount required for confidential-eip2612 mode')

      const tokenAddress = challenge.request.currency
      const request = challenge.request

      await validatePermitMatchesChallenge(payload.payload.permit, request as { amount: string; recipient: string })

      const now = Math.floor(Date.now() / 1000)
      const deadline = Number(payload.payload.permit.deadline)
      if (now > deadline) {
        throw new Error(`Permit expired: deadline ${deadline}, now ${now}`)
      }

      await ensureConfidentialCallbackBalance(client, tokenAddress as Address, 10)

      if (!payload.encryptedTx) {
        throw new Error('encryptedTx required for confidential-eip2612 mode')
      }

      const hash = await sendTransaction(client, {
        account,
        chain: client.chain,
        to: payload.encryptedTx.to as Address,
        data: payload.encryptedTx.data as Hex,
        value: 0n,
        gas: BigInt(payload.encryptedTx.gasLimit),
      })

      if (waitForConfirmation) {
        const receipt = await waitForReceipt(client, hash)
        if (!receipt) {
          throw new Error(`Confidential transaction not confirmed. Hash: ${hash}`)
        }

        if (receipt.status === 'reverted') {
          throw new Error(`Confidential EIP-2612 transaction reverted. Hash: ${hash}`)
        }

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

const serverModeHandlers: Record<PaymentStrategyType, (parameters: ServerChargeParameters) => unknown> = {
  transfer: createServerTransferMode,
  eip3009: createServerEIP3009Mode,
  eip2612: createServerEIP2612Mode,
  'encrypted-transfer': createServerEncryptedTransferMode,
  'encrypted-eip3009': createServerEncryptedEIP3009Mode,
  'encrypted-eip2612': createServerEncryptedEIP2612Mode,
  'confidential-eip3009': createServerConfidentialEIP3009Mode,
  'confidential-eip2612': createServerConfidentialEIP2612Mode,
}

function createServerModeHandler(strategy: PaymentStrategy) {
  const handler = serverModeHandlers[strategy.type]
  if (!handler) {
    throw new Error(`Unknown payment strategy: ${strategy.type}`)
  }
  return handler
}

function charge(parameters: ServerChargeParameters): unknown {
  const chain = resolveChain(parameters.chain)
  const token = resolveToken(chain, parameters.currency, parameters.token)

  if (parameters.extensions) {
    validateExtensions(parameters.extensions, chain, token)
  }

  const strategy = determinePaymentStrategy(
    parameters.extensions || {},
    token,
    { id: chain.id, name: chain.name } as Chain
  )
  
  console.log('🎯 Server: Payment strategy determined:', strategy)

  const handler = createServerModeHandler(strategy)
  return handler(parameters)
}

// Export charge function
export { charge }

// Create evm object that matches tempo API - callable with .charge property
export const evm = Object.assign(
  (parameters: ServerChargeParameters) => charge(parameters),
  { charge }
)