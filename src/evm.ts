// EVM base plugin - standard ERC-20, EIP-3009, EIP-2612 payments
// No SKALE-specific extensions

import { charge, type ChargeParameters } from './client'
import { charge as chargeServer, type ServerChargeParameters } from './server'

export function evm(parameters: EvmChargeParameters) {
  return charge({
    ...parameters,
    // No SKALE extensions
    extensions: undefined
  })
}

export const evmServer = Object.assign(
  (parameters: EvmServerChargeParameters) => chargeServer({
    ...parameters,
    extensions: undefined
  }),
  { charge: chargeServer }
)

// Types
export type EvmChargeParameters = Omit<ChargeParameters, 'extensions'>
export type EvmServerChargeParameters = Omit<ServerChargeParameters, 'extensions'>
