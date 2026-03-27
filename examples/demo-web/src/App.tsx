import { useState, useEffect } from 'react'
import { useAccount, useWalletClient, usePublicClient, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { formatEther } from 'viem'
import { Mppx, skale } from '@skalenetwork/mpp'
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
          }).catch(() => 0n)
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
    <div className="balances">
      <span className="balance-item sfuel">⛽ {balances.sFuel}</span>
      <span className="balance-item usdc">💰 {balances.usdc}</span>
      <span className="balance-item eusdc" title="ETH deposit for confidential transfer gas fees">🔒 {balances.eusdcDeposit}</span>
    </div>
  )
}

function App() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const { connect } = useConnect()
  
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
    
    if (type.includes('confidential')) {
      addLog('🔒 Checking on-chain registration...')
      const onChainRegistered = await checkOnChainRegistration(address)
      
      if (onChainRegistered) {
        addLog('✅ Wallet registered on-chain - proceeding to payment')
        executePayment(type)
        return
      }
      
      setShowRegistration(true)
      addLog('🔒 Registration required for confidential payments')
      return
    }

    executePayment(type)
  }

  const executePayment = async (type: string) => {
    setPaymentStatus('processing')
    addLog(`🚀 Starting ${type}...`)

    try {
      addLog('📦 Loading MPP client...')
      const encrypted = type.includes('confidential')
      const confidentialToken = type.includes('confidential')
      const gasless = type.includes('authorization') || type === 'confidential-auth'
      
      console.log('🧭 Web: Creating payment method', { type, encrypted, confidentialToken, gasless, address })

      const mppx = Mppx.create({
        methods: [skale({
          account: address,
          client: walletClient!,
          chain: 'bite-sandbox',
          currency: encrypted ? EUSDC_ADDRESS : USDC,
          extensions: {
            skale: { encrypted, confidentialToken },
            gasless,
          },
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
          <div className="logo-container">
            <img src="/logo.jpeg" alt="SKALE MPP" className="logo" onError={(e) => e.currentTarget.style.display='none'} />
          </div>
          <span className="title">Machine Payments Protocol Demo -- SKALE Network</span>
          {isConnected && address && <CompactBalances address={address} />}
        </div>
        <button 
          className="nav-connect-btn"
          onClick={() => isConnected ? null : connect({ connector: injected() })}
        >
          {isConnected ? 'Connected' : 'Connect Wallet'}
        </button>
      </header>

      <main className="app-main">
        {!isConnected ? (
          <div className="connect-screen">
            <div className="connect-logo-container">
              <img src="/logo.jpeg" alt="SKALE" className="connect-logo" onError={(e) => e.currentTarget.style.display='none'} />
            </div>
            <h1 className="connect-title">Confidential Machine Payments Protocol Demo</h1>
            
            <div className="connect-info">
              <div className="info-section">
                <h3>What is SKALE?</h3>
                <ul className="info-bullets">
                  <li>Blockchain optimized for the agentic era</li>
                  <li>Native privacy and confidential capabilities</li>
                  <li>Instant finality, zero gas fees, and infinite scalability</li>
                </ul>
                <a href="https://skale.space" target="_blank" rel="noopener noreferrer" className="info-link">
                  skale.space
                </a>
              </div>
              
              <div className="info-section">
                <h3>What is MPP?</h3>
                <ul className="info-bullets">
                  <li>Open protocol for machine-to-machine payments</li>
                  <li>Charge for API requests, tool calls, or content</li>
                  <li>Agents and apps pay per request in the same web requests</li>
                </ul>
                <a href="https://mpp.dev" target="_blank" rel="noopener noreferrer" className="info-link">
                  mpp.dev
                </a>
              </div>
              
              <div className="info-section">
                <h3>What are Confidential Tokens?</h3>
                <ul className="info-bullets">
                  <li>Balances and transaction amounts stay shielded</li>
                  <li>Passes "The Barista Test" — SKALE's confidential benchmark</li>
                  <li>Perfect for agent payments</li>
                </ul>
                <a href="https://docs.skale.space" target="_blank" rel="noopener noreferrer" className="info-link">
                  docs.skale.space
                </a>
              </div>
            </div>
            
            <div className="connect-wallet-section">
              <button 
                className="connect-btn-large"
                onClick={() => connect({ connector: injected() })}
              >
                Connect Wallet
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="payment-row">
              <PaymentButton
                type="transfer"
                title="MPP Transfer"
                description="Standard USDC transfer"
                meta="You pay gas"
                status={paymentStatus}
                onClick={() => handlePaymentClick('transfer')}
                disabled={paymentStatus === 'processing'}
              />
              <PaymentButton
                type="authorization"
                title="MPP Gasless"
                description="USDC via EIP-3009"
                meta="Server pays gas"
                status={paymentStatus}
                onClick={() => handlePaymentClick('authorization')}
                disabled={paymentStatus === 'processing'}
              />
              <PaymentButton
                type="confidential"
                title="MPP Confidential"
                description="Encrypted eUSDC transfer"
                meta="You pay gas"
                status={paymentStatus}
                onClick={() => handlePaymentClick('confidential')}
                disabled={paymentStatus === 'processing'}
              />
              <PaymentButton
                type="confidential-auth"
                title="MPP Confidential + Gasless"
                description="Encrypted eUSDC via EIP-3009"
                meta="Server pays gas"
                status={paymentStatus}
                onClick={() => handlePaymentClick('confidential-auth')}
                disabled={paymentStatus === 'processing'}
              />
            </div>

            <div className="terminal">
              <div className="terminal-header">
                <div className="terminal-title-bar">
                  <div className="window-controls">
                    <div className="window-btn close"></div>
                    <div className="window-btn minimize"></div>
                    <div className="window-btn maximize"></div>
                  </div>
                  <span className="terminal-title">Terminal — MPP Transaction Logs</span>
                </div>
                <button className="terminal-clear" onClick={() => setLogs([])}>
                  Clear
                </button>
              </div>
              <div className="terminal-body">
                {logs.length === 0 ? (
                  <div className="terminal-prompt-line">
                    <span className="terminal-user">user@mpp-demo</span>
                    <span className="terminal-path">~</span>
                    <span>$</span>
                    <span className="terminal-cursor"></span>
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="log-line">{log}</div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="footer-skale">SKALE</span>
            <span className="footer-mpp">MPP</span>
          </div>
          <span className="footer-divider">|</span>
          <span className="footer-network">Running on SKALE BITE Sandbox</span>
          <span className="footer-divider">|</span>
          <code className="footer-install">npm add @skalenetwork/mpp</code>
          <span className="footer-divider">|</span>
          <a href="https://docs.skale.space" target="_blank" rel="noopener noreferrer" className="footer-link">
            Build on SKALE
          </a>
          <span className="footer-divider">|</span>
          <span className="footer-credit">Demo by @thegreataxios</span>
        </div>
      </footer>
    </div>
  )
}

export default App
