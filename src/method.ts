import { parseUnits } from 'viem'
import { Method, z } from 'mppx'

export const charge = Method.from({
  name: 'skale',
  intent: 'charge',
  schema: {
    credential: {
      payload: z.union([
        z.object({
          hash: z.hash(),
          type: z.literal('hash'),
        }),
        z.object({
          authorization: z.object({
            from: z.string(),
            to: z.string(),
            value: z.string(),
            validAfter: z.string(),
            validBefore: z.string(),
            nonce: z.string(),
          }),
          signature: z.object({
            v: z.number(),
            r: z.string(),
            s: z.string(),
          }),
          type: z.literal('authorization'),
        }),
      ]),
    },
    request: z.pipe(
      z.object({
        amount: z.amount(),
        chainId: z.optional(z.number()),
        currency: z.string(),
        decimals: z.number(),
        description: z.optional(z.string()),
        externalId: z.optional(z.string()),
        recipient: z.optional(z.string()),
      }),
      z.transform(({ amount, chainId, decimals, ...rest }) => ({
        ...rest,
        amount: parseUnits(amount, decimals).toString(),
        ...(chainId !== undefined ? { methodDetails: { chainId } } : {}),
      })),
    ),
  },
})
