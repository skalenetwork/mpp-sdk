import type { Address, Hex } from 'viem'

/** Authorization parameters for EIP-3009 gasless transfers */
export type Authorization = {
  from: Address
  to: Address
  value: bigint
  validAfter: bigint
  validBefore: bigint
  nonce: Hex
}

/** Signature components for EIP-3009 */
export type AuthorizationSignature = {
  v: number
  r: Hex
  s: Hex
}

/** Credential payload types */
export type CredentialPayload =
  | { hash: Hex; type: 'hash' }
  | {
      authorization: Authorization
      signature: AuthorizationSignature
      type: 'authorization'
    }

/** Interface for storing seen authorization nonces (replay protection) */
export interface AuthorizationStore {
  hasSeen(nonce: Hex): Promise<boolean>
  markSeen(nonce: Hex): Promise<void>
}

/** In-memory implementation (default, good for single-server setups) */
export class MemoryAuthorizationStore implements AuthorizationStore {
  private seen = new Set<string>()

  async hasSeen(nonce: Hex): Promise<boolean> {
    return this.seen.has(nonce)
  }

  async markSeen(nonce: Hex): Promise<void> {
    this.seen.add(nonce)
  }
}

/** Multicall operation for batching */
export type MulticallOperation = {
  target: Address
  callData: Hex
}
