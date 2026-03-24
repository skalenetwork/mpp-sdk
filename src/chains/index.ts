import type { Address, Chain } from 'viem'

export type TokenConfig = {
  address: Address
  decimals: number
  supportsEIP3009: boolean
  supportsEIP2612: boolean
}

export type SkaleExtensions = {
  encrypted?: boolean
  confidentialToken?: boolean
}

export type ChainExtensions = {
  skale?: SkaleExtensions
}

export type ChainConfig = {
  id: number
  name: string
  rpcUrl: string
  isSkale: boolean
  extensions: ChainExtensions
  tokens: Record<string, TokenConfig>
  biteContract?: Address
}

export type ChainInput = string | Chain | ChainConfig

export const DEFAULT_TOKEN_DECIMALS = 6

export function isChainConfig(input: unknown): input is ChainConfig {
  return (
    typeof input === 'object' &&
    input !== null &&
    'id' in input &&
    typeof (input as ChainConfig).id === 'number' &&
    'name' in input &&
    typeof (input as ChainConfig).name === 'string' &&
    'rpcUrl' in input &&
    typeof (input as ChainConfig).rpcUrl === 'string' &&
    'tokens' in input &&
    typeof (input as ChainConfig).tokens === 'object'
  )
}
