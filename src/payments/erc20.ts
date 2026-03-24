import type { Account, Address, Client, Hex } from 'viem'
import { encodeFunctionData } from 'viem'
import { sendTransaction } from 'viem/actions'
import { erc20Abi } from '../shared/abi.js'

export type TransferParams = {
  token: Address
  recipient: Address
  amount: bigint
  gasLimit?: bigint
}

export async function executeTransfer(
  client: Client,
  account: Account | Address,
  params: TransferParams,
): Promise<Hex> {
  const { token, recipient, amount, gasLimit } = params

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [recipient, amount],
  })

  const hash = await sendTransaction(client, {
    account,
    chain: null,
    to: token,
    data,
    value: 0n,
    ...(gasLimit !== undefined && { gas: gasLimit }),
  })

  return hash
}
