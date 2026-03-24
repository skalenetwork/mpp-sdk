import type { ChainConfig, TokenConfig } from './'

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
