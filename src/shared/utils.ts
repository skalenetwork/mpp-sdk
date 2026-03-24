import type { Address, Client, Hex } from 'viem'
import { encodeFunctionData, toHex } from 'viem'
import { readContract } from 'viem/actions'
import { eip3009Abi, eip2612Abi, erc20Abi } from './abi'
import type { Authorization, MulticallOperation } from './types.js'

export function encodeTransfer(to: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amount],
  })
}

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

export function encodePermitCall(
  permit: {
    owner: Address
    spender: Address
    value: bigint
    nonce: bigint
    deadline: bigint
  },
  signature: { v: number; r: Hex; s: Hex },
): Hex {
  return encodeFunctionData({
    abi: eip2612Abi,
    functionName: 'permit',
    args: [
      permit.owner,
      permit.spender,
      permit.value,
      permit.deadline,
      signature.v,
      signature.r,
      signature.s,
    ],
  })
}

export function generateAuthorizationNonce(): Hex {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

export function createAuthorization(
  from: Address,
  to: Address,
  value: bigint,
  validDurationSeconds = 300,
): Authorization {
  const now = BigInt(Math.floor(Date.now() / 1000))
  return {
    from,
    to,
    value,
    validAfter: 0n,
    validBefore: now + BigInt(validDurationSeconds),
    nonce: generateAuthorizationNonce(),
  }
}

export function createMulticallOperation(target: Address, callData: Hex): MulticallOperation {
  return { target, callData }
}

export async function supportsEIP3009(client: Client, tokenAddress: Address): Promise<boolean> {
  try {
    await readContract(client, {
      address: tokenAddress,
      abi: eip3009Abi,
      functionName: 'authorizationState',
      args: ['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000000000000000000000000000'],
    })
    return true
  } catch {
    return false
  }
}
