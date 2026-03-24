import type { Account, Address, Chain, Client, Hex } from 'viem'
import { parseSignature } from 'viem'
import { getChainId, sendTransaction, signTypedData } from 'viem/actions'
import { Method, Credential } from 'mppx'
import { BITE } from '@skalenetwork/bite'
import type { ChainConfig, TokenConfig } from './chains'
import type { Extension } from './extensions'
import type { PaymentStrategy } from './extensions/resolver'
import { charge as chargeFromMethod } from './method'
import { encodeTransfer, encodeAuthorizationCall, createAuthorization } from './shared/utils'
import { executeTransfer } from './payments/erc20'
import { biteAddress, gasLimit } from './constants'

type ChainInput = string | Chain | ChainConfig

type ChargeParameters = {
  chain: ChainInput
  account?: Account | Address
  getClient?: () => Promise<Client>
  currency?: string | TokenConfig
  token?: TokenConfig
  extensions?: Extension
  validDuration?: number
}

type ModeContext = {
  client: Client
  account: Account | Address
  chain: ChainConfig
  token: TokenConfig
  parameters: ChargeParameters
}

type Challenge = {
  id: string
  realm: string
  intent: string
  method: string
  request: Record<string, unknown>
}

const eip3009Types = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

const eip2612Types = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

function normalizeSignature(signatureHex: Hex): { v: number; r: Hex; s: Hex } {
  const parsed = parseSignature(signatureHex)
  return {
    v: Number(parsed.v ?? BigInt(parsed.yParity + 27)),
    r: parsed.r,
    s: parsed.s,
  }
}

async function eip3009Version(client: Client, tokenAddress: Address): Promise<string> {
  try {
    const { readContract } = await import('viem/actions')
    return await readContract(client, {
      address: tokenAddress,
      abi: [{ inputs: [], name: 'version', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' }],
      functionName: 'version',
    })
  } catch {
    try {
      const { readContract } = await import('viem/actions')
      return await readContract(client, {
        address: tokenAddress,
        abi: [{ inputs: [], name: 'EIP712_VERSION', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' }],
        functionName: 'EIP712_VERSION',
      })
    } catch {
      return '1'
    }
  }
}

async function eip712Domain(client: Client, tokenAddress: Address): Promise<{ name: string; version: string; chainId: number; verifyingContract: Address } | null> {
  try {
    const { readContract } = await import('viem/actions')
    const [, name, version, chainId, verifyingContract] = await readContract(client, {
      address: tokenAddress,
      abi: [{
        inputs: [],
        name: 'eip712Domain',
        outputs: [
          { name: 'fields', type: 'bytes1' },
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
          { name: 'salt', type: 'bytes32' },
          { name: 'extensions', type: 'uint256[]' },
        ],
        stateMutability: 'view',
        type: 'function',
      }],
      functionName: 'eip712Domain',
    })

    return {
      name,
      version,
      chainId: Number(chainId),
      verifyingContract,
    }
  } catch {
    return null
  }
}

async function eip3009Domain(client: Client, tokenAddress: Address, fallbackChainId: number) {
  const domain = await eip712Domain(client, tokenAddress)
  if (domain) {
    return {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId || fallbackChainId,
      verifyingContract: domain.verifyingContract || tokenAddress,
    }
  }

  const { readContract } = await import('viem/actions')
  const [name, version] = await Promise.all([
    readContract(client, {
      address: tokenAddress,
      abi: [{ inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' }],
      functionName: 'name',
    }),
    eip3009Version(client, tokenAddress),
  ])

  return {
    name,
    version,
    chainId: fallbackChainId,
    verifyingContract: tokenAddress,
  }
}

async function eip2612Domain(client: Client, tokenAddress: Address, fallbackChainId: number) {
  const domain = await eip712Domain(client, tokenAddress)
  if (domain) {
    return {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId || fallbackChainId,
      verifyingContract: domain.verifyingContract || tokenAddress,
    }
  }

  const { readContract } = await import('viem/actions')
  const name = await readContract(client, {
    address: tokenAddress,
    abi: [{ inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' }],
    functionName: 'name',
  })

  return {
    name,
    version: '1',
    chainId: fallbackChainId,
    verifyingContract: tokenAddress,
  }
}

async function getPermitNonce(client: Client, tokenAddress: Address, owner: Address): Promise<bigint> {
  const { readContract } = await import('viem/actions')
  try {
    return await readContract(client, {
      address: tokenAddress,
      abi: [{ inputs: [{ name: 'owner', type: 'address' }], name: 'nonces', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
      functionName: 'nonces',
      args: [owner],
    })
  } catch {
    return 0n
  }
}

async function resolveChain(input: ChainInput): Promise<ChainConfig> {
  if (typeof input === 'object' && 'id' in input && 'rpcUrl' in input) {
    return input as ChainConfig
  }

  if (typeof input === 'string') {
    if (input === 'bite' || input === 'skale' || input === 'testnet') {
      return {
        id: 103698795,
        name: 'SKALE BITE Testnet',
        rpcUrl: 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox',
        isSkale: true,
        extensions: { skale: { encrypted: true, confidentialToken: true } },
        tokens: {},
        biteContract: biteAddress as Address,
      }
    }
  }

  return {
    id: 103698795,
    name: 'SKALE BITE Testnet',
    rpcUrl: 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox',
    isSkale: true,
    extensions: { skale: { encrypted: true, confidentialToken: true } },
    tokens: {},
    biteContract: biteAddress as Address,
  }
}

async function resolveToken(
  chain: ChainConfig,
  currency?: string | TokenConfig,
  tokenConfig?: TokenConfig
): Promise<TokenConfig> {
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

  throw new Error(`Token "${currency}" not found on ${chain.name}`)
}

function validateExtensions(extensions: Extension | undefined, chain: ChainConfig, token: TokenConfig): void {
  if (!extensions) return

  if (extensions.skale?.confidentialToken && !chain.isSkale) {
    throw new Error('confidentialToken is only supported on SKALE chains')
  }

  if (extensions.skale?.encrypted && !chain.isSkale) {
    throw new Error('encryption is only supported on SKALE chains')
  }

  if (extensions.gasless === 'eip3009' && !token.supportsEIP3009) {
    throw new Error('EIP-3009 gasless transfers not supported by token')
  }

  if (extensions.gasless === 'eip2612' && !token.supportsEIP2612) {
    throw new Error('EIP-2612 gasless permits not supported by token')
  }
}

function determinePaymentStrategy(extensions: Extension | undefined, token: TokenConfig, chain: ChainConfig): PaymentStrategy {
  const isSkaleChain = chain.isSkale
  const gaslessType = resolveGaslessType(extensions?.gasless, token)
  const hasGasless = gaslessType !== null

  if (extensions?.skale?.confidentialToken && isSkaleChain) {
    if (hasGasless) {
      if (gaslessType === 'eip2612' && token.supportsEIP2612) {
        return { type: 'confidential-eip2612', encrypted: true, gasless: true }
      }
      return { type: 'confidential-eip3009', encrypted: true, gasless: true }
    }
    return { type: 'encrypted-transfer', encrypted: true, gasless: false }
  }

  if (extensions?.skale?.encrypted && isSkaleChain) {
    if (hasGasless) {
      if (gaslessType === 'eip2612' && token.supportsEIP2612) {
        return { type: 'encrypted-eip2612', encrypted: true, gasless: true }
      }
      if (gaslessType === 'eip3009' && token.supportsEIP3009) {
        return { type: 'encrypted-eip3009', encrypted: true, gasless: true }
      }
    }
    return { type: 'encrypted-transfer', encrypted: true, gasless: false }
  }

  if (hasGasless) {
    if (gaslessType === 'eip3009' && token.supportsEIP3009) {
      return { type: 'eip3009', encrypted: false, gasless: true }
    }
    if (gaslessType === 'eip2612' && token.supportsEIP2612) {
      return { type: 'eip2612', encrypted: false, gasless: true }
    }
  }

  return { type: 'transfer', encrypted: false, gasless: false }
}

function resolveGaslessType(gasless: Extension['gasless'], token: TokenConfig): 'eip3009' | 'eip2612' | null {
  if (gasless === false || gasless === undefined) {
    return null
  }

  if (gasless === true) {
    if (token.supportsEIP3009) return 'eip3009'
    if (token.supportsEIP2612) return 'eip2612'
    return null
  }

  return gasless
}

async function executeTransferMode(context: ModeContext, challenge: Challenge) {
  const { client, account, token, chain } = context
  const request = challenge.request as { amount: string; recipient: string; currency: string }

  const hash = await executeTransfer(client, account, {
    token: token.address,
    recipient: request.recipient as Address,
    amount: BigInt(request.amount),
    gasLimit: BigInt(gasLimit),
  })

  return Credential.serialize({
    challenge,
    payload: { hash, type: 'hash' },
    source: `did:pkh:eip155:${chain.id}:${typeof account === 'string' ? account : account.address}`,
  })
}

async function executeEIP3009Mode(context: ModeContext, challenge: Challenge) {
  const { client, account, token, parameters, chain } = context
  const request = challenge.request as { amount: string; recipient: string }
  const resolvedChainId = await getChainId(client)

  const authorization = createAuthorization(
    typeof account === 'string' ? account : account.address,
    request.recipient as Address,
    BigInt(request.amount),
    parameters.validDuration ?? 300
  )

  const domain = await eip3009Domain(client, token.address, resolvedChainId)

  const signatureHex = await signTypedData(client, {
    account,
    domain,
    types: eip3009Types,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  })

  const signature = normalizeSignature(signatureHex)

  return Credential.serialize({
    challenge,
    payload: {
      type: 'authorization',
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      },
      signature,
    },
    source: `did:pkh:eip155:${chain.id}:${typeof account === 'string' ? account : account.address}`,
  })
}

async function executeEIP2612Mode(context: ModeContext, challenge: Challenge) {
  const { client, account, token, parameters, chain } = context
  const request = challenge.request as { amount: string; recipient: string }
  const resolvedChainId = await getChainId(client)
  const owner = typeof account === 'string' ? account : account.address

  const deadline = BigInt(Math.floor(Date.now() / 1000) + (parameters.validDuration ?? 300))
  const nonce = await getPermitNonce(client, token.address, owner)

  const permit = {
    owner,
    spender: request.recipient as Address,
    value: BigInt(request.amount),
    nonce,
    deadline,
  }

  const domain = await eip2612Domain(client, token.address, resolvedChainId)

  const signatureHex = await signTypedData(client, {
    account,
    domain,
    types: eip2612Types,
    primaryType: 'Permit',
    message: permit,
  })

  const signature = normalizeSignature(signatureHex)

  return Credential.serialize({
    challenge,
    payload: {
      type: 'authorization',
      authorization: {
        from: permit.owner,
        to: permit.spender,
        value: permit.value.toString(),
        validAfter: '0',
        validBefore: permit.deadline.toString(),
        nonce: `0x${permit.nonce.toString(16).padStart(64, '0')}` as Hex,
      },
      signature,
    },
    source: `did:pkh:eip155:${chain.id}:${owner}`,
  })
}

async function executeEncryptedTransferMode(context: ModeContext, challenge: Challenge) {
  const { client, account, token, chain } = context
  const request = challenge.request as { amount: string; recipient: string }

  const bite = new BITE(chain.rpcUrl)

  const transferData = encodeTransfer(request.recipient as Address, BigInt(request.amount))

  const encryptedTx = await bite.encryptTransaction({
    to: token.address,
    data: transferData,
    gasLimit,
  })

  const _hash = await sendTransaction(client, {
    account,
    chain: null,
    to: encryptedTx.to as Address,
    data: encryptedTx.data as Hex,
    value: 0n,
    gas: BigInt(encryptedTx.gasLimit || gasLimit),
  })

  return Credential.serialize({
    challenge,
    payload: { hash: _hash, type: 'hash' },
    source: `did:pkh:eip155:${chain.id}:${typeof account === 'string' ? account : account.address}`,
  })
}

async function executeEncryptedEIP3009Mode(context: ModeContext, challenge: Challenge) {
  const { client, account, token, parameters, chain } = context
  const request = challenge.request as { amount: string; recipient: string }
  const resolvedChainId = await getChainId(client)

  const authorization = createAuthorization(
    typeof account === 'string' ? account : account.address,
    request.recipient as Address,
    BigInt(request.amount),
    parameters.validDuration ?? 300
  )

  const domain = await eip3009Domain(client, token.address, resolvedChainId)

  const signatureHex = await signTypedData(client, {
    account,
    domain,
    types: eip3009Types,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  })

  const signature = normalizeSignature(signatureHex)

  const bite = new BITE(chain.rpcUrl)

  const authorizationCall = encodeAuthorizationCall(authorization, signature)

  const encryptedTx = await bite.encryptTransaction({
    to: token.address,
    data: authorizationCall,
    gasLimit,
  })

  const _hash = await sendTransaction(client, {
    account,
    chain: null,
    to: encryptedTx.to as Address,
    data: encryptedTx.data as Hex,
    value: 0n,
    gas: BigInt(encryptedTx.gasLimit || gasLimit),
  })

  return Credential.serialize({
    challenge,
    payload: {
      type: 'encrypted-authorization',
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      },
      signature,
      encryptedTx: {
        data: encryptedTx.data,
        to: encryptedTx.to,
        gasLimit: encryptedTx.gasLimit,
      },
      hash: _hash,
    },
    source: `did:pkh:eip155:${chain.id}:${typeof account === 'string' ? account : account.address}`,
  })
}

async function executeEncryptedEIP2612Mode(context: ModeContext, challenge: Challenge) {
  const { client, account, token, parameters, chain } = context
  const request = challenge.request as { amount: string; recipient: string }
  const resolvedChainId = await getChainId(client)
  const owner = typeof account === 'string' ? account : account.address

  const deadline = BigInt(Math.floor(Date.now() / 1000) + (parameters.validDuration ?? 300))
  const nonce = await getPermitNonce(client, token.address, owner)

  const permit = {
    owner,
    spender: request.recipient as Address,
    value: BigInt(request.amount),
    nonce,
    deadline,
  }

  const domain = await eip2612Domain(client, token.address, resolvedChainId)

  const signatureHex = await signTypedData(client, {
    account,
    domain,
    types: eip2612Types,
    primaryType: 'Permit',
    message: permit,
  })

  const signature = normalizeSignature(signatureHex)

  const bite = new BITE(chain.rpcUrl)

  const { encodeFunctionData } = await import('viem')
  const permitCall = encodeFunctionData({
    abi: [{ inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'v', type: 'uint8' }, { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' }], name: 'permit', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
    functionName: 'permit',
    args: [permit.owner, permit.spender, permit.value, permit.deadline, signature.v, signature.r, signature.s],
  })

  const encryptedTx = await bite.encryptTransaction({
    to: token.address,
    data: permitCall,
    gasLimit,
  })

  const _hash = await sendTransaction(client, {
    account,
    chain: null,
    to: encryptedTx.to as Address,
    data: encryptedTx.data as Hex,
    value: 0n,
    gas: BigInt(encryptedTx.gasLimit || gasLimit),
  })

  return Credential.serialize({
    challenge,
    payload: {
      type: 'encrypted-authorization',
      authorization: {
        from: permit.owner,
        to: permit.spender,
        value: permit.value.toString(),
        validAfter: '0',
        validBefore: permit.deadline.toString(),
        nonce: `0x${permit.nonce.toString(16).padStart(64, '0')}` as Hex,
      },
      signature,
      encryptedTx: {
        data: encryptedTx.data,
        to: encryptedTx.to,
        gasLimit: encryptedTx.gasLimit,
      },
      hash: _hash,
    },
    source: `did:pkh:eip155:${chain.id}:${owner}`,
  })
}

async function executeConfidentialEIP3009Mode(context: ModeContext, challenge: Challenge) {
  const { client, account, token, parameters, chain } = context
  const request = challenge.request as { amount: string; recipient: string }
  const resolvedChainId = await getChainId(client)

  const authorization = createAuthorization(
    typeof account === 'string' ? account : account.address,
    request.recipient as Address,
    BigInt(request.amount),
    parameters.validDuration ?? 300
  )

  const domain = await eip3009Domain(client, token.address, resolvedChainId)

  const signatureHex = await signTypedData(client, {
    account,
    domain,
    types: eip3009Types,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  })

  const signature = normalizeSignature(signatureHex)

  const bite = new BITE(chain.rpcUrl)

  const authorizationCall = encodeAuthorizationCall(authorization, signature)

  const encryptedTx = await bite.encryptTransaction({
    to: token.address,
    data: authorizationCall,
    gasLimit,
  })

  return Credential.serialize({
    challenge,
    payload: {
      type: 'encrypted-authorization',
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      },
      signature,
      encryptedTx: {
        data: encryptedTx.data,
        to: encryptedTx.to,
        gasLimit: encryptedTx.gasLimit,
      },
    },
    source: `did:pkh:eip155:${chain.id}:${typeof account === 'string' ? account : account.address}`,
  })
}

async function executeConfidentialEIP2612Mode(context: ModeContext, challenge: Challenge) {
  const { client, account, token, parameters, chain } = context
  const request = challenge.request as { amount: string; recipient: string }
  const resolvedChainId = await getChainId(client)
  const owner = typeof account === 'string' ? account : account.address

  const deadline = BigInt(Math.floor(Date.now() / 1000) + (parameters.validDuration ?? 300))
  const nonce = await getPermitNonce(client, token.address, owner)

  const permit = {
    owner,
    spender: request.recipient as Address,
    value: BigInt(request.amount),
    nonce,
    deadline,
  }

  const domain = await eip2612Domain(client, token.address, resolvedChainId)

  const signatureHex = await signTypedData(client, {
    account,
    domain,
    types: eip2612Types,
    primaryType: 'Permit',
    message: permit,
  })

  const signature = normalizeSignature(signatureHex)

  const bite = new BITE(chain.rpcUrl)

  const { encodeFunctionData } = await import('viem')
  const permitCall = encodeFunctionData({
    abi: [{ inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'v', type: 'uint8' }, { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' }], name: 'permit', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
    functionName: 'permit',
    args: [permit.owner, permit.spender, permit.value, permit.deadline, signature.v, signature.r, signature.s],
  })

  const encryptedTx = await bite.encryptTransaction({
    to: token.address,
    data: permitCall,
    gasLimit,
  })

  return Credential.serialize({
    challenge,
    payload: {
      type: 'encrypted-authorization',
      authorization: {
        from: permit.owner,
        to: permit.spender,
        value: permit.value.toString(),
        validAfter: '0',
        validBefore: permit.deadline.toString(),
        nonce: `0x${permit.nonce.toString(16).padStart(64, '0')}` as Hex,
      },
      signature,
      encryptedTx: {
        data: encryptedTx.data,
        to: encryptedTx.to,
        gasLimit: encryptedTx.gasLimit,
      },
    },
    source: `did:pkh:eip155:${chain.id}:${owner}`,
  })
}

const modeHandlers: Record<string, (context: ModeContext, challenge: Challenge) => Promise<ReturnType<typeof Credential.serialize>>> = {
  transfer: executeTransferMode,
  eip3009: executeEIP3009Mode,
  eip2612: executeEIP2612Mode,
  'encrypted-transfer': executeEncryptedTransferMode,
  'encrypted-eip3009': executeEncryptedEIP3009Mode,
  'encrypted-eip2612': executeEncryptedEIP2612Mode,
  'confidential-eip3009': executeConfidentialEIP3009Mode,
  'confidential-eip2612': executeConfidentialEIP2612Mode,
}

function createModeHandler(strategy: PaymentStrategy) {
  const handler = modeHandlers[strategy.type]
  if (!handler) {
    throw new Error(`Unknown payment strategy: ${strategy.type}`)
  }
  return handler
}

export function charge(parameters: ChargeParameters): unknown {
  return Method.toClient(chargeFromMethod, {
    async createCredential({ challenge }) {
      const client = await parameters.getClient?.()
      if (!client) throw new Error('Client required')
      if (!parameters.account) throw new Error('Account required')

      const chain = await resolveChain(parameters.chain)
      const token = await resolveToken(chain, parameters.currency, parameters.token)

      if (parameters.extensions) {
        validateExtensions(parameters.extensions, chain, token)
      }

      const strategy = determinePaymentStrategy(parameters.extensions, token, chain)
      const handler = createModeHandler(strategy)

      const context: ModeContext = {
        client,
        account: parameters.account,
        chain,
        token,
        parameters,
      }

      return handler(context, challenge as unknown as Challenge)
    },
  })
}

export type { ChargeParameters }
