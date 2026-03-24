import type { Chain } from 'viem'

export type Extension = {
  skale?: {
    encrypted?: boolean
    confidentialToken?: boolean
  }
  gasless?: boolean | 'eip3009' | 'eip2612'
}

export type TokenSupport = {
  supportsEIP3009: boolean
  supportsEIP2612: boolean
}

export type GaslessType = 'eip3009' | 'eip2612' | null

export function validateExtensions(
  extensions: Extension,
  chain: Chain,
  token: TokenSupport
): void {
  const isSkaleChain = chain.id === 103698795 || chain.name.toLowerCase().includes('skale')

  if (extensions.skale?.confidentialToken && !isSkaleChain) {
    throw new Error('confidentialToken is only supported on SKALE chains')
  }

  if (extensions.skale?.encrypted && !isSkaleChain) {
    throw new Error('encryption is only supported on SKALE chains')
  }

  if (extensions.gasless === 'eip3009' && !token.supportsEIP3009) {
    throw new Error('EIP-3009 gasless transfers not supported by token')
  }

  if (extensions.gasless === 'eip2612' && !token.supportsEIP2612) {
    throw new Error('EIP-2612 gasless permits not supported by token')
  }
}

export function resolveGaslessType(
  gasless: Extension['gasless'],
  token: TokenSupport
): GaslessType {
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
