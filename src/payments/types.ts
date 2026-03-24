import type { Address, Hex } from 'viem'

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
