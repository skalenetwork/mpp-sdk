// EVM payment methods plugin
// Standard ERC-20, EIP-3009, EIP-2612 - no extensions

import { charge, type ChargeParameters } from '../client/index'
import { charge as chargeServer, type ServerChargeParameters } from '../server/index'

// Client plugin
export function evm(parameters: EvmChargeParameters) {
  return charge({
    ...parameters,
    extensions: undefined
  })
}

// Server plugin  
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
