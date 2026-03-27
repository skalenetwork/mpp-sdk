import type { Address, Chain } from 'viem'

// Types
export interface TokenConfig {
  address: Address
  decimals: number
  supportsEIP3009: boolean
  supportsEIP2612: boolean
}

export interface SkaleExtensions {
  encrypted?: boolean
  confidentialToken?: boolean
}

export interface ChainExtensions {
  skale?: SkaleExtensions
}

export interface ChainConfig {
  id: number
  name: string
  rpcUrl: string
  isSkale: boolean
  extensions: ChainExtensions
  tokens: Record<string, TokenConfig>
  biteContract?: string
}

export type ChainInput = string | Chain | ChainConfig

export type TokenSupport = {
  supportsEIP3009: boolean
  supportsEIP2612: boolean
}

// Error class
export class ChainResolutionError extends Error {
  constructor(input: unknown) {
    super(`Unable to resolve chain: ${String(input)}`)
    this.name = 'ChainResolutionError'
  }
}

// Chain detection helpers
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

// Token configs
const usdcBase: TokenConfig = {
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
  supportsEIP3009: true,
  supportsEIP2612: true,
}

const usdcBaseSepolia: TokenConfig = {
  address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  decimals: 6,
  supportsEIP3009: true,
  supportsEIP2612: true,
}

const usdcSkaleBase: TokenConfig = {
  address: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20',
  decimals: 6,
  supportsEIP3009: true,
  supportsEIP2612: true,
}

const usdcSkaleBaseSepolia: TokenConfig = {
  address: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
  decimals: 6,
  supportsEIP3009: true,
  supportsEIP2612: true,
}

const usdcBiteSandbox: TokenConfig = {
  address: '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8',
  decimals: 6,
  supportsEIP3009: true,
  supportsEIP2612: true,
}

const eusdcBiteSandbox: TokenConfig = {
  address: '0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200',
  decimals: 18,
  supportsEIP3009: true,
  supportsEIP2612: true,
}

// Chain presets
export const skaleBaseMainnet: ChainConfig = {
  id: 1187947933,
  name: 'SKALE Base Mainnet',
  rpcUrl: 'https://skale-base.skalenodes.com/v1/base',
  isSkale: true,
  extensions: {
    skale: {
      encrypted: true,
    },
  },
  tokens: {
    'USDC.e': usdcSkaleBase,
  },
}

export const skaleBaseSepolia: ChainConfig = {
  id: 324705682,
  name: 'SKALE Base Sepolia',
  rpcUrl: 'https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha',
  isSkale: true,
  extensions: {
    skale: {
      encrypted: true,
    },
  },
  tokens: {
    'USDC.e': usdcSkaleBaseSepolia,
  },
}

export const biteSandbox: ChainConfig = {
  id: 103698795,
  name: 'Bite Sandbox',
  rpcUrl: 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox',
  isSkale: true,
  extensions: {
    skale: {
      encrypted: true,
      confidentialToken: true,
    },
  },
  tokens: {
    USDC: usdcBiteSandbox,
    eUSDC: eusdcBiteSandbox,
  },
  biteContract: '0x42495445204D452049274d20454e435259505444',
}

export const baseMainnet: ChainConfig = {
  id: 8453,
  name: 'Base Mainnet',
  rpcUrl: 'https://mainnet.base.org',
  isSkale: false,
  extensions: {},
  tokens: {
    USDC: usdcBase,
  },
}

export const baseSepolia: ChainConfig = {
  id: 84532,
  name: 'Base Sepolia',
  rpcUrl: 'https://sepolia.base.org',
  isSkale: false,
  extensions: {},
  tokens: {
    USDC: usdcBaseSepolia,
  },
}

export const presets: Record<string, ChainConfig> = {
  'skale-base': skaleBaseMainnet,
  'skale-base-mainnet': skaleBaseMainnet,
  'skale-base-sepolia': skaleBaseSepolia,
  'bite-sandbox': biteSandbox,
  'base': baseMainnet,
  'base-mainnet': baseMainnet,
  'base-sepolia': baseSepolia,
}

export const skaleChains = [
  skaleBaseMainnet,
  skaleBaseSepolia,
  biteSandbox,
]

export const nonSkaleChains = [
  baseMainnet,
  baseSepolia,
]

export const allChains = [
  ...skaleChains,
  ...nonSkaleChains,
]

// Resolution functions
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
