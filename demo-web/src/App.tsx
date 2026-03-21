import { useState, useEffect } from 'react'
import { AppKitButton } from '@reown/appkit/react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { formatEther } from 'viem'
import PaymentButton from './components/PaymentButton'
import ConfidentialRegistration from './components/ConfidentialRegistration'
import './App.css'

// Token addresses
const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8'
const EUSDC_ADDRESS = '0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200'

const confidentialTokenAbi = [
  {
    inputs: [{ name: 'holder', type: 'address' }],
    name: 'encryptedBalanceOf',
    outputs: [{ name: 'encryptedBalance', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'holder', type: 'address' }],
    name: 'ethBalanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'holder', type: 'address' }],
    name: 'viewerAddresses',
    outputs: [{ name: 'viewerAddress', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Server endpoints
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'

// Compact balance display component
function CompactBalances({ address }: { address: string }) {
  const publicClient = usePublicClient()
  const [balances, setBalances] = useState({
    sFuel: '...',
    usdc: '...',
    eusdcDeposit: '...',
    loading: true
  })

  useEffect(() => {
    if (!publicClient) return
    
    const fetch = async () => {
      try {
        const [sFuel, usdc, eusdcDeposit] = await Promise.all([
          publicClient.getBalance({ address: address as `0x${string}` }),
          publicClient.readContract({
            address: USDC,
            abi: [{ name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], type: 'function' }],
            functionName: 'balanceOf',
            args: [address as `0x${string}`]
          }),
          publicClient.readContract({
            address: EUSDC_ADDRESS,
            abi: confidentialTokenAbi,
            functionName: 'ethBalanceOf',
            args: [address as `0x${string}`]
          }).catch(() => 0n) // Return 0 if not registered
        ])
        
        setBalances({
          sFuel: parseFloat(formatEther(sFuel)).toFixed(2),
          usdc: (Number(usdc) / 1_000_000).toFixed(2),
          eusdcDeposit: parseFloat(formatEther(eusdcDeposit)).toFixed(3),
          loading: false
        })
      } catch (e) {
        setBalances({ sFuel: 'ERR', usdc: 'ERR', eusdcDeposit: 'ERR', loading: false })
      }
    }
    
    fetch()
    const interval = setInterval(fetch, 5000)
    return () => clearInterval(interval)
  }, [publicClient, address])

  return (
    <div className="compact-balances">
      <span>⛽ {balances.sFuel} sFUEL</span>
      <span>💰 {balances.usdc} USDC</span>
      <span title="eUSDC deposit balance for confidential transfers">🔒 {balances.eusdcDeposit} sFUEL</span>
    </div>
  )
}

function App() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  
  const [logs, setLogs] = useState<string[]>([])
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle')
  const [paymentResult, setPaymentResult] = useState<any>(null)
  const [showRegistration, setShowRegistration] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null)

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  const checkOnChainRegistration = async (addr: string): Promise<boolean> => {
    if (!publicClient) return false
    
    try {
      // Check viewerAddresses - if not address(0), wallet is registered
      const viewerAddress = await publicClient.readContract({
        address: EUSDC_ADDRESS,
        abi: confidentialTokenAbi,
        functionName: 'viewerAddresses',
        args: [addr as `0x${string}`],
      })
      
      const isRegistered = viewerAddress && viewerAddress !== '0x0000000000000000000000000000000000000000'
      console.log('Registration check:', addr, 'viewer:', viewerAddress, 'registered:', isRegistered)
      return isRegistered
    } catch (e: any) {
      console.error('Error checking registration:', e?.message || e)
      return false
    }
  }

  const handlePaymentClick = async (type: 'transfer' | 'authorization' | 'confidential' | 'confidential-auth') => {
    if (!walletClient || !address) {
      addLog('❌ Wallet not connected')
      return
    }

    setSelectedPayment(type)
    
    // For confidential payments, check registration
    if (type.includes('confidential')) {
      // Always check on-chain for current wallet (not cached state)
      addLog('🔒 Checking on-chain registration...')
      const onChainRegistered = await checkOnChainRegistration(address)
      
      if (onChainRegistered) {
        addLog('✅ Wallet registered on-chain - proceeding to payment')
        executePayment(type)
        return
      }
      
      // Not registered, show registration panel
      setShowRegistration(true)
      addLog('🔒 Registration required for confidential payments')
      return
    }

    // Proceed with payment
    executePayment(type)
  }

  const executePayment = async (type: string) => {
    setPaymentStatus('processing')
    addLog(`🚀 Starting ${type}...`)

    try {
      addLog('📦 Loading MPP client...')
      const { Mppx, skale } = await import('@skalenetwork/mpp')
      const confidential = type.includes('confidential')
      const gasless = type.includes('authorization') || type === 'confidential-auth'
      console.log('🧭 Web: Creating payment method', { type, confidential, gasless, address })

      const mppx = Mppx.create({
        methods: [skale.charge({
          account: address,
          getClient: () => Promise.resolve(walletClient!),
          confidential,
          gasless,
          validDuration: 300,
        })],
        polyfill: false,
      })

      const response = await mppx.fetch(`${SERVER_URL}/pay/${type}`)
      addLog(`📊 Response: ${response.status}`)
      
      if (response.ok) {
        const data = await response.json()
        setPaymentResult(data)
        setPaymentStatus('success')
        addLog('✅ Payment successful!')
      } else {
        const text = await response.text()
        setPaymentStatus('error')
        addLog(`❌ Payment failed: ${text}`)
      }
    } catch (error) {
      setPaymentStatus('error')
      addLog(`❌ Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>SKALE MPP Demo</h1>
          {isConnected && address && <CompactBalances address={address} />}
        </div>
        <AppKitButton />
      </header>

      <main className="app-main">
        {!isConnected ? (
          <div className="connect-prompt">
            <h2>Connect Wallet</h2>
            <p>Connect to start making payments</p>
          </div>
        ) : (
          <div className="main-grid">
            {/* Left column - Payments */}
            <div className="left-column">
              {showRegistration ? (
                <div className="registration-panel">
                  <button 
                    className="back-button" 
                    onClick={() => setShowRegistration(false)}
                  >
                    ← Back to Payments
                  </button>
                  <ConfidentialRegistration 
                    onComplete={() => {
                      setShowRegistration(false)
                      addLog('✅ Registration complete')
                      // Auto-execute the pending payment if there is one
                      if (selectedPayment) {
                        executePayment(selectedPayment)
                      }
                    }}
                    onProceedToPayment={(type) => {
                      setShowRegistration(false)
                      executePayment(type)
                    }}
                  />
                </div>
              ) : (
                <>
                  <h2>MPP Payment Options</h2>
                  <p className="payment-info-text" style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                    Metered Payment Protocol (MPP) - Gasless options are paid by the server
                  </p>
                  <div className="payment-buttons">
                    <PaymentButton
                      type="transfer"
                      title="MPP Transfer"
                      description="USDC: You pay gas"
                      icon="🔄"
                      onClick={() => handlePaymentClick('transfer')}
                      disabled={paymentStatus === 'processing'}
                    />
                    <PaymentButton
                      type="authorization"
                      title="MPP Gasless"
                      description="USDC: Server pays gas"
                      icon="⛽"
                      onClick={() => handlePaymentClick('authorization')}
                      disabled={paymentStatus === 'processing'}
                    />
                    <PaymentButton
                      type="confidential"
                      title="MPP Confidential"
                      description="eUSDC: You pay gas"
                      icon="🔐"
                      onClick={() => handlePaymentClick('confidential')}
                      disabled={paymentStatus === 'processing'}
                    />
                    <PaymentButton
                      type="confidential-auth"
                      title="MPP Confidential + Gasless"
                      description="eUSDC: Server pays gas"
                      icon="🔒⛽"
                      onClick={() => handlePaymentClick('confidential-auth')}
                      disabled={paymentStatus === 'processing'}
                    />
                  </div>
                  
                  {paymentResult && paymentStatus === 'success' && (
                    <div className="success-panel">
                      <h3>✅ Success!</h3>
                      <pre>{JSON.stringify(paymentResult, null, 2)}</pre>
                    </div>
                  )}
                  
                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f5f5f5', borderRadius: '8px' }}>
                    <button
                      onClick={async () => {
                        if (!address) {
                          addLog('❌ Wallet not connected')
                          return
                        }
                        const isRegistered = await checkOnChainRegistration(address)
                        if (isRegistered) {
                          setShowRegistration(true)
                        } else {
                          addLog('🔒 Wallet not registered - click MPP Confidential to register')
                        }
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.85rem',
                        background: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      🔍 View Registration Info
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Right column - Logs */}
            <div className="right-column">
              <div className="logs-header">
                <h3>Transaction Logs</h3>
                <button className="clear-btn" onClick={() => setLogs([])}>
                  Clear
                </button>
              </div>
              <div className="logs-container">
                {logs.length === 0 ? (
                  <p className="no-logs">No transactions yet...</p>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="log-line">{log}</div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>SKALE MPP • BITE Sandbox</p>
      </footer>
    </div>
  )
}

export default App
