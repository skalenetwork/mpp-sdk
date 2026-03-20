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
        // Get sFUEL balance with better error handling
        let sFuelFormatted = '0'
        try {
          const sFuelBalance = await publicClient.getBalance({ address: address as `0x${string}` })
          console.log('sFUEL raw balance:', sFuelBalance)
          sFuelFormatted = formatEther(sFuelBalance)
          console.log('sFUEL formatted:', sFuelFormatted)
        } catch (sFuelError) {
          console.error('Error fetching sFUEL balance:', sFuelError)
        }

        // Get USDC balance
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

        // USDC balance fetched above
        
        // eUSDC is a confidential token - balance is encrypted
        // TODO: Use BITE view key to decrypt and show actual balance
        // For now, shows as encrypted until registration is complete
        const eusdcFormatted = '🔒 Encrypted'

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
    const interval = setInterval(fetchBalances, 10000) // Refresh every 10 seconds

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

  // Helper to safely parse balance strings
  const safeParseFloat = (value: string, defaultValue: number = 0): number => {
    console.log('safeParseFloat input:', value, 'type:', typeof value)
    const parsed = parseFloat(value)
    console.log('safeParseFloat parsed:', parsed, 'isNaN:', isNaN(parsed))
    return isNaN(parsed) ? defaultValue : parsed
  }

  const sFuelValue = safeParseFloat(balances.sFuel)
  console.log('sFuel balance string:', balances.sFuel)
  console.log('sFuel parsed value:', sFuelValue)
  console.log('sFuel toFixed(6):', sFuelValue.toFixed(6))

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
          <span className="balance-label">eUSDC</span>
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
