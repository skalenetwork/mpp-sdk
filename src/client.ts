import type { Account, Address, Client, Hex } from 'viem'
import { parseSignature } from 'viem'
import { getChainId, sendTransaction, signTypedData, readContract } from 'viem/actions'
import { Method, Credential } from 'mppx'
import { BITE } from '@skalenetwork/bite'
import { charge as chargeMethod } from './method.js'
import { encodeTransfer, encodeAuthorizationCall, createAuthorization } from './shared/utils.js'
import { erc20Abi } from './shared/abi.js'

const chainId = 103698795
const rpcUrl = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox'
const gasLimit = '0x493e0'

type Eip712Domain = {
  name: string
  version: string
  chainId: number
  verifyingContract: Address
}

async function eip3009Version(client: Client, tokenAddress: Address): Promise<string> {
  try {
    return await readContract(client, {
      address: tokenAddress,
      abi: [{ inputs: [], name: 'version', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' }],
      functionName: 'version',
    })
  } catch {}

  try {
    return await readContract(client, {
      address: tokenAddress,
      abi: [{ inputs: [], name: 'EIP712_VERSION', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' }],
      functionName: 'EIP712_VERSION',
    })
  } catch {}

  return '1'
}

async function eip712Domain(client: Client, tokenAddress: Address): Promise<Eip712Domain | null> {
  try {
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

/** Get EIP-712 domain for EIP-3009, preferring IERC5267 eip712Domain() when available */
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

  const [name, version] = await Promise.all([
    readContract(client, {
      address: tokenAddress,
      abi: erc20Abi,
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

function normalizeSignature(signatureHex: Hex): { v: number; r: Hex; s: Hex } {
  const parsed = parseSignature(signatureHex)
  return {
    v: Number(parsed.v ?? BigInt(parsed.yParity + 27)),
    r: parsed.r,
    s: parsed.s,
  }
}

export type ClientParameters = {
  account?: Account | Address | undefined
  getClient?: () => Promise<Client>
  confidential?: boolean | undefined
  gasless?: boolean | undefined
  validDuration?: number | undefined
}

function createNormalMode(parameters: ClientParameters) {
  return Method.toClient(chargeMethod, {
    async createCredential({ challenge }) {
      const client = await parameters.getClient?.()
      if (!client) throw new Error('Client required')
      const account = parameters.account
      if (!account) throw new Error('Account required')
      
      const { amount } = challenge.request
      const currency = challenge.request.currency as Address
      const recipient = challenge.request.recipient as Address
      
      console.log('📝 Client: Creating transfer credential')
      console.log('   Amount (raw):', amount)
      console.log('   Amount (BigInt):', BigInt(amount).toString())
      console.log('   Currency:', currency)
      console.log('   Recipient:', recipient)
      console.log('   Sender:', typeof account === 'string' ? account : account.address)
      console.log('   Gas limit:', gasLimit)
      
      const transferData = encodeTransfer(recipient, BigInt(amount))
      console.log('   Encoded transfer data:', transferData)
      console.log('   Full tx params:', {
        to: currency,
        data: transferData,
        value: '0',
        gas: gasLimit,
      })
      
      try {
        const hash = await sendTransaction(client, {
          account,
          chain: null,
          to: currency,
          data: transferData,
          value: 0n,
          gas: BigInt(gasLimit),
        })
        
        console.log('✅ Client: Transaction submitted, hash:', hash)
        
        return Credential.serialize({
          challenge,
          payload: { hash, type: 'hash' },
          source: `did:pkh:eip155:${chainId}:${typeof account === 'string' ? account : account.address}`,
        })
      } catch (error) {
        console.error('❌ Client: Transaction failed')
        console.error('   Error:', error instanceof Error ? error.message : String(error))
        console.error('   Challenge request:', challenge.request)
        throw error
      }
    },
  })
}

function createGaslessMode(parameters: ClientParameters) {
  return Method.toClient(chargeMethod, {
    async createCredential({ challenge }) {
      const client = await parameters.getClient?.()
      if (!client) throw new Error('Client required')
      const account = parameters.account
      if (!account) throw new Error('Account required')
      
      const { amount } = challenge.request
      const currency = challenge.request.currency as Address
      const recipient = challenge.request.recipient as Address
      const resolvedChainId = await getChainId(client)
      
      console.log('📝 Client: Creating authorization credential')
      console.log('   Amount (raw):', amount)
      console.log('   Amount (BigInt):', BigInt(amount).toString())
      console.log('   Currency:', currency)
      console.log('   Recipient:', recipient)
      console.log('   Sender:', typeof account === 'string' ? account : account.address)
      console.log('   Chain ID:', resolvedChainId)
      console.log('   Valid duration:', parameters.validDuration ?? 300, 'seconds')
      
      const authorization = createAuthorization(
        typeof account === 'string' ? account : account.address,
        recipient,
        BigInt(amount),
        parameters.validDuration ?? 300
      )
      
      console.log('   Authorization created:', {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      })
      
      try {
      // Use hardcoded SKALE chainId for consistent EIP-712 domain
      // This ensures signature verification matches the target network
      const domain = await eip3009Domain(client, currency, chainId)
        console.log('🔍 Client: EIP-712 domain:', {
          name: domain.name,
          version: domain.version,
          chainId: domain.chainId,
          verifyingContract: domain.verifyingContract,
        })
        
        const signatureHex = await signTypedData(client, {
          account,
          domain,
          types: eip3009Types,
          primaryType: 'TransferWithAuthorization',
          message: authorization,
        })
        
        console.log('✅ Client: Authorization signed, signature:', signatureHex.slice(0, 20) + '...')
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
          source: `did:pkh:eip155:${chainId}:${typeof account === 'string' ? account : account.address}`,
        })
      } catch (error) {
        console.error('❌ Client: Authorization signing failed')
        console.error('   Error:', error instanceof Error ? error.message : String(error))
        console.error('   Challenge request:', challenge.request)
        console.error('   Authorization:', authorization)
        throw error
      }
    },
  })
}

function createConfidentialMode(parameters: ClientParameters) {
  return Method.toClient(chargeMethod, {
    async createCredential({ challenge }) {
      const client = await parameters.getClient?.()
      if (!client) throw new Error('Client required')
      const account = parameters.account
      if (!account) throw new Error('Account required')
      
      const { amount } = challenge.request
      const currency = challenge.request.currency as Address
      const recipient = challenge.request.recipient as Address
      
      const bite = new BITE(rpcUrl)
      
      const transferData = encodeTransfer(recipient, BigInt(amount))
      console.log('🔍 Client: Encoding transfer for confidential mode')
      console.log('   Transfer data:', transferData)
      
      const encryptedTx = await bite.encryptTransaction({
        to: currency,
        data: transferData,
        gasLimit,
      })
      
      console.log('🔍 Client: Encrypted transaction received')
      console.log('   Encrypted data:', encryptedTx.data.slice(0, 50) + '...')
      console.log('   BITE address:', encryptedTx.to)
      console.log('   Gas limit:', encryptedTx.gasLimit)
      
      // BITE already returns hex string with 0x prefix
      const encryptedData = encryptedTx.data as Hex
      
      console.log('🔍 Client: Sending encrypted transaction...')
      
      const hash = await sendTransaction(client, {
        account,
        chain: null,
        to: encryptedTx.to as `0x${string}`,
        data: encryptedData,
        value: 0n,
        gas: BigInt(encryptedTx.gasLimit || gasLimit),
      })
      
      console.log('✅ Client: Confidential transaction sent, hash:', hash)
      
      return Credential.serialize({
        challenge,
        payload: { hash, type: 'hash' },
        source: `did:pkh:eip155:${chainId}:${typeof account === 'string' ? account : account.address}`,
      })
    },
  })
}

function createConfidentialGaslessMode(parameters: ClientParameters) {
  return Method.toClient(chargeMethod, {
    async createCredential({ challenge }) {
      console.log('🧭 Client: Using confidential-gasless mode')
      const client = await parameters.getClient?.()
      if (!client) throw new Error('Client required')
      const account = parameters.account
      if (!account) throw new Error('Account required')
      
      const { amount } = challenge.request
      const currency = challenge.request.currency as Address
      const recipient = challenge.request.recipient as Address
      
      const authorization = createAuthorization(
        typeof account === 'string' ? account : account.address,
        recipient,
        BigInt(amount),
        parameters.validDuration ?? 300
      )
      
      console.log('🔍 Client: Authorization created:', {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
        currentTime: Math.floor(Date.now() / 1000),
      })
      
      const domain = await eip3009Domain(client, currency, chainId)
      console.log('🔍 Client: EIP-712 domain:', {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId,
        verifyingContract: domain.verifyingContract,
      })
      
      const signatureHex = await signTypedData(client, {
        account,
        domain,
        types: eip3009Types,
        primaryType: 'TransferWithAuthorization',
        message: authorization,
      })
      
      console.log('🔍 Client: Signature created:', {
        signatureHex: signatureHex.slice(0, 30) + '...',
        length: signatureHex.length,
      })
      
      const bite = new BITE(rpcUrl)
      
      const signature = normalizeSignature(signatureHex)
      
      console.log('🔍 Client: Signature components:', {
        v: signature.v,
        r: signature.r.slice(0, 20) + '...',
        s: signature.s.slice(0, 20) + '...',
      })
      
      const authorizationCall = encodeAuthorizationCall(authorization, signature)
      console.log('🔍 Client: Encoded authorization call:', authorizationCall.slice(0, 50) + '...')
      
      const encryptedTx = await bite.encryptTransaction({
        to: currency,
        data: authorizationCall,
        gasLimit,
      })
      
      console.log('🔍 Client: Encrypted authorization transaction created')
      console.log('   Encrypted data:', encryptedTx.data.slice(0, 50) + '...')
      console.log('   BITE address:', encryptedTx.to)
      console.log('   Gas limit:', encryptedTx.gasLimit)
      
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
        source: `did:pkh:eip155:${chainId}:${typeof account === 'string' ? account : account.address}`,
      })
    },
  })
}

function charge_(parameters: ClientParameters = {}): any {
  const confidential = parameters.confidential ?? false
  const gasless = parameters.gasless ?? false

  console.log('🧭 Client: Selecting SKALE mode', {
    confidential,
    gasless,
    account: typeof parameters.account === 'string' ? parameters.account : parameters.account?.address,
  })
  
  if (confidential && gasless) return createConfidentialGaslessMode(parameters)
  if (confidential) return createConfidentialMode(parameters)
  if (gasless) return createGaslessMode(parameters)
  return createNormalMode(parameters)
}

export { charge_ as charge }

export namespace skale {
  export type Parameters = ClientParameters
  export const charge = charge_
}
