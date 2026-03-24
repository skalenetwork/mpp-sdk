import type { Account, Address, Client, Hex } from 'viem'
import { parseSignature, toHex } from 'viem'
import { getChainId, readContract, signTypedData, writeContract } from 'viem/actions'
import { eip3009Abi, erc20Abi } from '../shared/abi'
import type { Authorization, AuthorizationSignature, AuthorizationWithSignature } from './types'

export type CreateAuthorizationParams = {
  token: Address
  recipient: Address
  amount: bigint
  validDuration?: number
  chainId?: number
}

export type SubmitAuthorizationParams = {
  token: Address
  authorization: Authorization
  signature: AuthorizationSignature
  account?: Account | Address
}

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

type EIP712Domain = {
  name: string
  version: string
  chainId: number
  verifyingContract: Address
}

export async function getEIP3009Domain(
  client: Client,
  token: Address,
  chainId: number,
): Promise<EIP712Domain> {
  const domainFromContract = await readContract(client, {
    address: token,
    abi: [
      {
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
      },
    ],
    functionName: 'eip712Domain',
  }).catch(() => null)

  if (domainFromContract) {
    const [, name, version, contractChainId, verifyingContract] = domainFromContract
    return {
      name,
      version,
      chainId: Number(contractChainId) || chainId,
      verifyingContract: verifyingContract || token,
    }
  }

  const [name, version] = await Promise.all([
    readContract(client, {
      address: token,
      abi: erc20Abi,
      functionName: 'name',
    }),
    readContract(client, {
      address: token,
      abi: [
        {
          inputs: [],
          name: 'version',
          outputs: [{ name: '', type: 'string' }],
          stateMutability: 'view',
          type: 'function',
        },
      ],
      functionName: 'version',
    }).catch(() => '1'),
  ])

  return {
    name,
    version,
    chainId,
    verifyingContract: token,
  }
}

export function generateAuthorizationNonce(): Hex {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

export function normalizeSignature(signatureHex: Hex): AuthorizationSignature {
  const parsed = parseSignature(signatureHex)
  return {
    v: Number(parsed.v ?? BigInt(parsed.yParity + 27)),
    r: parsed.r,
    s: parsed.s,
  }
}

export async function createAuthorization(
  client: Client,
  account: Account | Address,
  params: CreateAuthorizationParams,
): Promise<AuthorizationWithSignature> {
  const { token, recipient, amount, validDuration = 300, chainId: overrideChainId } = params

  const resolvedChainId = overrideChainId ?? await getChainId(client)
  const from = typeof account === 'string' ? account : account.address

  const now = BigInt(Math.floor(Date.now() / 1000))
  const authorization: Authorization = {
    from,
    to: recipient,
    value: amount,
    validAfter: 0n,
    validBefore: now + BigInt(validDuration),
    nonce: generateAuthorizationNonce(),
  }

  const domain = await getEIP3009Domain(client, token, resolvedChainId)

  const signatureHex = await signTypedData(client, {
    account,
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  })

  const signature = normalizeSignature(signatureHex)

  return { authorization, signature }
}

export async function submitAuthorization(
  client: Client,
  params: SubmitAuthorizationParams,
): Promise<Hex> {
  const { token, authorization, signature, account } = params

  const hash = await writeContract(client, {
    address: token,
    abi: eip3009Abi,
    functionName: 'transferWithAuthorization',
    args: [
      authorization.from,
      authorization.to,
      authorization.value,
      authorization.validAfter,
      authorization.validBefore,
      authorization.nonce,
      signature.v,
      signature.r,
      signature.s,
    ],
    chain: null,
    account: account ?? null,
  })

  return hash
}
