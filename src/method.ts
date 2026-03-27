import { parseUnits } from 'viem'
import { Method, z } from 'mppx'

const authorizationSchema = z.object({
  from: z.string(),
  to: z.string(),
  value: z.string(),
  validAfter: z.string(),
  validBefore: z.string(),
  nonce: z.string(),
})

const signatureSchema = z.object({
  v: z.number(),
  r: z.string(),
  s: z.string(),
})

const permitSchema = z.object({
  owner: z.string(),
  spender: z.string(),
  value: z.string(),
  nonce: z.string(),
  deadline: z.string(),
})

const encryptedTxSchema = z.object({
  data: z.string(),
  to: z.string(),
  gasLimit: z.string(),
})

// Single charge credential type with extensions for configuration
const chargeCredentialSchema = z.object({
  type: z.literal('charge'),
  // Payment payload - varies based on gasless extension
  payload: z.union([
    z.object({ hash: z.hash() }),  // For non-gasless transfers
    z.object({ authorization: authorizationSchema, signature: signatureSchema }),  // EIP-3009
    z.object({ permit: permitSchema, signature: signatureSchema }),  // EIP-2612
  ]),
  // Optional encrypted transaction data
  encryptedTx: z.optional(encryptedTxSchema),
  // Extensions define payment behavior
  extensions: z.optional(
    z.object({
      gasless: z.optional(
        z.union([z.boolean(), z.literal('eip3009'), z.literal('eip2612')])
      ),
      skale: z.optional(
        z.object({
          encrypted: z.optional(z.boolean()),
          confidentialToken: z.optional(z.boolean()),
        })
      ),
    })
  ),
})

const requestSchema = z.pipe(
  z.object({
    amount: z.amount(),
    chainId: z.optional(z.number()),
    currency: z.string(),
    decimals: z.number(),
    description: z.optional(z.string()),
    externalId: z.optional(z.string()),
    recipient: z.optional(z.string()),
    extensions: z.optional(
      z.object({
        skale: z.optional(
          z.object({
            encrypted: z.optional(z.boolean()),
            confidentialToken: z.optional(z.boolean()),
          }),
        ),
        gasless: z.optional(
          z.union([z.boolean(), z.literal('eip3009'), z.literal('eip2612')]),
        ),
      }),
    ),
  }),
  z.transform(({ amount, chainId, decimals, ...rest }) => ({
    ...rest,
    amount: parseUnits(amount, decimals).toString(),
    ...(chainId !== undefined ? { methodDetails: { chainId } } : {}),
  })),
)

export const charge = Method.from({
  name: 'charge',
  intent: 'charge',
  schema: {
    credential: {
      payload: chargeCredentialSchema,
    },
    request: requestSchema,
  },
})
