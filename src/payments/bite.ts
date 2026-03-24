import type { Account, Address, Client, Hex } from 'viem'
import { sendTransaction } from 'viem/actions'
import { BITE } from '@skalenetwork/bite'

export type EncryptAndSendParams = {
  data: Hex
  to: Address
  gasLimit?: Hex
  chainId?: number
}

export async function encryptAndSend(
  client: Client,
  account: Account | Address,
  params: EncryptAndSendParams,
  biteContract: BITE,
): Promise<Hex> {
  const { data, to, gasLimit } = params

  const encryptedTx = await biteContract.encryptTransaction({
    to,
    data,
    gasLimit,
  })

  const hash = await sendTransaction(client, {
    account,
    chain: null,
    to: encryptedTx.to as Address,
    data: encryptedTx.data as Hex,
    value: 0n,
    ...(gasLimit !== undefined && { gas: BigInt(gasLimit) }),
  })

  return hash
}
