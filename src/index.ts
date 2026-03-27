export { Mppx } from 'mppx/client'

// EVM plugin - standard ERC-20, EIP-3009, EIP-2612 payments
export { evm, evmServer, type EvmChargeParameters, type EvmServerChargeParameters } from './evm'

// SKALE plugin - extends EVM with SKALE-specific features (encrypted, confidential)
export { skale, skaleServer, type SkaleChargeParameters, type SkaleServerChargeParameters } from './skale'

// Chains
export type { ChainConfig, ChainExtensions, SkaleExtensions, TokenConfig } from './chains'
export { resolveChain, getSupportedTokens, supportsEncryptedMode, supportsConfidentialToken } from './chains/resolver'
export { presets, skaleBaseMainnet as skaleBase, skaleBaseSepolia, biteSandbox, baseMainnet as base, baseSepolia } from './chains/presets'

// Extensions
export type { Extension } from './extensions'
export type { PaymentStrategy, PaymentStrategyType } from './extensions/resolver'
export { validateExtensions, resolveGaslessType } from './extensions'
export { determinePaymentStrategy } from './extensions/resolver'

// Tokens
export type { TokenConfig as TokenInfo } from './tokens'
export { resolveToken, createToken } from './tokens'

// Payments
export type { Authorization, AuthorizationSignature, Permit, PaymentResult } from './payments/types'
