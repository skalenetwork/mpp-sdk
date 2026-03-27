import type { Address } from 'viem'
import type { TokenConfig } from './chains'

export const SKALE_USDC_MAINNET: TokenConfig = {
  address: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20' as Address,
  decimals: 6,
  supportsEIP3009: true,
  supportsEIP2612: true,
}

export const SKALE_USDC_SEPOLIA: TokenConfig = {
  address: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD' as Address,
  decimals: 6,
  supportsEIP3009: true,
  supportsEIP2612: true,
}

export const DEFAULT_USDC: TokenConfig = {
  address: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20' as Address,
  decimals: 6,
  supportsEIP3009: true,
  supportsEIP2612: true,
}

export const tokenDefaults: Record<number, Record<string, TokenConfig>> = {
  1187947933: {
    USDC: SKALE_USDC_MAINNET,
    'USDC.e': SKALE_USDC_MAINNET,
  },
  324705682: {
    USDC: SKALE_USDC_SEPOLIA,
    'USDC.e': SKALE_USDC_SEPOLIA,
  },
}

// Helper to create token config
export function createToken(config: {
  address: Address
  decimals: number
  supportsEIP3009?: boolean
  supportsEIP2612?: boolean
}): TokenConfig {
  return {
    address: config.address,
    decimals: config.decimals,
    supportsEIP3009: config.supportsEIP3009 ?? true,
    supportsEIP2612: config.supportsEIP2612 ?? true,
  }
}

// Helper to resolve token from chain config
export function resolveToken(
  tokens: Record<string, TokenConfig>,
  currency: string | TokenConfig
): TokenConfig {
  if (typeof currency === 'object' && 'address' in currency) {
    return currency as TokenConfig
  }

  const normalizedSymbol = currency.toUpperCase()
  const token = tokens[normalizedSymbol]

  if (!token) {
    const available = Object.keys(tokens).join(', ')
    throw new Error(
      `Token "${currency}" not found. Available: ${available}`
    )
  }

  return token
}
