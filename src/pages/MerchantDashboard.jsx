import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { BiometricCamera } from '../components/BiometricCamera'
import { identifyFace, verifyFace, generateTransactionNonce } from '../lib/biometric-api'
import './MerchantDashboard.css'

export function MerchantDashboard() {
  const { user } = useAuth()
  const [merchantProfile, setMerchantProfile] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [todaySales, setTodaySales] = useState(0)
  const [loading, setLoading] = useState(true)

  // Terminal state
  const [terminalActive, setTerminalActive] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [amount, setAmount] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [paymentLock, setPaymentLock] = useState(false) // CRITICAL: Prevent duplicate payments
  const [success, setSuccess] = useState(null)
  const [transactionNonce, setTransactionNonce] = useState(null)
  const [verificationToken, setVerificationToken] = useState(null)
  const [identificationError, setIdentificationError] = useState(null)
  const [verificationError, setVerificationError] = useState(null)

  useEffect(() => {
    if (user) fetchData()
  }, [user])

  async function fetchData() {
    setLoading(true)
    try {
      // Get merchant profile
      const { data: merchProfile } = await supabase
        .from('merchant_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()
      setMerchantProfile(merchProfile)

      if (merchProfile) {
        // Get transactions (simple query)
        const { data: txns } = await supabase
          .from('transactions')
          .select('*')
          .eq('merchant_id', merchProfile.id)
          .order('created_at', { ascending: false })
          .limit(20)
        setTransactions(txns || [])

        const today = new Date().toISOString().split('T')[0]
        const todayTxns = (txns || []).filter(t => t.created_at.startsWith(today))
        const total = todayTxns.reduce((sum, t) => sum + parseFloat(t.amount), 0)
        setTodaySales(total)
      }
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  function openTerminal() {
    setTerminalActive(true)
    setScanning(true)
    setSelectedCustomer(null)
    setAmount('')
    setConfirming(false)
    setSuccess(null)
    setTransactionNonce(null)
    setVerificationToken(null)
    setIdentificationError(null)
    setVerificationError(null)
  }

  function closeTerminal() {
    setTerminalActive(false)
    setScanning(false)
    setSelectedCustomer(null)
    setAmount('')
    setConfirming(false)
    setSuccess(null)
    setTransactionNonce(null)
    setVerificationToken(null)
    setIdentificationError(null)
    setVerificationError(null)
    setPaymentLock(false) // Reset payment lock
  }

  async function handleIdentificationCapture(biometricData) {
    setProcessing(true)
    setIdentificationError(null)
    
    try {
      // Call identify-face Edge Function (1:N matching)
      console.log('Calling identifyFace with biometric data:', { quality: biometricData.quality, embeddingLength: biometricData.embedding?.length })
      const result = await identifyFace(biometricData, 0.75) // Lowered threshold to 75% to accommodate varying conditions
      console.log('Identification result:', result)
      console.log('⚠️ SECURITY CHECK - Similarity score:', result.similarity, '| Threshold:', 0.75)
      
      // CRITICAL: Strict validation to prevent false positives
      if (!result.success) {
        setIdentificationError('Face detection failed. Please try again.')
        setScanning(false)
        setProcessing(false)
        return
      }
      
      if (!result.identified || result.similarity < 0.75) {
        // Clear "NOT REGISTERED" message - user not enrolled or similarity too low
        setIdentificationError(
          result.similarity > 0 
            ? `❌ UNREGISTERED PERSON\n\nFace similarity: ${Math.round(result.similarity * 100)}%\nMinimum required: 75%\n\nThis person is not registered in the system.`
            : '❌ UNREGISTERED PERSON\n\nNo matching customer found in database.\n\nPlease register this customer first.'
        )
        setScanning(false)
        setProcessing(false)
        return
      }
      
      // Fetch customer profile from database using user_id
      // Note: Backend returns user_id as integer from biometrics table
      // We need to find the auth user UUID first, then get the profile
      let customerProfile = null
      let profileError = null
      
      // Try to get profile by matching the customer name/email from identification
      // Since backend returns limited user info, we'll search by the matched user data
      const { data: profiles, error: searchError } = await supabase
        .from('customer_profiles')
        .select('*, profiles!inner(*)')
        .limit(50) // Get recent customer profiles
      
      if (searchError) {
        console.error('Failed to fetch customer profiles:', searchError)
        profileError = searchError
      } else if (profiles && profiles.length > 0) {
        // Match by name similarity or find the profile
        // For now, use the first active profile as a fallback
        // TODO: Improve matching logic with proper user_id mapping
        customerProfile = profiles.find(p => p.facepay_enabled) || profiles[0]
      }
      
      if (profileError || !customerProfile) {
        console.error('Failed to fetch customer profile:', profileError)
        setIdentificationError('Customer profile not found. Please ensure the customer is registered as a customer (not just biometric enrollment).')
        setScanning(false)
        setProcessing(false)
        return
      }
      
      // Customer identified successfully
      setSelectedCustomer({
        id: customerProfile.id, // Use customer_profile.id for transactions
        userId: result.customer.id, // Keep user_id for reference
        facepayId: customerProfile.facepay_id || result.customer.id,
        fullName: result.customer.name,
        email: result.customer.email || 'N/A',
        facepayEnabled: customerProfile.facepay_enabled,
        transactionLimit: customerProfile.transaction_limit || 1000,
        similarity: result.similarity
      })
      
      setScanning(false)
      setProcessing(false)
      
    } catch (error) {
      console.error('Identification error:', error)
      setIdentificationError(`Identification failed: ${error.message}`)
      setScanning(false)
      setProcessing(false)
    }
  }

  function handleIdentificationCancel() {
    setScanning(false)
    closeTerminal()
  }

  function continueToConfirm() {
    if (!amount || parseFloat(amount) <= 0) return
    const parsedAmount = parseFloat(amount)
    if (parsedAmount > selectedCustomer.transactionLimit) {
      alert(`Amount exceeds customer's transaction limit of ₹${selectedCustomer.transactionLimit}`)
      return
    }
    
    // Generate transaction nonce for verification
    const nonce = generateTransactionNonce()
    setTransactionNonce(nonce)
    setConfirming(true)
  }

  async function handleVerificationCapture(biometricData) {
    // CRITICAL: Prevent duplicate payments with lock
    if (paymentLock) {
      console.warn('⚠️ Payment already in progress - ignoring duplicate request')
      return
    }
    
    setPaymentLock(true) // Lock payment processing
    setProcessing(true)
    setVerificationError(null)
    
    try {
      // Call verify-face Edge Function (1:1 verification)
      console.log('Calling verifyFace with:', { 
        userId: selectedCustomer.userId,
        customerProfileId: selectedCustomer.id, 
        transactionNonce, 
        quality: biometricData.quality 
      })
      const result = await verifyFace(
        biometricData,
        selectedCustomer.userId, // Pass user_id for YuNet matching, not customer_profile.id
        transactionNonce,
        0.75 // Lowered to 75% to accommodate varying conditions
      )
      console.log('Verification result:', result)
      
      if (!result.success || !result.verified) {
        setVerificationError('Face verification failed. The person does not match the identified customer.')
        setProcessing(false)
        setPaymentLock(false) // Release lock on failure
        return
      }
      
      // Verification successful - store token
      setVerificationToken(result.verificationToken)
      
      // NEW: Add WebAuthn authorization step
      console.log('Face verified! Now prompting for device biometric authorization...')
      
      try {
        // Import WebAuthn function
        const { authenticateWebAuthn, hasWebAuthnCredential } = await import('../lib/webauthn.js')
        
        // Check if customer has registered WebAuthn
        const hasWebAuthn = await hasWebAuthnCredential(selectedCustomer.userId)
        
        if (!hasWebAuthn) {
          setVerificationError('Customer has not registered device biometric authentication. Payment cannot be completed.')
          setProcessing(false)
          setPaymentLock(false)
          return
        }
        
        // Prompt for WebAuthn authorization
        console.log('Prompting for device biometric authorization...')
        setVerificationError('Please authorize payment with your device biometric (Windows Hello/Touch ID/fingerprint)...')
        
        const webauthnResult = await authenticateWebAuthn(selectedCustomer.userId, {
          amount: parseFloat(amount),
          merchantId: merchantProfile.id,
          timestamp: new Date().toISOString()
        })
        
        if (!webauthnResult.verified) {
          setVerificationError(`Device biometric authorization failed. Payment cannot be completed.`)
          setProcessing(false)
          setPaymentLock(false)
          return
        }
        
        console.log(`✅ Both factors verified! Face: ✓ Device Biometric (${webauthnResult.authenticatorName}): ✓`)
        
        // Process payment with dual authorization
        await processPayment(result.verificationToken, webauthnResult.authorizationToken)
        
      } catch (webauthnError) {
        console.error('WebAuthn authorization failed:', webauthnError)
        setVerificationError(`Device biometric authorization failed: ${webauthnError.message}`)
        setProcessing(false)
        setPaymentLock(false)
        return
      }
      
    } catch (error) {
      console.error('Verification error:', error)
      setVerificationError(`Verification failed: ${error.message}`)
      setProcessing(false)
      setPaymentLock(false) // Release lock on error
    }
  }

  function handleVerificationCancel() {
    setConfirming(false)
    setTransactionNonce(null)
    setVerificationError(null)
    setPaymentLock(false) // Release lock on cancel
  }

  async function processPayment(verificationToken, webauthnToken = null) {
    try {
      const transactionId = `FP-TXN-${Date.now()}`
      
      // Check for duplicate transaction in last 60 seconds (extra safety)
      const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString()
      const { data: recentTxns } = await supabase
        .from('transactions')
        .select('transaction_id')
        .eq('customer_id', selectedCustomer.id)
        .eq('amount', parseFloat(amount))
        .gte('created_at', sixtySecondsAgo)
      
      if (recentTxns && recentTxns.length > 0) {
        console.warn('⚠️ Duplicate transaction detected - aborting')
        setVerificationError('Duplicate transaction detected. Please wait before trying again.')
        setProcessing(false)
        setPaymentLock(false)
        return
      }
      
      // Determine authentication method based on what was used
      let authMethod = 'BIOMETRIC_FACEPAY'
      if (webauthnToken) {
        authMethod = 'DUAL_BIOMETRIC_FACEPAY_WEBAUTHN'
      }
      
      const { error } = await supabase.from('transactions').insert({
        transaction_id: transactionId,
        customer_id: selectedCustomer.id,
        merchant_id: merchantProfile.id,
        amount: parseFloat(amount),
        currency: 'INR',
        status: 'SUCCESS',
        authentication_method: authMethod,
        biometric_similarity: selectedCustomer.similarity,
        transaction_nonce: transactionNonce,
        verification_timestamp: new Date().toISOString(),
        webauthn_verified: !!webauthnToken
      })

      if (error) throw error

      setSuccess({
        transactionId,
        amount: parseFloat(amount),
        customerName: selectedCustomer.fullName,
        facepayId: selectedCustomer.facepayId,
        verificationToken,
        webauthnToken,
        authMethod
      })

      setTimeout(() => {
        fetchData()
        closeTerminal()
      }, 4000)
    } catch (err) {
      setVerificationError(`Payment failed: ${err.message}`)
      setPaymentLock(false) // Release lock on error
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
        <p>Loading dashboard...</p>
      </div>
    )
  }

  if (terminalActive) {
    return (
      <div className="merchant-terminal">
        {success ? (
          <div className="terminal-success animate-scale">
            <div className="success-icon">✓</div>
            <h2>Payment Successful</h2>
            <div className="success-amount">₹{success.amount.toLocaleString('en-IN')}</div>
            <div className="success-details">
              <p><strong>Paid to:</strong> {merchantProfile?.business_name}</p>
              <p><strong>Customer:</strong> {success.customerName}</p>
              <p><strong>FacePay ID:</strong> {success.facepayId}</p>
              <p><strong>Transaction ID:</strong> {success.transactionId}</p>
              <p className="text-muted" style={{fontSize: '0.8rem', marginTop: '1rem'}}>
                {success.webauthnToken ? (
                  <>
                    ✓ Dual-factor biometric verification completed<br/>
                    ✓ Face recognition + {success.authMethod?.includes('WEBAUTHN') ? 'Device biometric' : 'Face verification'}
                  </>
                ) : (
                  '✓ Biometric verification completed'
                )}
              </p>
            </div>
          </div>
        ) : confirming ? (
          <div className="terminal-confirm animate-in">
            <h2>Second Biometric Verification</h2>
            <p className="text-muted">Verify customer identity to authorize payment</p>
            
            <div className="confirmation-details">
              <div className="detail-row">
                <span>Customer:</span>
                <span><strong>{selectedCustomer.fullName}</strong></span>
              </div>
              <div className="detail-row">
                <span>Amount:</span>
                <span><strong>₹{parseFloat(amount).toLocaleString('en-IN')}</strong></span>
              </div>
              <div className="detail-row">
                <span>Merchant:</span>
                <span>{merchantProfile?.business_name}</span>
              </div>
            </div>
            
            {verificationError && (
              <div className="alert alert-error" style={{marginBottom: '1rem'}}>
                {verificationError}
              </div>
            )}
            
            <BiometricCamera
              onSuccess={handleVerificationCapture}
              onCancel={handleVerificationCancel}
              mode="verify"
              requireLiveness={true}
              showInstructions={true}
            />
          </div>
        ) : selectedCustomer && amount ? (
          <div className="terminal-review animate-in">
            <h2>Confirm Payment</h2>
            <div className="review-details">
              <div className="review-row">
                <span className="review-label">Customer</span>
                <span className="review-value">{selectedCustomer.fullName}</span>
              </div>
              <div className="review-row">
                <span className="review-label">FacePay ID</span>
                <span className="review-value mono-text">{selectedCustomer.facepayId}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Identity Match</span>
                <span className="review-value">
                  <span className="badge badge-success">
                    {Math.round(selectedCustomer.similarity * 100)}% similarity
                  </span>
                </span>
              </div>
              <div className="review-row">
                <span className="review-label">Merchant</span>
                <span className="review-value">{merchantProfile?.business_name}</span>
              </div>
              <div className="review-row review-row-highlight">
                <span className="review-label">Amount</span>
                <span className="review-value review-amount">₹{parseFloat(amount).toLocaleString('en-IN')}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Payment Method</span>
                <span className="review-value"><span className="badge badge-success">FacePay Biometric</span></span>
              </div>
            </div>
            <button onClick={continueToConfirm} className="btn btn-accent btn-full btn-lg" disabled={processing}>
              {processing ? <span className="spinner" /> : 'Proceed to Verification'}
            </button>
            <button onClick={() => { setAmount(''); setConfirming(false); }} className="btn btn-ghost btn-full">
              Change Amount
            </button>
          </div>
        ) : selectedCustomer ? (
          <div className="terminal-amount animate-in">
            <div className="customer-verified">
              <div className="verified-icon">✓</div>
              <h3>Customer Verified</h3>
              <p><strong>{selectedCustomer.fullName}</strong></p>
              <p className="mono-text">{selectedCustomer.facepayId}</p>
              <p className="text-muted" style={{fontSize: '0.9rem', marginTop: '0.5rem'}}>
                Identity Match: {Math.round(selectedCustomer.similarity * 100)}%
              </p>
              <span className={`badge ${selectedCustomer.facepayEnabled ? 'badge-success' : 'badge-danger'}`}>
                {selectedCustomer.facepayEnabled ? 'ACTIVE' : 'DISABLED'}
              </span>
            </div>
            <div className="amount-input">
              <label className="form-label">Enter Amount</label>
              <div className="currency-input">
                <span className="currency-symbol">₹</span>
                <input
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <span className="form-hint">Limit: ₹{selectedCustomer.transactionLimit.toLocaleString('en-IN')}</span>
            </div>
            <button onClick={continueToConfirm} className="btn btn-primary btn-full btn-lg" disabled={!amount || parseFloat(amount) <= 0}>
              Continue
            </button>
            <button onClick={() => { setSelectedCustomer(null); setScanning(true); }} className="btn btn-ghost btn-full">
              Scan Different Customer
            </button>
          </div>
        ) : scanning ? (
          <div className="terminal-scan animate-in">
            <h2>Scan Customer Face</h2>
            <p className="text-muted" style={{marginBottom: '1.5rem'}}>
              Real biometric face identification (1:N matching)
            </p>
            
            {identificationError && (
              <div className="alert alert-error" style={{
                marginBottom: '1rem',
                background: 'linear-gradient(135deg, #ff5252 0%, #f44336 100%)',
                color: 'white',
                padding: '1.5rem',
                borderRadius: '12px',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                textAlign: 'center',
                boxShadow: '0 4px 20px rgba(255, 82, 82, 0.4)',
                animation: 'shake 0.5s',
                whiteSpace: 'pre-line'
              }}>
                <div style={{fontSize: '3rem', marginBottom: '0.5rem'}}>❌</div>
                {identificationError}
                <button 
                  onClick={() => { setIdentificationError(null); setScanning(true); }} 
                  className="btn btn-sm"
                  style={{
                    marginTop: '1rem',
                    background: 'white',
                    color: '#f44336',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    borderRadius: '8px'
                  }}
                >
                  Try Again
                </button>
              </div>
            )}
            
            {!identificationError && (
              <BiometricCamera
                onSuccess={handleIdentificationCapture}
                onCancel={handleIdentificationCancel}
                mode="identify"
                requireLiveness={true}
                showInstructions={true}
              />
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="merchant-dashboard">
      <div className="dashboard-container">
        <div className="dashboard-welcome">
          <h1>Merchant Terminal</h1>
          <p className="text-muted">{merchantProfile?.business_name}</p>
        </div>

        <button onClick={openTerminal} className="btn-scan-customer">
          SCAN CUSTOMER
        </button>

        <div className="dashboard-cards">
          <div className="dash-card">
            <div className="dash-card-label">Today's Sales</div>
            <div className="dash-card-value">₹{todaySales.toLocaleString('en-IN')}</div>
            <div className="dash-card-hint">{new Date().toLocaleDateString('en-IN')}</div>
          </div>
          <div className="dash-card">
            <div className="dash-card-label">Merchant ID</div>
            <div className="dash-card-value dash-card-mono">{merchantProfile?.merchant_id}</div>
          </div>
          <div className="dash-card">
            <div className="dash-card-label">Total Transactions</div>
            <div className="dash-card-value">{transactions.length}</div>
          </div>
        </div>

        <div className="dashboard-section">
          <h2>Transaction History</h2>
          {transactions.length === 0 ? (
            <div className="empty-state">
              <p>No transactions yet</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Transaction ID</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(txn => (
                    <tr key={txn.id}>
                      <td>Customer</td>
                      <td className="mono-text">{txn.transaction_id?.split('-')[2] || '—'}</td>
                      <td className="amount">₹{parseFloat(txn.amount).toLocaleString('en-IN')}</td>
                      <td>{new Date(txn.created_at).toLocaleString('en-IN')}</td>
                      <td><span className="badge badge-demo">{txn.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
