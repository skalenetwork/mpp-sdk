import type { Chain } from 'viem'
import type { TokenSupport } from '../config/chains'

// Extension types
export interface SkaleExtensions {
  encrypted?: boolean
  confidentialToken?: boolean
}

export interface Extension {
  skale?: SkaleExtensions
  gasless?: boolean | 'eip3009' | 'eip2612'
}

export interface ChainExtensions {
  skale?: SkaleExtensions
}

// Validation function
export function validateExtensions(
  extensions: Extension,
  _chain: Chain,
  token: TokenSupport
): void {
  if (extensions.gasless === 'eip3009' && !token.supportsEIP3009) {
    throw new Error('EIP-3009 gasless transfers not supported by token')
  }

  if (extensions.gasless === 'eip2612' && !token.supportsEIP2612) {
    throw new Error('EIP-2612 gasless permits not supported by token')
  }
}

// Gasless type resolution
export function resolveGaslessType(
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
