import { useState } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { parseEther } from 'viem'
import './ConfidentialRegistration.css'

// eUSDC contract address and registration ABI
const EUSDC_ADDRESS = '0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200'

const registrationAbi = [
  {
    inputs: [{ name: 'holder', type: 'address' }],
    name: 'viewerAddresses',
    outputs: [{ name: 'viewerAddress', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'register',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const

interface ConfidentialRegistrationProps {
  onComplete: () => void
  onProceedToPayment: (paymentType: string) => void
}

function ConfidentialRegistration({ onComplete, onProceedToPayment }: ConfidentialRegistrationProps) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  
  const [isRegistering, setIsRegistering] = useState(false)
  const [registrationComplete, setRegistrationComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRegister = async () => {
    if (!walletClient || !address) {
      setError('Wallet not connected')
      return
    }

    setIsRegistering(true)
    setError(null)

    try {
      // Check if already registered
      const viewerAddress = await publicClient?.readContract({
        address: EUSDC_ADDRESS,
        abi: registrationAbi,
        functionName: 'viewerAddresses',
        args: [address],
      })

      const isRegistered = viewerAddress && viewerAddress !== '0x0000000000000000000000000000000000000000'
      
      if (isRegistered) {
        setRegistrationComplete(true)
        setIsRegistering(false)
        onComplete()
        return
      }

      // Send registration transaction with 0.001 sFUEL deposit
      const hash = await walletClient.writeContract({
        address: EUSDC_ADDRESS,
        abi: registrationAbi,
        functionName: 'register',
        value: parseEther('0.001'),
      })

      console.log('Registration transaction sent:', hash)
      
      // Wait for confirmation
      await publicClient?.waitForTransactionReceipt({ hash })
      
      setRegistrationComplete(true)
      setIsRegistering(false)
      onComplete()
    } catch (err: any) {
      setError(err?.message || 'Registration failed')
      setIsRegistering(false)
    }
  }

  if (registrationComplete) {
    return (
      <div className="confidential-registration success">
        <h3>✅ Registration Complete</h3>
        <p>Your wallet is now registered for confidential payments.</p>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button 
            className="register-button"
            onClick={() => onProceedToPayment('confidential')}
          >
            Pay Confidential
          </button>
          <button 
            className="register-button"
            style={{ background: '#6c757d' }}
            onClick={onComplete}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="confidential-registration">
      <h3>🔒 Confidential Registration Required</h3>
      <p>
        To make confidential payments with eUSDC, you need to register your wallet first.
        This requires a one-time deposit of 0.001 sFUEL.
      </p>
      
      <div className="registration-info">
        <strong>Registration Details:</strong>
        <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
          <li>One-time setup</li>
          <li>0.001 sFUEL deposit required</li>
          <li>Enables encrypted eUSDC transfers</li>
          <li>Amounts hidden from public view</li>
        </ul>
      </div>

      {error && <div className="error">❌ {error}</div>}

      <button 
        className="register-button"
        onClick={handleRegister}
        disabled={isRegistering || !walletClient}
      >
        {isRegistering ? (
          <>
            <span className="spinner" style={{ width: '20px', height: '20px', marginRight: '0.5rem', display: 'inline-block' }}></span>
            Registering...
          </>
        ) : (
          'Register Wallet (0.001 sFUEL)'
        )}
      </button>
    </div>
  )
}

export default ConfidentialRegistration
