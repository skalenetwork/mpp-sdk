export { Mppx } from 'mppx/client'

// Methods - Standard EVM payments (ERC-20, EIP-3009, EIP-2612)
export { evm, evmServer, type EvmChargeParameters, type EvmServerChargeParameters } from './methods/evm'

// Extensions - SKALE-specific features (encrypted, confidential)
export { skale, skaleServer, type SkaleChargeParameters, type SkaleServerChargeParameters } from './extensions/skale'

// Core types from base files
export type { ChargeParameters } from './client/index'
export type { ServerChargeParameters } from './server/index'

// Extension types and functions
export type { Extension, SkaleExtensions, ChainExtensions } from './extensions'
export { validateExtensions, resolveGaslessType } from './extensions'

// Chains and Tokens
export type { ChainConfig, TokenConfig, TokenSupport } from './config/chains'
export type { ChainExtensions as ChainExtensionsConfig } from './config/chains'
export {
  resolveChain,
  getSupportedTokens,
  supportsEncryptedMode,
  supportsConfidentialToken,
  presets,
  skaleBaseMainnet as skaleBase,
  skaleBaseSepolia,
  biteSandbox,
  baseMainnet as base,
  baseSepolia,
} from './config/chains'

// Token utilities
export { resolveToken, createToken } from './config/tokens'

// Payment types
export type { Authorization, AuthorizationSignature, Permit, PaymentResult } from './utils/types'
export type { AuthorizationStore } from './utils/types'
export { MemoryAuthorizationStore } from './utils/types'
