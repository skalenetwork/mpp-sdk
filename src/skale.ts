// SKALE plugin - extends EVM with SKALE-specific features
// Includes: encrypted transfers, confidential tokens, gasless on SKALE chains

import { charge, type ChargeParameters } from './client'
import { charge as chargeServer, type ServerChargeParameters } from './server'

export interface SkaleExtensions {
  encrypted?: boolean
  confidentialToken?: boolean
}

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

export function skale(parameters: SkaleChargeParameters) {
  return charge({
    ...parameters,
    extensions: parameters.extensions
  })
}

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
} from './chains/presets'
