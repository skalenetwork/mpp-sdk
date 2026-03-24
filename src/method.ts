import { parseUnits } from 'viem'
import { Method, z } from 'mppx'

const hashSchema = z.object({
  hash: z.hash(),
  type: z.literal('hash'),
})

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

const encryptedDataSchema = z.object({
  data: z.string(),
  to: z.string(),
  gasLimit: z.string(),
})

const eip3009Schema = z.object({
  type: z.literal('eip3009'),
  authorization: authorizationSchema,
  signature: signatureSchema,
})

const eip2612Schema = z.object({
  type: z.literal('eip2612'),
  permit: permitSchema,
  signature: signatureSchema,
})

const encryptedSchema = z.object({
  type: z.literal('encrypted'),
  hash: z.hash(),
  encryptedData: encryptedDataSchema,
})

const encryptedEip3009Schema = z.object({
  type: z.literal('encrypted-eip3009'),
  authorization: authorizationSchema,
  signature: signatureSchema,
  encryptedTx: encryptedTxSchema,
})

const encryptedEip2612Schema = z.object({
  type: z.literal('encrypted-eip2612'),
  permit: permitSchema,
  signature: signatureSchema,
  encryptedTx: encryptedTxSchema,
})

const confidentialEip3009Schema = z.object({
  type: z.literal('confidential-eip3009'),
  authorization: authorizationSchema,
  signature: signatureSchema,
  encryptedTx: encryptedTxSchema,
})

const confidentialEip2612Schema = z.object({
  type: z.literal('confidential-eip2612'),
  permit: permitSchema,
  signature: signatureSchema,
  encryptedTx: encryptedTxSchema,
})

const credentialPayloadSchema = z.union([
  hashSchema,
  eip3009Schema,
  eip2612Schema,
  encryptedSchema,
  encryptedEip3009Schema,
  encryptedEip2612Schema,
  confidentialEip3009Schema,
  confidentialEip2612Schema,
])

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
      payload: credentialPayloadSchema,
    },
    request: requestSchema,
  },
})
