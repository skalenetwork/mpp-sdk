import type { Chain } from 'viem'
import type { ChainConfig, ChainInput, TokenConfig } from './index.js'
import { presets } from './presets.js'

export class ChainResolutionError extends Error {
  constructor(input: unknown) {
    super(`Unable to resolve chain: ${String(input)}`)
    this.name = 'ChainResolutionError'
  }
}

function isViemChain(input: unknown): input is Chain {
  return (
    typeof input === 'object' &&
    input !== null &&
    'id' in input &&
    typeof (input as Chain).id === 'number' &&
    'name' in input &&
    typeof (input as Chain).name === 'string' &&
    'rpcUrls' in input
  )
}

function isChainConfig(input: unknown): input is ChainConfig {
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

function viemChainToConfig(chain: Chain): ChainConfig {
  const rpcUrl =
    chain.rpcUrls.default?.http[0] ??
    chain.rpcUrls.public?.http[0] ??
    ''

  return {
    id: chain.id,
    name: chain.name,
    rpcUrl,
    isSkale: chain.id === 103698795 || chain.id === 1187947933 || chain.id === 324705682,
    extensions: {},
    tokens: {},
  }
}

export function resolveChain(input: ChainInput): ChainConfig {
  if (typeof input === 'string') {
    const normalized = input.toLowerCase().trim()
    const preset = presets[normalized]
    if (preset) {
      return preset
    }
    throw new ChainResolutionError(input)
  }

  if (isViemChain(input)) {
    const preset = Object.values(presets).find((p) => p.id === input.id)
    if (preset) {
      return preset
    }
    return viemChainToConfig(input)
  }

  if (isChainConfig(input)) {
    return input
  }

  throw new ChainResolutionError(input)
}

export function resolveTokenAddress(
  chain: ChainConfig,
  tokenSymbol: string
): string {
  const normalizedSymbol = tokenSymbol.toUpperCase()
  const token = chain.tokens[normalizedSymbol]

  if (!token) {
    const available = Object.keys(chain.tokens).join(', ')
    throw new Error(
      `Token "${tokenSymbol}" not found on ${chain.name}. Available: ${available}`
    )
  }

  return token.address
}

export function getSupportedTokens(chain: ChainConfig): string[] {
  return Object.keys(chain.tokens)
}

export function supportsEncryptedMode(chain: ChainConfig): boolean {
  return chain.extensions.skale?.encrypted ?? false
}

export function supportsConfidentialToken(chain: ChainConfig): boolean {
  return chain.extensions.skale?.confidentialToken ?? false
}

export function createChain(config: {
  id: number
  name: string
  rpcUrl: string
  isSkale?: boolean
  tokens?: Record<string, TokenConfig>
  extensions?: ChainConfig['extensions']
}): ChainConfig {
  return {
    id: config.id,
    name: config.name,
    rpcUrl: config.rpcUrl,
    isSkale: config.isSkale ?? false,
    tokens: config.tokens ?? {},
    extensions: config.extensions ?? {},
  }
}

export function addTokens(
  chain: ChainConfig,
  tokens: Record<string, TokenConfig>
): ChainConfig {
  return {
    ...chain,
    tokens: { ...chain.tokens, ...tokens },
  }
}
