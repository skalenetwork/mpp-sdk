import type { Address } from 'viem'
import type { ChainConfig, TokenConfig } from '../chains/index.js'
import { isAddress } from 'viem'
import { DEFAULT_TOKEN_DECIMALS } from '../chains/index.js'

export type { TokenConfig }

export class TokenResolutionError extends Error {
  constructor(currency: string, chainName: string) {
    super(`Token "${currency}" not found on ${chainName}`)
    this.name = 'TokenResolutionError'
  }
}

function isAddressString(value: string): value is Address {
  return value.startsWith('0x') && value.length === 42 && isAddress(value)
}

export type CurrencyInput = string | TokenConfig

export function resolveToken(
  currency: CurrencyInput,
  chain: ChainConfig
): TokenConfig {
  if (typeof currency === 'object' && 'address' in currency) {
    return currency as TokenConfig
  }

  if (isAddressString(currency)) {
    return {
      address: currency,
      decimals: DEFAULT_TOKEN_DECIMALS,
      supportsEIP3009: true,
      supportsEIP2612: true,
    }
  }

  const normalizedSymbol = currency.toUpperCase()
  const chainToken = chain.tokens[normalizedSymbol]

  if (chainToken) {
    return chainToken
  }

  throw new TokenResolutionError(currency, chain.name)
}

export function createToken(config: {
  address: Address
  decimals?: number
  symbol?: string
  supportsEIP3009?: boolean
  supportsEIP2612?: boolean
}): TokenConfig {
  return {
    address: config.address,
    decimals: config.decimals ?? DEFAULT_TOKEN_DECIMALS,
    supportsEIP3009: config.supportsEIP3009 ?? true,
    supportsEIP2612: config.supportsEIP2612 ?? true,
  }
}

export * from './registry.js'
