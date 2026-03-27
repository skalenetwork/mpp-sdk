// SKALE Extensions Plugin
// Adds encrypted transfers and confidential tokens to EVM payments

import { charge, type ChargeParameters } from '../client/index'
import { charge as chargeServer, type ServerChargeParameters } from '../server/index'
import type { SkaleExtensions } from './index'

export interface SkaleChargeParameters extends Omit<ChargeParameters, 'extensions'> {
  extensions?: {
    skale?: SkaleExtensions
    gasless?: boolean | 'eip3009' | 'eip2612'
  }
}

export interface SkaleServerChargeParameters extends Omit<ServerChargeParameters, 'extensions'> {
  extensions?: {
    skale?: SkaleExtensions
    gasless?: boolean | 'eip3009' | 'eip2612'
  }
}

// Client plugin with SKALE extensions
export function skale(parameters: SkaleChargeParameters) {
  return charge({
    ...parameters,
    extensions: parameters.extensions
  })
}

// Server plugin with SKALE extensions
export const skaleServer = Object.assign(
  (parameters: SkaleServerChargeParameters) => chargeServer({
    ...parameters,
    extensions: parameters.extensions
  }),
  { charge: chargeServer }
)

// Re-export chain presets for convenience
export {
  biteSandbox,
  skaleBaseSepolia,
  skaleBaseMainnet as skaleBase
} from '../config/chains'
