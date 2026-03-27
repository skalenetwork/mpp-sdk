import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { formatUnits, formatEther } from 'viem'
import './BalanceDisplay.css'

interface BalanceDisplayProps {
  address: string | undefined
  usdcAddress: string
  eusdcAddress: string
}

const erc20Abi = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

function BalanceDisplay({ address, usdcAddress, eusdcAddress }: BalanceDisplayProps) {
  const publicClient = usePublicClient()
  const [balances, setBalances] = useState<{
    sFuel: string
    usdc: string
    eusdc: string
    loading: boolean
  }>({
    sFuel: '0',
    usdc: '0',
    eusdc: '0',
    loading: true,
  })

  useEffect(() => {
    if (!address || !publicClient) return

    const fetchBalances = async () => {
      try {
        let sFuelFormatted = '0'
        try {
          const sFuelBalance = await publicClient.getBalance({ address: address as `0x${string}` })
          sFuelFormatted = formatEther(sFuelBalance)
        } catch (sFuelError) {
          console.error('Error fetching sFUEL balance:', sFuelError)
        }

        let usdcFormatted = '0'
        try {
          const [usdcBalance, usdcDecimals] = await Promise.all([
            publicClient.readContract({
              address: usdcAddress as `0x${string}`,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [address as `0x${string}`],
            }),
            publicClient.readContract({
              address: usdcAddress as `0x${string}`,
              abi: erc20Abi,
              functionName: 'decimals',
            }),
          ])
          usdcFormatted = formatUnits(usdcBalance, usdcDecimals)
        } catch (usdcError) {
          console.error('Error fetching USDC balance:', usdcError)
        }

        const eusdcFormatted = 'Encrypted'

        setBalances({
          sFuel: sFuelFormatted,
          usdc: usdcFormatted,
          eusdc: eusdcFormatted,
          loading: false,
        })
      } catch (error) {
        console.error('Error fetching balances:', error)
        setBalances(prev => ({ ...prev, loading: false }))
      }
    }

    fetchBalances()
    const interval = setInterval(fetchBalances, 10000)

    return () => clearInterval(interval)
  }, [address, publicClient, usdcAddress, eusdcAddress])

  if (balances.loading) {
    return (
      <div className="balance-display loading">
        <h3>Wallet Balances</h3>
        <p>Loading balances...</p>
      </div>
    )
  }

  const safeParseFloat = (value: string, defaultValue: number = 0): number => {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? defaultValue : parsed
  }

  const sFuelValue = safeParseFloat(balances.sFuel)
  const hasEnoughGas = sFuelValue >= 0.001
  const hasEnoughUsdc = safeParseFloat(balances.usdc) >= 0.001
  const hasEnoughEusdc = balances.eusdc !== 'Encrypted' && safeParseFloat(balances.eusdc) >= 0.001

  return (
    <div className="balance-display">
      <h3>Wallet Balances</h3>
      <div className="balance-grid">
        <div className={`balance-item ${hasEnoughGas ? 'ok' : 'low'}`}>
          <span className="balance-label">sFUEL (Gas)</span>
          <span className="balance-value">
            {isNaN(sFuelValue) ? balances.sFuel || 'Error' : sFuelValue.toFixed(6)}
          </span>
          {!hasEnoughGas && <span className="balance-warning">Low gas!</span>}
        </div>
        
        <div className={`balance-item ${hasEnoughUsdc ? 'ok' : 'low'}`}>
          <span className="balance-label">USDC</span>
          <span className="balance-value">{safeParseFloat(balances.usdc).toFixed(2)}</span>
          {!hasEnoughUsdc && <span className="balance-warning">Need 0.001+</span>}
        </div>
        
        <div className={`balance-item ${hasEnoughEusdc ? 'ok' : 'low'}`}>
          <span className="balance-label">eUSDC Transfer Credits</span>
          <span className="balance-value">
            {balances.eusdc === 'Encrypted' ? '🔒 Encrypted' : safeParseFloat(balances.eusdc).toFixed(2)}
          </span>
          {balances.eusdc !== 'Encrypted' && !hasEnoughEusdc && <span className="balance-warning">Need 0.001+</span>}
        </div>
      </div>
    </div>
  )
}

export default BalanceDisplay
