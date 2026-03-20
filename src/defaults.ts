export const chainId = {
  testnet: 103698795,
}

export const biteAddress = '0x42495445204D452049274d20454e435259505444'

export const rpcUrl: Record<number, string> = {
  [chainId.testnet]: 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox',
}

export const tokens = {
  stub: '0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200',
}

export const decimals = 18

export const gasLimit = '0x493e0'

export function resolveCurrency(token: string | undefined): string {
  return token ?? tokens.stub
}
