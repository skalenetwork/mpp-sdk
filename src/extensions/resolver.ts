import type { Extension, TokenSupport } from './index'
import type { Chain } from 'viem'

export type PaymentStrategyType =
  | 'transfer'
  | 'eip3009'
  | 'eip2612'
  | 'encrypted-transfer'
  | 'encrypted-eip3009'
  | 'encrypted-eip2612'
  | 'confidential-eip3009'
  | 'confidential-eip2612'

export type PaymentStrategy = {
  type: PaymentStrategyType
  encrypted: boolean
  gasless: boolean
}

export function determinePaymentStrategy(
  extensions: Extension,
  token: TokenSupport,
  chain: Chain
): PaymentStrategy {
  const isSkaleChain = chain.id === 103698795 || chain.name.toLowerCase().includes('skale')
  const gaslessType = resolveGaslessType(extensions.gasless, token)
  const hasGasless = gaslessType !== null

  if (extensions.skale?.confidentialToken && isSkaleChain) {
    if (hasGasless) {
      if (gaslessType === 'eip2612' && token.supportsEIP2612) {
        return {
          type: 'confidential-eip2612',
          encrypted: true,
          gasless: true,
        }
      }
      return {
        type: 'confidential-eip3009',
        encrypted: true,
        gasless: true,
      }
    }
    return {
      type: 'encrypted-transfer',
      encrypted: true,
      gasless: false,
    }
  }

  if (extensions.skale?.encrypted && isSkaleChain) {
    if (hasGasless) {
      if (gaslessType === 'eip2612' && token.supportsEIP2612) {
        return {
          type: 'encrypted-eip2612',
          encrypted: true,
          gasless: true,
        }
      }
      if (gaslessType === 'eip3009' && token.supportsEIP3009) {
        return {
          type: 'encrypted-eip3009',
          encrypted: true,
          gasless: true,
        }
      }
    }
    return {
      type: 'encrypted-transfer',
      encrypted: true,
      gasless: false,
    }
  }

  if (hasGasless) {
    if (gaslessType === 'eip3009' && token.supportsEIP3009) {
      return {
        type: 'eip3009',
        encrypted: false,
        gasless: true,
      }
    }
    if (gaslessType === 'eip2612' && token.supportsEIP2612) {
      return {
        type: 'eip2612',
        encrypted: false,
        gasless: true,
      }
    }
  }

  return {
    type: 'transfer',
    encrypted: false,
    gasless: false,
  }
}

function resolveGaslessType(
  gasless: Extension['gasless'],
  token: TokenSupport
): 'eip3009' | 'eip2612' | null {
  if (gasless === false || gasless === undefined) {
    return null
  }

  if (gasless === true) {
    if (token.supportsEIP3009) return 'eip3009'
    if (token.supportsEIP2612) return 'eip2612'
    return null
  }

  return gasless
}
