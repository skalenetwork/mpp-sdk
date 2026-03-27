import type { Address, Hex } from 'viem'

export const EIP2612Types = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export type EIP2612TypesType = typeof EIP2612Types

export type Authorization = {
  from: Address
  to: Address
  value: bigint
  validAfter: bigint
  validBefore: bigint
  nonce: Hex
}

export type AuthorizationSignature = {
  v: number
  r: Hex
  s: Hex
}

export type CredentialPayload =
  | { hash: Hex; type: 'hash' }
  | {
      authorization: Authorization
      signature: AuthorizationSignature
      type: 'authorization'
    }

export interface AuthorizationStore {
  hasSeen(nonce: Hex): Promise<boolean>
  markSeen(nonce: Hex): Promise<void>
}

export class MemoryAuthorizationStore implements AuthorizationStore {
  private seen = new Set<string>()

  async hasSeen(nonce: Hex): Promise<boolean> {
    return this.seen.has(nonce)
  }

  async markSeen(nonce: Hex): Promise<void> {
    this.seen.add(nonce)
  }
}

export type AuthorizationWithSignature = {
  authorization: Authorization
  signature: AuthorizationSignature
}

export type Permit = {
  owner: Address
  spender: Address
  value: bigint
  nonce: bigint
  deadline: bigint
}

export type PermitSignature = {
  v: number
  r: Hex
  s: Hex
}

export type PermitWithSignature = {
  permit: Permit
  signature: PermitSignature
}

export type PaymentResult = {
  hash: Hex
  type: string
}

export type EncryptedTransaction = {
  to: Address
  data: Hex
  gasLimit?: Hex
}

export type MulticallOperation = {
  target: Address
  callData: Hex
}
