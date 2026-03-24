export const chainId = {
  testnet: 103698795,
}

export const biteAddress = '0x42495445204D452049274d20454E435259505444'

export const rpcUrl: Record<number, string> = {
  [chainId.testnet]: 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox',
}

export const DEFAULT_TOKENS = {
  // SKALE BITE Sandbox
  biteSandbox: {
    usdc: '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8',
    eusdc: '0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200',
  },
  // SKALE Base
  skaleBase: {
    usdc: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20',
  },
  // Base Mainnet
  base: {
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
} as const

// Keep old export for backward compatibility
export const tokens = DEFAULT_TOKENS.biteSandbox

export const decimals = 18

export const gasLimit = '0x493e0'

export function resolveCurrency(token: string | undefined): string {
  return token ?? DEFAULT_TOKENS.biteSandbox.usdc
}
