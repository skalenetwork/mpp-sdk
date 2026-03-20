import type { Address, Client, Hex } from 'viem'
import { encodeFunctionData, toHex } from 'viem'
import { readContract } from 'viem/actions'
import { eip3009Abi, erc20Abi } from './abi.js'
import type { Authorization, MulticallOperation } from './types.js'

/** Encode ERC-20 transfer call */
export function encodeTransfer(to: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amount],
  })
}

/** Encode EIP-3009 authorization call */
export function encodeAuthorizationCall(
  authorization: Authorization,
  signature: { v: number; r: Hex; s: Hex },
): Hex {
  return encodeFunctionData({
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
  })
}

/** Generate random 32-byte nonce for EIP-3009 */
export function generateAuthorizationNonce(): Hex {
  // Use Web Crypto API and convert with viem's toHex
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

/** Create authorization struct */
export function createAuthorization(
  from: Address,
  to: Address,
  value: bigint,
  validDurationSeconds = 300, // 5 minutes default
): Authorization {
  const now = BigInt(Math.floor(Date.now() / 1000))
  return {
    from,
    to,
    value,
    validAfter: 0n, // Valid immediately from genesis
    validBefore: now + BigInt(validDurationSeconds),
    nonce: generateAuthorizationNonce(),
  }
}

/** Create multicall operation */
export function createMulticallOperation(target: Address, callData: Hex): MulticallOperation {
  return { target, callData }
}

/** Check if contract supports EIP-3009 (has authorizationState function) */
export async function supportsEIP3009(client: Client, tokenAddress: Address): Promise<boolean> {
  try {
    await readContract(client, {
      address: tokenAddress,
      abi: eip3009Abi,
      functionName: 'authorizationState',
      args: ['0x0000000000000000000000000000000000000000000000000000000000000000'],
    })
    return true
  } catch {
    return false
  }
}
