import { useState, useEffect } from 'react'
import { useWalletClient, usePublicClient, useAccount } from 'wagmi'
import './ConfidentialRegistration.css'

interface ConfidentialRegistrationProps {
  onComplete: () => void
  selectedPayment?: string | null
  onProceedToPayment?: (type: string) => void
}

const EUSDC_ADDRESS = '0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200'

// Registration ABI - function expects (bytes32 x, bytes32 y) tuple
const confidentialTokenAbi = [
  {
    inputs: [
      {
        components: [
          { name: 'x', type: 'bytes32' },
          { name: 'y', type: 'bytes32' }
        ],
        name: 'publicKey',
        type: 'tuple'
      }
    ],
    name: 'setViewerPublicKey',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
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
    inputs: [{ name: 'receiver', type: 'address' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'callbackFee',
    outputs: [{ name: '', type: 'uint256' }],
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
  {
    inputs: [{ name: 'accountAddress', type: 'address' }],
    name: 'publicKeys',
    outputs: [
      { name: 'x', type: 'bytes32' },
      { name: 'y', type: 'bytes32' }
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Store keys in localStorage
const STORAGE_KEY = 'confidential_keys'

function saveKeys(keys: { privateKey: string; publicKey: string; walletAddress: string }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
}

function loadKeys(): { privateKey: string; publicKey: string; walletAddress: string } | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : null
}

function ConfidentialRegistration({ onComplete, selectedPayment, onProceedToPayment }: ConfidentialRegistrationProps) {
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const { address: connectedAddress } = useAccount()
  const [status, setStatus] = useState<'checking' | 'not-registered' | 'keys-generated' | 'registering' | 'registered' | 'registered-onchain'>('checking')
  const [error, setError] = useState<string | null>(null)
  const [generatedKeys, setGeneratedKeys] = useState<{ privateKey: string; publicKey: string; walletAddress: string } | null>(null)
  const [encryptedBalance, setEncryptedBalance] = useState<string | null>(null)
  const [decryptedBalance, setDecryptedBalance] = useState<string | null>(null)
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [depositBalance, setDepositBalance] = useState<string>('0')
  const [callbackFee, setCallbackFee] = useState<string>('0')
  const [isDepositing, setIsDepositing] = useState(false)
  const [registeredPublicKey, setRegisteredPublicKey] = useState<{x: string, y: string} | null>(null)
  const [registeredViewerAddress, setRegisteredViewerAddress] = useState<string | null>(null)
  
  // Input fields
  const [customPublicKey, setCustomPublicKey] = useState('')
  const [customPrivateKey, setCustomPrivateKey] = useState('')
  const [useCustomKey, setUseCustomKey] = useState(false)

  // Check for stored keys on mount and on-chain registration
  useEffect(() => {
    const checkRegistration = async () => {
      const stored = loadKeys()
      
      // If we have stored keys for the connected wallet, we're registered
      if (stored && connectedAddress && stored.walletAddress.toLowerCase() === connectedAddress.toLowerCase()) {
        setGeneratedKeys(stored)
        setStatus('registered')
        return
      }
      
      // Check if connected wallet is registered on-chain
      // by checking viewerAddresses - if not address(0), wallet is registered
      if (connectedAddress && publicClient) {
        try {
          const viewerAddress = await publicClient.readContract({
            address: EUSDC_ADDRESS,
            abi: confidentialTokenAbi,
            functionName: 'viewerAddresses',
            args: [connectedAddress as `0x${string}`],
          })
          
          // If viewerAddress is not 0x0, the wallet is registered
          if (viewerAddress && viewerAddress !== '0x0000000000000000000000000000000000000000') {
            console.log('✓ Wallet registered on-chain with viewer:', viewerAddress)
            setStatus('registered-onchain')
            return
          }
        } catch (e: any) {
          console.error('Error checking viewerAddresses:', e?.message || e)
          // Fall through to not-registered
        }
      }
      
      // Has stored keys but for a different wallet
      if (stored) {
        setGeneratedKeys(stored)
      }
      setStatus('not-registered')
    }
    
    checkRegistration()
  }, [connectedAddress, publicClient])

  // Fetch balances when registered
  useEffect(() => {
    if (connectedAddress && publicClient) {
      if (status === 'registered') {
        fetchEncryptedBalance(connectedAddress)
        fetchDepositInfo(connectedAddress)
      } else if (status === 'registered-onchain') {
        fetchDepositInfo(connectedAddress)
        fetchRegisteredKeyInfo(connectedAddress)
      }
    }
  }, [status, connectedAddress, publicClient])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(label)
    setTimeout(() => setCopiedText(null), 2000)
  }

  const isValidAddress = (addr: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr)
  }

  const parsePublicKey = (pubKeyHex: string): { x: `0x${string}`; y: `0x${string}` } | null => {
    try {
      let cleanKey = pubKeyHex.trim()
      if (cleanKey.startsWith('0x')) cleanKey = cleanKey.slice(2)
      // Remove 04 prefix if present and length is 130
      if (cleanKey.length === 130 && cleanKey.startsWith('04')) {
        cleanKey = cleanKey.slice(2)
      }

      if (cleanKey.length !== 128) {
        throw new Error(`Invalid Public Key length: ${cleanKey.length}, expected 128 (or 130 with 04 prefix)`)
      }

      const x = ('0x' + cleanKey.slice(0, 64)) as `0x${string}`
      const y = ('0x' + cleanKey.slice(64)) as `0x${string}`
      
      return { x, y }
    } catch (e) {
      return null
    }
  }

  const fetchDepositInfo = async (walletAddress: string) => {
    if (!walletAddress || !publicClient || !isValidAddress(walletAddress)) return
    
    try {
      const [balance, fee] = await Promise.all([
        publicClient.readContract({
          address: EUSDC_ADDRESS,
          abi: confidentialTokenAbi,
          functionName: 'ethBalanceOf',
          args: [walletAddress as `0x${string}`],
        }),
        publicClient.readContract({
          address: EUSDC_ADDRESS,
          abi: confidentialTokenAbi,
          functionName: 'callbackFee',
        }),
      ])
      
      // Convert from wei to sFUEL (18 decimals)
      const balanceInSfuel = (Number(balance) / 1e18).toFixed(4)
      const feeInSfuel = (Number(fee) / 1e18).toFixed(6)
      
      setDepositBalance(balanceInSfuel)
      setCallbackFee(feeInSfuel)
    } catch (e) {
      console.error('Failed to fetch deposit info:', e)
      setDepositBalance('0')
      setCallbackFee('0')
    }
  }

  const fetchEncryptedBalance = async (walletAddress: string) => {
    if (!walletAddress || !publicClient || !isValidAddress(walletAddress)) return
    
    try {
      const encrypted = await publicClient.readContract({
        address: EUSDC_ADDRESS,
        abi: confidentialTokenAbi,
        functionName: 'encryptedBalanceOf',
        args: [walletAddress as `0x${string}`],
      })
      setEncryptedBalance(encrypted as string)
    } catch (e) {
      console.error('Failed to fetch encrypted balance:', e)
      setEncryptedBalance(null)
    }
  }

  const fetchRegisteredKeyInfo = async (walletAddress: string) => {
    if (!walletAddress || !publicClient || !isValidAddress(walletAddress)) return
    
    try {
      // First get the viewer address
      const viewerAddress = await publicClient.readContract({
        address: EUSDC_ADDRESS,
        abi: confidentialTokenAbi,
        functionName: 'viewerAddresses',
        args: [walletAddress as `0x${string}`],
      })
      
      if (viewerAddress && viewerAddress !== '0x0000000000000000000000000000000000000000') {
        console.log('Found viewer address:', viewerAddress)
        setRegisteredViewerAddress(viewerAddress)
        
        // Then get the public key for that viewer address
        const publicKey = await publicClient.readContract({
          address: EUSDC_ADDRESS,
          abi: confidentialTokenAbi,
          functionName: 'publicKeys',
          args: [viewerAddress as `0x${string}`],
        })
        
        console.log('Fetched public key:', publicKey)
        
        if (publicKey[0] !== '0x0000000000000000000000000000000000000000000000000000000000000000' || 
            publicKey[1] !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          console.log('Setting registered public key')
          setRegisteredPublicKey({
            x: publicKey[0],
            y: publicKey[1]
          })
        }
      } else {
        console.log('No viewer address found for wallet:', walletAddress)
      }
    } catch (e) {
      console.error('Failed to fetch registered key info:', e)
    }
  }

  const depositSFuel = async () => {
    if (!walletClient || !publicClient || !connectedAddress) {
      setError('Wallet not connected')
      return
    }

    setIsDepositing(true)
    setError(null)

    try {
      const hash = await walletClient.writeContract({
        address: EUSDC_ADDRESS,
        abi: confidentialTokenAbi,
        functionName: 'deposit',
        args: [connectedAddress as `0x${string}`],
        value: 1000000000000000000n, // 1 sFUEL in wei
      })

      await publicClient.waitForTransactionReceipt({ hash })
      
      // Refresh deposit balance
      await fetchDepositInfo(connectedAddress)
      
      setError(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Deposit failed')
    } finally {
      setIsDepositing(false)
    }
  }

  const decryptBalance = async () => {
    if (!generatedKeys?.privateKey || !encryptedBalance) return
    
    try {
      // Dynamic import of crypto for browser
      const crypto = await import('crypto')
      
      const cleanSecretKey = generatedKeys.privateKey.startsWith('0x') 
        ? generatedKeys.privateKey.slice(2) 
        : generatedKeys.privateKey
      const cleanEncryptedData = encryptedBalance.startsWith('0x') 
        ? encryptedBalance.slice(2) 
        : encryptedBalance

      const encryptedDataBuffer = Buffer.from(cleanEncryptedData, 'hex')

      // Extract parts
      const iv = encryptedDataBuffer.subarray(0, 16)
      const ephemeralPublicKey = encryptedDataBuffer.subarray(16, 16 + 33)
      const ciphertext = encryptedDataBuffer.subarray(16 + 33)

      // Derive Shared Secret
      const ecdh = crypto.createECDH('secp256k1')
      ecdh.setPrivateKey(Buffer.from(cleanSecretKey, 'hex'))
      const sharedSecret = ecdh.computeSecret(ephemeralPublicKey)

      // Derive Encryption Key: SHA-256(shared_secret)
      const hash = crypto.createHash('sha256')
      hash.update(sharedSecret)
      const encryptionKey = hash.digest()

      // Decrypt: AES-256-CBC
      const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, iv)
      let decrypted = decipher.update(ciphertext)
      decrypted = Buffer.concat([decrypted, decipher.final()])

      // Convert to string and parse
      const decryptedString = decrypted.toString('utf8')
      
      // Try to parse as number
      try {
        const value = BigInt(decryptedString)
        // Assuming 18 decimals for eUSDC
        const formatted = (Number(value) / 1e18).toFixed(4)
        setDecryptedBalance(`${formatted} eUSDC`)
      } catch {
        setDecryptedBalance(decryptedString)
      }
    } catch (e) {
      console.error('Decryption failed:', e)
      setError('Failed to decrypt balance: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const startRegistration = () => {
    setStatus('not-registered')
  }

  const generateKeys = async () => {
    if (!connectedAddress) {
      setError('Please connect your wallet first')
      return
    }

    setError(null)

    try {
      if (useCustomKey && customPublicKey) {
        // Use custom public key
        const parsedKey = parsePublicKey(customPublicKey)
        if (!parsedKey) {
          throw new Error('Invalid public key format')
        }
        
        const keys = {
          privateKey: customPrivateKey && customPrivateKey !== 'placeholder' ? 
            (customPrivateKey.startsWith('0x') ? customPrivateKey : '0x' + customPrivateKey) : 
            '', // Empty if not provided
          publicKey: customPublicKey.startsWith('0x') ? customPublicKey : '0x' + customPublicKey,
          walletAddress: connectedAddress
        }
        setGeneratedKeys(keys)
      } else {
        // Generate new keys
        const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts')
        const privateKey = generatePrivateKey()
        const account = privateKeyToAccount(privateKey)
        
        const keys = { 
          privateKey, 
          publicKey: account.publicKey,
          walletAddress: connectedAddress
        }
        setGeneratedKeys(keys)
      }
      
      setStatus('keys-generated')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to generate keys')
    }
  }

  const register = async () => {
    if (!walletClient || !publicClient || !generatedKeys) {
      setError('Wallet not connected or keys not generated')
      return
    }

    setStatus('registering')
    setError(null)

    try {
      // Parse public key into x, y coordinates
      let cleanKey: string = generatedKeys.publicKey
      if (cleanKey.startsWith('0x')) cleanKey = cleanKey.slice(2)
      if (cleanKey.length === 130 && cleanKey.startsWith('04')) {
        cleanKey = cleanKey.slice(2)
      }
      
      if (cleanKey.length !== 128) {
        throw new Error(`Invalid public key length: ${cleanKey.length}`)
      }
      
      const parsedKey = {
        x: ('0x' + cleanKey.slice(0, 64)) as `0x${string}`,
        y: ('0x' + cleanKey.slice(64)) as `0x${string}`
      }

      // Submit registration transaction
      const hash = await walletClient.writeContract({
        address: EUSDC_ADDRESS,
        abi: confidentialTokenAbi,
        functionName: 'setViewerPublicKey',
        args: [{ x: parsedKey.x, y: parsedKey.y }],
        value: 1000000000000000000n, // 1 sFUEL for callbacks
        gas: 500000n,
      })

      await publicClient.waitForTransactionReceipt({ hash })

      saveKeys(generatedKeys)
      setStatus('registered')
      onComplete()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Registration failed')
      setStatus('keys-generated')
    }
  }

  const clearKeys = () => {
    localStorage.removeItem(STORAGE_KEY)
    setGeneratedKeys(null)
    setStatus('checking')
    setEncryptedBalance(null)
    setDecryptedBalance(null)
    setCustomPublicKey('')
    setCustomPrivateKey('')
    setUseCustomKey(false)
  }

  if (status === 'checking') {
    return (
      <div className="confidential-registration">
        <h3>🔒 Confidential Token Setup</h3>
        <p>Registration is required for confidential eUSDC transfers.</p>
        <button onClick={startRegistration} className="register-button">
          Start Registration
        </button>
      </div>
    )
  }

  if (status === 'not-registered') {
    return (
      <div className="confidential-registration">
        <h3>🔒 Confidential Token Setup</h3>
        
        {/* Wallet Address Display */}
        <div style={{ margin: '1rem 0', padding: '0.75rem', background: '#f5f5f5', borderRadius: '8px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            <strong>Wallet to Register:</strong>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <code style={{ 
              flex: 1,
              fontSize: '0.85rem', 
              fontFamily: 'monospace',
              background: '#fff',
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}>
              {connectedAddress || 'Not connected'}
            </code>
            {connectedAddress && (
              <button
                onClick={() => copyToClipboard(connectedAddress, 'connected')}
                style={{
                  padding: '0.5rem',
                  fontSize: '0.8rem',
                  background: copiedText === 'connected' ? '#4caf50' : '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {copiedText === 'connected' ? '✓' : '📋'}
              </button>
            )}
          </div>
          {!connectedAddress && (
            <p style={{ color: '#f44336', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Please connect your wallet first
            </p>
          )}
        </div>

        <div style={{ margin: '1rem 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={useCustomKey}
              onChange={(e) => setUseCustomKey(e.target.checked)}
            />
            <span>Use my own viewer public key (optional)</span>
          </label>
        </div>

        {useCustomKey ? (
          <div style={{ margin: '1rem 0', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#666' }}>
              <strong>Enter your viewer public key:</strong>
            </p>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
                Public Key (uncompressed, 128 or 130 hex chars):
              </label>
              <textarea
                value={customPublicKey}
                onChange={(e) => setCustomPublicKey(e.target.value)}
                placeholder="0x04... or 04... (128 or 130 hex characters)"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  minHeight: '60px',
                  resize: 'vertical'
                }}
              />
              {customPublicKey && !parsePublicKey(customPublicKey) && (
                <p style={{ color: '#f44336', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  Invalid format. Must be 128 hex chars (or 130 with 04 prefix)
                </p>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={customPrivateKey !== ''}
                  onChange={(e) => setCustomPrivateKey(e.target.checked ? 'placeholder' : '')}
                />
                <span>Save private key for balance decryption (optional)</span>
              </label>
            </div>

            {customPrivateKey !== '' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
                  Private Key (64 hex chars, with or without 0x) - optional:
                </label>
                <textarea
                  value={customPrivateKey === 'placeholder' ? '' : customPrivateKey}
                  onChange={(e) => setCustomPrivateKey(e.target.value)}
                  placeholder="0x... (64 hex characters - only needed to decrypt balance)"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    minHeight: '40px',
                    resize: 'vertical'
                  }}
                />
              </div>
            )}

            <p style={{ fontSize: '0.8rem', color: '#666', margin: '0.5rem 0' }}>
              <strong>Note:</strong> Only the public key is required for registration. 
              The private key is only needed later if you want to decrypt your balance.
            </p>
          </div>
        ) : (
          <p className="registration-info">
            This generates a new keypair. The public key will be registered for confidential transfers.
            You can decrypt your balance with the private key later.
          </p>
        )}
        
        {error && <p className="error">{error}</p>}
        
        <button 
          onClick={generateKeys} 
          className="register-button"
          disabled={!connectedAddress || (useCustomKey && !parsePublicKey(customPublicKey))}
          style={{
            opacity: !connectedAddress || (useCustomKey && !parsePublicKey(customPublicKey)) ? 0.5 : 1
          }}
        >
          {useCustomKey ? 'Continue with Public Key' : 'Generate New Keys'}
        </button>
      </div>
    )
  }

  if (status === 'keys-generated') {
    return (
      <div className="confidential-registration">
        <h3>🔒 Review Your Keys</h3>
        
        <div style={{ 
          margin: '1rem 0', 
          padding: '1rem', 
          background: '#fff3cd', 
          borderRadius: '8px',
          border: '1px solid #ffeaa7'
        }}>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#856404' }}>
            <strong>⚠️ Save these keys!</strong> They are needed to decrypt your balance.
          </p>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Wallet Address (from MetaMask):
            </label>
            <code style={{ 
              fontSize: '0.8rem', 
              fontFamily: 'monospace',
              background: '#fff',
              padding: '0.5rem',
              borderRadius: '4px',
              display: 'block',
              wordBreak: 'break-all'
            }}>
              {connectedAddress}
            </code>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Public Key (for encryption):
            </label>
            <code style={{ 
              fontSize: '0.75rem', 
              fontFamily: 'monospace',
              background: '#fff',
              padding: '0.5rem',
              borderRadius: '4px',
              display: 'block',
              wordBreak: 'break-all'
            }}>
              {generatedKeys?.publicKey}
            </code>
            <button 
              onClick={() => generatedKeys?.publicKey && copyToClipboard(generatedKeys.publicKey, 'pubkey')}
              style={{
                marginTop: '0.5rem',
                padding: '0.25rem 0.5rem',
                fontSize: '0.8rem',
                background: copiedText === 'pubkey' ? '#4caf50' : '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {copiedText === 'pubkey' ? '✓ Copied!' : '📋 Copy Public Key'}
            </button>
          </div>
          
          {generatedKeys?.privateKey ? (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold', color: '#c62828' }}>
                Private Key (SECRET - save this!):
              </label>
              <code style={{ 
                fontSize: '0.75rem', 
                fontFamily: 'monospace',
                background: '#ffebee',
                padding: '0.5rem',
                borderRadius: '4px',
                display: 'block',
                wordBreak: 'break-all',
                color: '#c62828'
              }}>
                {generatedKeys.privateKey}
              </code>
              <button 
                onClick={() => copyToClipboard(generatedKeys.privateKey, 'privkey')}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.8rem',
                  background: copiedText === 'privkey' ? '#4caf50' : '#c62828',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {copiedText === 'privkey' ? '✓ Copied!' : '📋 Copy Private Key'}
              </button>
            </div>
          ) : (
            <div style={{ 
              marginBottom: '1rem', 
              padding: '0.75rem', 
              background: '#fff3cd', 
              borderRadius: '4px',
              border: '1px solid #ffeaa7'
            }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#856404' }}>
                <strong>⚠️ No private key saved</strong><br/>
                You won't be able to decrypt your balance. Make sure you have it stored elsewhere.
              </p>
            </div>
          )}
        </div>
        
        {error && <p className="error">{error}</p>}
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => setStatus('not-registered')}
            style={{
              flex: 1,
              padding: '0.75rem',
              fontSize: '1rem',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ← Back
          </button>
          <button 
            onClick={register}
            className="register-button"
            style={{
              flex: 2,
              padding: '0.75rem',
              fontSize: '1rem'
            }}
          >
            Register on Blockchain
          </button>
        </div>
      </div>
    )
  }

  if (status === 'registering') {
    return (
      <div className="confidential-registration">
        <h3>🔒 Confidential Token Setup</h3>
        <p>Registering public key for: {connectedAddress?.slice(0, 20)}...</p>
        <p>Please confirm the transaction in your wallet.</p>
        <div className="spinner"></div>
      </div>
    )
  }

  // Already registered on-chain but no keys stored
  if (status === 'registered-onchain') {
    return (
      <div className="confidential-registration success">
        <h3>🔒 Confidential Token Setup</h3>
        
        <div style={{ 
          margin: '1rem 0', 
          padding: '0.75rem', 
          background: '#e8f5e9', 
          borderRadius: '8px',
          border: '1px solid #a5d6a7'
        }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#2e7d32' }}>
            <strong>✓ Wallet already registered on-chain</strong>
          </p>
          <p style={{ fontSize: '0.8rem', color: '#666' }}>
            {connectedAddress?.slice(0, 20)}...
          </p>
        </div>

        {/* Registered Public Key Info */}
        {registeredPublicKey ? (
          <div style={{ 
            margin: '1rem 0', 
            padding: '1rem', 
            background: '#f0f4c3', 
            borderRadius: '8px',
            border: '1px solid #d4e157'
          }}>
            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: 'bold' }}>
              🔐 Registered Public Key (for viewing encrypted balances):
            </p>
            
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#666' }}>Viewer Address:</label>
              <code style={{ 
                fontSize: '0.75rem', 
                fontFamily: 'monospace',
                background: '#fff',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                display: 'block',
                wordBreak: 'break-all',
                marginTop: '0.25rem'
              }}>
                {registeredViewerAddress}
              </code>
            </div>
            
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#666' }}>Public Key X:</label>
              <code style={{ 
                fontSize: '0.7rem', 
                fontFamily: 'monospace',
                background: '#fff',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                display: 'block',
                wordBreak: 'break-all',
                marginTop: '0.25rem'
              }}>
                {registeredPublicKey.x}
              </code>
            </div>
            
            <div>
              <label style={{ fontSize: '0.75rem', color: '#666' }}>Public Key Y:</label>
              <code style={{ 
                fontSize: '0.7rem', 
                fontFamily: 'monospace',
                background: '#fff',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                display: 'block',
                wordBreak: 'break-all',
                marginTop: '0.25rem'
              }}>
                {registeredPublicKey.y}
              </code>
            </div>
          </div>
        ) : (
          <div style={{ 
            margin: '1rem 0', 
            padding: '1rem', 
            background: '#ffebee', 
            borderRadius: '8px',
            border: '1px solid #ef9a9a'
          }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#c62828' }}>
              <strong>⚠️ Wallet registered but public key info not found</strong><br/>
              This might be a loading issue. Check the console for details.
            </p>
          </div>
        )}

        {/* Deposit Balance Section */}
        <div style={{ 
          margin: '1rem 0', 
          padding: '0.75rem', 
          background: Number(depositBalance) > 0.5 ? '#e3f2fd' : '#ffebee', 
          borderRadius: '8px',
          border: Number(depositBalance) > 0.5 ? '1px solid #90caf9' : '1px solid #ef9a9a'
        }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
            <strong>Gas Deposit for Confidential Transfers:</strong>
          </p>
          <p style={{ fontSize: '1.2rem', fontFamily: 'monospace', margin: '0.5rem 0' }}>
            {depositBalance} sFUEL
          </p>
          {Number(depositBalance) < 0.5 && (
            <p style={{ fontSize: '0.8rem', color: '#c62828', marginTop: '0.5rem' }}>
              ⚠️ Low balance! Need at least 0.5 sFUEL for transfers
            </p>
          )}
          <button 
            onClick={depositSFuel}
            disabled={isDepositing}
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 1rem',
              fontSize: '0.9rem',
              background: isDepositing ? '#ccc' : '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isDepositing ? 'not-allowed' : 'pointer',
              width: '100%'
            }}
          >
            {isDepositing ? 'Depositing...' : '💰 Deposit 1 sFUEL'}
          </button>
          {callbackFee !== '0' && (
            <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
              Callback fee: {callbackFee} sFUEL per transfer
            </p>
          )}
        </div>
        
        <div style={{ 
          margin: '1.5rem 0', 
          padding: '1rem', 
          background: '#fff3cd', 
          borderRadius: '8px',
          border: '1px solid #ffeaa7'
        }}>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem' }}>
            <strong>Make a test payment now</strong>
          </p>
          <p style={{ fontSize: '0.8rem', color: '#856404', marginBottom: '1rem' }}>
            You can proceed with a confidential payment. To view your encrypted balance later, you'll need your private key.
          </p>
          <button 
            onClick={() => {
              if (onProceedToPayment && selectedPayment) {
                onProceedToPayment(selectedPayment)
              } else {
                onComplete()
              }
            }}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            🚀 {selectedPayment ? 'Proceed to Payment' : 'Back to Payments'}
          </button>
        </div>
        
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#666' }}>
            <strong>Want to restore your keys?</strong>
          </p>
          <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '1rem' }}>
            If you have your private key, you can import it to decrypt your balance.
          </p>
          <button 
            onClick={() => setStatus('not-registered')}
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
            Restore Keys
          </button>
        </div>
      </div>
    )
  }

  // Registered with keys
  return (
    <div className="confidential-registration success">
      <h3>🔒 Confidential Token Setup</h3>
      <p>✅ Registration complete!</p>
      
      {generatedKeys?.walletAddress && (
        <div style={{ 
          margin: '1rem 0', 
          padding: '0.75rem', 
          background: '#e8f5e9', 
          borderRadius: '8px',
          border: '1px solid #a5d6a7'
        }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#2e7d32' }}>
            <strong>✓ Registered wallet:</strong>
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <code style={{ 
              fontSize: '0.85rem', 
              fontFamily: 'monospace',
              background: '#fff',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {generatedKeys.walletAddress}
            </code>
            <button 
              onClick={() => copyToClipboard(generatedKeys.walletAddress, 'wallet')}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.8rem',
                background: copiedText === 'wallet' ? '#4caf50' : '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {copiedText === 'wallet' ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Deposit Balance Section */}
      <div style={{ 
        margin: '1rem 0', 
        padding: '0.75rem', 
        background: Number(depositBalance) > 0.5 ? '#e3f2fd' : '#ffebee', 
        borderRadius: '8px',
        border: Number(depositBalance) > 0.5 ? '1px solid #90caf9' : '1px solid #ef9a9a'
      }}>
        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
          <strong>Gas Deposit for Confidential Transfers:</strong>
        </p>
        <p style={{ fontSize: '1.2rem', fontFamily: 'monospace', margin: '0.5rem 0' }}>
          {depositBalance} sFUEL
        </p>
        {Number(depositBalance) < 0.5 && (
          <p style={{ fontSize: '0.8rem', color: '#c62828', marginTop: '0.5rem' }}>
            ⚠️ Low balance! Need at least 0.5 sFUEL for transfers
          </p>
        )}
        <button 
          onClick={depositSFuel}
          disabled={isDepositing}
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 1rem',
            fontSize: '0.9rem',
            background: isDepositing ? '#ccc' : '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isDepositing ? 'not-allowed' : 'pointer',
            width: '100%'
          }}
        >
          {isDepositing ? 'Depositing...' : '💰 Deposit 1 sFUEL'}
        </button>
        {callbackFee !== '0' && (
          <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
            Callback fee: {callbackFee} sFUEL per transfer
          </p>
        )}
      </div>
      
      {encryptedBalance && (
        <div className="balance-section" style={{ marginTop: '1rem', padding: '1rem', background: '#f0f0f0', borderRadius: '8px' }}>
          <h4>Your Encrypted Balance</h4>
          <p style={{ fontSize: '0.8rem', wordBreak: 'break-all', fontFamily: 'monospace' }}>
            {encryptedBalance.slice(0, 60)}...
          </p>
          
          {!decryptedBalance ? (
            <button 
              onClick={decryptBalance}
              className="decrypt-button"
              style={{ 
                marginTop: '0.5rem',
                padding: '0.5rem 1rem',
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🔓 Decrypt Balance
            </button>
          ) : (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#4CAF50', color: 'white', borderRadius: '4px' }}>
              <strong>Decrypted: {decryptedBalance}</strong>
            </div>
          )}
        </div>
      )}
      
      {generatedKeys && (
        <div className="generated-keys" style={{ marginTop: '1rem', padding: '1rem', background: '#fff3cd', borderRadius: '4px' }}>
          <p><strong>Your Keys (saved locally):</strong></p>
          <details>
            <summary style={{ cursor: 'pointer', color: '#856404' }}>Click to view keys</summary>
            <p style={{ fontSize: '0.75rem', wordBreak: 'break-all', marginTop: '0.5rem' }}>
              <strong>Private Key:</strong> {generatedKeys.privateKey}
            </p>
            <p style={{ fontSize: '0.75rem', wordBreak: 'break-all', marginTop: '0.5rem' }}>
              <strong>Public Key:</strong> {generatedKeys.publicKey}
            </p>
          </details>
          <button 
            onClick={clearKeys}
            style={{ 
              marginTop: '0.5rem',
              padding: '0.25rem 0.5rem',
              fontSize: '0.8rem',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear Keys & Re-register
          </button>
        </div>
      )}
    </div>
  )
}

export default ConfidentialRegistration
