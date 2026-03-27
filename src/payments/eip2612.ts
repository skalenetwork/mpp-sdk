import type { Account, Address, Client, Hex } from 'viem'
import { parseSignature } from 'viem'
import { readContract, signTypedData, writeContract } from 'viem/actions'
import { erc20Abi } from '../shared/abi'
import type { Permit, PermitSignature, PermitWithSignature } from './types'

export type CreatePermitParams = {
  token: Address
  spender: Address
  amount: bigint
  deadline: bigint
  chainId?: number
}

export type SubmitPermitAndTransferParams = {
  token: Address
  permit: Permit
  signature: PermitSignature
  recipient: Address
  amount: bigint
  account?: Account | Address
}

const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

const MULTICALL3_ADDRESS: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

const MULTICALL3_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'bytes', name: 'callData', type: 'bytes' },
        ],
        internalType: 'struct Multicall3.Call[]',
        name: 'calls',
        type: 'tuple[]',
      },
    ],
    name: 'aggregate',
    outputs: [
      { internalType: 'uint256', name: 'blockNumber', type: 'uint256' },
      { internalType: 'bytes[]', name: 'returnData', type: 'bytes[]' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const

type EIP712Domain = {
  name: string
  version: string
  chainId: number
  verifyingContract: Address
}

export async function getPermitNonce(
  client: Client,
  token: Address,
  owner: Address,
): Promise<bigint> {
  const nonce = await readContract(client, {
    address: token,
    abi: [
      {
        inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
        name: 'nonces',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    functionName: 'nonces',
    args: [owner],
  })

  return nonce
}

export async function getEIP2612Domain(
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

  // Ensure version is never empty - default to '1' for EIP-2612
  const effectiveVersion = version && version.trim() !== '' ? version : '1'

  return {
    name,
    version: effectiveVersion,
    chainId,
    verifyingContract: token,
  }
}

function normalizeSignature(signatureHex: Hex): PermitSignature {
  const parsed = parseSignature(signatureHex)
  return {
    v: Number(parsed.v ?? BigInt(parsed.yParity + 27)),
    r: parsed.r,
    s: parsed.s,
  }
}

export async function createPermit(
  client: Client,
  account: Account | Address,
  params: CreatePermitParams,
): Promise<PermitWithSignature> {
  const { token, spender, amount, deadline, chainId: overrideChainId } = params

  const from = typeof account === 'string' ? account : account.address
  const resolvedChainId = overrideChainId ?? await readContract(client, {
    address: token,
    abi: [
      {
        inputs: [],
        name: 'getChainId',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    functionName: 'getChainId',
  }).catch(() => 1)

  const nonce = await getPermitNonce(client, token, from)

  const permit: Permit = {
    owner: from,
    spender,
    value: amount,
    nonce,
    deadline,
  }

  const domain = await getEIP2612Domain(client, token, Number(resolvedChainId))

  const signatureHex = await signTypedData(client, {
    account,
    domain,
    types: PERMIT_TYPES,
    primaryType: 'Permit',
    message: permit,
  })

  const signature = normalizeSignature(signatureHex)

  return { permit, signature }
}

export async function submitPermitAndTransfer(
  client: Client,
  params: SubmitPermitAndTransferParams,
): Promise<Hex> {
  const { token, permit, signature, recipient, amount, account } = params

  const permitCallData: Hex = `0xd505accf${
    permit.owner.slice(2).padStart(64, '0')}${
    permit.spender.slice(2).padStart(64, '0')}${
    permit.value.toString(16).padStart(64, '0')}${
    permit.deadline.toString(16).padStart(64, '0')}${
    signature.v.toString(16).padStart(64, '0')}${
    signature.r.slice(2)}${
    signature.s.slice(2)}`

  const transferCallData: Hex = `0xa9059cbb${
    recipient.slice(2).padStart(64, '0')}${
    amount.toString(16).padStart(64, '0')}`

  const hash = await writeContract(client, {
    address: MULTICALL3_ADDRESS,
    abi: MULTICALL3_ABI,
    functionName: 'aggregate',
    args: [
      [
        { target: token, callData: permitCallData },
        { target: token, callData: transferCallData },
      ],
    ],
    chain: null,
    account: account ?? null,
  })

  return hash
}
