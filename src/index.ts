export { Mppx } from 'mppx/client'

// Client-side EVM namespace
export { evm } from './client.js'
export type { ChargeParameters } from './client.js'

// Server-side EVM namespace  
export { evm as evmServer } from './server.js'
export type { ServerChargeParameters as ServerParameters } from './server.js'

// Method definition
export { charge } from './method.js'

// Chains
export type { ChainConfig, ChainExtensions, SkaleExtensions, TokenConfig } from './chains/index.js'
export { resolveChain, getSupportedTokens, supportsEncryptedMode, supportsConfidentialToken } from './chains/resolver.js'
export { presets, skaleBaseMainnet as skaleBase, skaleBaseSepolia, biteSandbox, baseMainnet as base, baseSepolia } from './chains/presets.js'

// Extensions
export type { Extension } from './extensions/index.js'
export type { PaymentStrategy, PaymentStrategyType } from './extensions/resolver.js'
export { validateExtensions, resolveGaslessType } from './extensions/index.js'
export { determinePaymentStrategy } from './extensions/resolver.js'

// Tokens
export type { TokenConfig as TokenInfo } from './tokens/index.js'
export { resolveToken, createToken } from './tokens/index.js'

// Payments
export type { Authorization, AuthorizationSignature, Permit, PaymentResult } from './payments/types.js'
