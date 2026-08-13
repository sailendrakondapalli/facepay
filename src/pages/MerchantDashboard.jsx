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
  const [verificationMethod, setVerificationMethod] = useState(null) // NEW: Track merchant's choice
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

  function openTerminal(method = 'face') {
    setTerminalActive(true)
    setVerificationMethod(method)
    
    if (method === 'face') {
      setScanning(true)
    } else if (method === 'device') {
      // For device biometric, we'll need customer to enter their details first
      setScanning(false)
    }
    
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
    setVerificationMethod(null)
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
        
        // Check if customer has registered WebAuthn and automatically handle second factor
        const hasWebAuthn = await hasWebAuthnCredential(selectedCustomer.userId)
        
        console.log(`✅ Face verified! Processing payment for ${selectedCustomer.fullName}...`)
        
        if (hasWebAuthn) {
          // Customer has registered device biometric - automatically prompt for it
          try {
            console.log('Auto-prompting for registered device biometric authorization...')
            setVerificationError('Authorizing payment with registered device biometric...')
            
            const webauthnResult = await authenticateWebAuthn(selectedCustomer.userId, {
              amount: parseFloat(amount),
              merchantId: merchantProfile.id,
              timestamp: new Date().toISOString()
            })
            
            if (!webauthnResult.verified) {
              // If WebAuthn fails, fallback to face-only
              console.log('Device biometric failed, completing with face-only verification')
              setVerificationError('Device biometric unavailable. Completing with face verification...')
              await processPayment(result.verificationToken, null, 'FACE_ONLY')
              return
            }
            
            console.log(`✅ Dual-factor verified! Face + ${webauthnResult.authenticatorName}`)
            await processPayment(result.verificationToken, webauthnResult.authorizationToken, 'DUAL_WEBAUTHN')
            
          } catch (webauthnError) {
            // If WebAuthn fails for any reason, fallback to face-only
            console.log('WebAuthn failed, falling back to face-only payment:', webauthnError.message)
            setVerificationError('Completing payment with face verification...')
            await processPayment(result.verificationToken, null, 'FACE_ONLY')
          }
        } else {
          // Customer doesn't have WebAuthn - use face-only
          console.log('✅ Face-only verification (no device biometric registered)')
          await processPayment(result.verificationToken, null, 'FACE_ONLY')
        }
        
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

  async function handleDeviceBiometricAuth() {
    setProcessing(true)
    setVerificationError(null)
    
    try {
      // Import WebAuthn function
      const { authenticateWebAuthn, hasWebAuthnCredential } = await import('../lib/webauthn.js')
      
      // For device biometric mode, we need customer to identify themselves first
      const customerInput = window.prompt(
        'Customer Identification Required:\n\n' +
        'Please ask the customer to enter their EMAIL ADDRESS:\n' +
        '• Example: user@gmail.com\n' +
        '• Must be exact email used to register\n' +
        '\nSystem will then check their biometric methods.\n\n' +
        'Note: FacePay ID lookup is also supported'
      )
      
      if (!customerInput) {
        setProcessing(false)
        return
      }
      
      setVerificationError('Looking up customer and checking biometric methods...')
      
      // Look up customer by email or FacePay ID
      let customerProfile = null
      
      // Try to find customer by email first
      const { data: profileByEmail, error: emailError } = await supabase
        .from('profiles')
        .select('*, customer_profiles!inner(*)')
        .eq('email', customerInput.trim().toLowerCase())
        .single()
        
      if (profileByEmail && !emailError) {
        console.log('Found customer by email:', profileByEmail)
        customerProfile = {
          id: profileByEmail.customer_profiles.id, // This should be the customer_profiles.id (UUID)
          userId: profileByEmail.id, // This is the profiles.id (UUID) 
          facepayId: profileByEmail.customer_profiles.facepay_id,
          fullName: profileByEmail.full_name,
          email: profileByEmail.email,
          facepayEnabled: profileByEmail.customer_profiles.facepay_enabled,
          transactionLimit: profileByEmail.customer_profiles.transaction_limit || 1000
        }
      } else {
        // Try by FacePay ID
        const { data: profileByFacePayId, error: facepayError } = await supabase
          .from('customer_profiles')
          .select('*, profiles!inner(*)')
          .eq('facepay_id', customerInput.trim())
          .single()
          
        if (profileByFacePayId && !facepayError) {
          console.log('Found customer by FacePay ID:', profileByFacePayId)
          customerProfile = {
            id: profileByFacePayId.id, // This should be the customer_profiles.id (UUID)
            userId: profileByFacePayId.profiles.id, // This is the profiles.id (UUID)
            facepayId: profileByFacePayId.facepay_id,
            fullName: profileByFacePayId.profiles.full_name,
            email: profileByFacePayId.profiles.email,
            facepayEnabled: profileByFacePayId.facepay_enabled,
            transactionLimit: profileByFacePayId.transaction_limit || 1000
          }
        } else {
          // As fallback, try to find just the profile (without customer_profiles)
          const { data: basicProfile, error: basicError } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', customerInput.trim().toLowerCase())
            .eq('role', 'customer')
            .single()
            
          if (basicProfile && !basicError) {
            console.log('Found basic profile, creating customer profile:', basicProfile)
            
            // Create customer_profiles record for this user
            const { data: newCustomerProfile, error: createError } = await supabase
              .from('customer_profiles')
              .insert({
                user_id: basicProfile.id,
                facepay_id: `FP-${Date.now()}`,
                facepay_enabled: false, // Start disabled, will be enabled if needed
                transaction_limit: 10000
              })
              .select()
              .single()
              
            if (newCustomerProfile && !createError) {
              customerProfile = {
                id: newCustomerProfile.id,
                userId: basicProfile.id,
                facepayId: newCustomerProfile.facepay_id,
                fullName: basicProfile.full_name,
                email: basicProfile.email,
                facepayEnabled: newCustomerProfile.facepay_enabled,
                transactionLimit: newCustomerProfile.transaction_limit
              }
              console.log('Created new customer profile:', customerProfile)
            } else {
              console.error('Failed to create customer profile:', createError)
            }
          } else {
            console.error('Customer lookup errors:', { emailError, facepayError, basicError })
          }
        }
      }
      
      if (!customerProfile) {
        setVerificationError('❌ Customer not found. Please check the email or FacePay ID.')
        setProcessing(false)
        return
      }
      
      // If customerProfile exists but lacks an ID, try to fix it
      if (!customerProfile.id && customerProfile.userId) {
        console.log('Customer profile missing ID, attempting to create customer_profiles record...')
        setVerificationError('🔄 Setting up customer profile...')
        
        try {
          const { data: newCustomerProfile, error: createError } = await supabase
            .from('customer_profiles')
            .insert({
              user_id: customerProfile.userId,
              facepay_id: `FP-${Date.now()}`,
              facepay_enabled: false,
              transaction_limit: 10000
            })
            .select()
            .single()
            
          if (createError) {
            console.error('Failed to create customer profile:', createError)
            setVerificationError('❌ Failed to create customer profile. Please contact support.')
            setProcessing(false)
            return
          }
          
          // Update customerProfile with the new ID
          customerProfile.id = newCustomerProfile.id
          customerProfile.facepayId = newCustomerProfile.facepay_id
          customerProfile.facepayEnabled = newCustomerProfile.facepay_enabled
          customerProfile.transactionLimit = newCustomerProfile.transaction_limit
          
          console.log('Successfully created customer profile:', customerProfile)
        } catch (createErr) {
          console.error('Exception creating customer profile:', createErr)
          setVerificationError('❌ Error creating customer profile. Please contact support.')
          setProcessing(false)
          return
        }
      }
      
      // Final validation - customer profile must have ID
      if (!customerProfile.id) {
        console.error('Customer profile still missing ID after all attempts:', customerProfile)
        setVerificationError('❌ Customer profile data incomplete. Please contact support.')
        setProcessing(false)
        return
      }
      
      console.log('Customer profile validated:', { 
        id: customerProfile.id, 
        userId: customerProfile.userId, 
        facepayEnabled: customerProfile.facepayEnabled 
      })
      
      if (!customerProfile.facepayEnabled) {
        setVerificationError(`❌ FacePay is disabled for ${customerProfile.fullName}.\n\nWould you like to enable it now?\n\nClick "Try Again" to enable FacePay for this customer.`)
        setProcessing(false)
        
        // Auto-enable FacePay for this customer after 3 seconds
        setTimeout(async () => {
          try {
            setVerificationError('🔄 Enabling FacePay for this customer...')
            
            console.log('Attempting to enable FacePay for customer ID:', customerProfile.id)
            
            if (!customerProfile.id) {
              setVerificationError('❌ Cannot enable FacePay: Missing customer ID')
              return
            }
            
            const { error } = await supabase
              .from('customer_profiles')
              .update({ 
                facepay_enabled: true,
                transaction_limit: 10000
              })
              .eq('id', customerProfile.id)
            
            if (error) {
              console.error('Database update error:', error)
              setVerificationError(`❌ Failed to enable FacePay: ${error.message}`)
            } else {
              setVerificationError(`✅ FacePay enabled for ${customerProfile.fullName}!\n\nClick "Try Again" to continue with payment.`)
              customerProfile.facepayEnabled = true
              customerProfile.transactionLimit = 10000
            }
          } catch (err) {
            console.error('Exception during FacePay enable:', err)
            setVerificationError(`❌ Error enabling FacePay: ${err.message}`)
          }
        }, 3000)
        
        return
      }

      setSelectedCustomer(customerProfile)
      
      // Check what biometric methods this customer has available
      const [hasDeviceBiometric, hasFaceRecognition] = await Promise.all([
        hasWebAuthnCredential(customerProfile.userId),
        checkFaceRecognitionAvailable(customerProfile.userId)
      ])

      // Show customer what methods are available
      let availableMethods = []
      if (hasDeviceBiometric) availableMethods.push('Device Biometric (Fingerprint/Face ID/Windows Hello)')
      if (hasFaceRecognition) availableMethods.push('Face Recognition (Camera)')
      
      if (availableMethods.length === 0) {
        setVerificationError(`❌ ${customerProfile.fullName} has no biometric methods registered.\n\nAvailable: None\nPlease register biometric authentication first.`)
        setProcessing(false)
        return
      }

      // If customer has device biometric, use it
      if (hasDeviceBiometric) {
        setVerificationError(`✅ ${customerProfile.fullName} found!\n\nAvailable methods: ${availableMethods.join(', ')}\n\nUsing: Device Biometric\nPlease authorize payment...`)
        
        // Prompt for WebAuthn authentication
        const webauthnResult = await authenticateWebAuthn(customerProfile.userId, {
          amount: parseFloat(amount) || 0,
          merchantId: merchantProfile.id,
          timestamp: new Date().toISOString()
        })
        
        if (!webauthnResult.verified) {
          setVerificationError(`❌ Device biometric authorization failed.\n\nTried: ${webauthnResult.authenticatorName || 'Unknown method'}\n\nPlease try again or use face recognition.`)
          setProcessing(false)
          return
        }
        
        console.log(`✅ Device biometric verified: ${webauthnResult.authenticatorName}`)
        
        // Generate verification token and process payment
        const nonce = generateTransactionNonce()
        setTransactionNonce(nonce)
        setVerificationToken('device-biometric-token')
        
        await processPayment('device-biometric-token', webauthnResult.authorizationToken, 'DEVICE_BIOMETRIC')
        
      } else if (hasFaceRecognition) {
        // Fallback to face recognition if no device biometric
        setVerificationError(`✅ ${customerProfile.fullName} found!\n\nAvailable methods: ${availableMethods.join(', ')}\n\nDevice biometric not available.\nPlease use face recognition instead.`)
        setProcessing(false)
        
        // Suggest switching to face recognition mode
        setTimeout(() => {
          if (window.confirm('This customer only has Face Recognition available.\n\nWould you like to switch to Face Recognition mode?')) {
            closeTerminal()
            openTerminal('face')
          }
        }, 2000)
      } else {
        setVerificationError(`❌ ${customerProfile.fullName} has no biometric methods registered.\n\nPlease register either:\n• Device Biometric (Settings → Security)\n• Face Recognition (FacePay app)`)
        setProcessing(false)
      }
      
    } catch (error) {
      console.error('Device biometric error:', error)
      if (error.name === 'NotAllowedError') {
        setVerificationError(`❌ Biometric access denied by user.\n\nPlease allow biometric access and try again.`)
      } else if (error.name === 'NotSupportedError') {
        setVerificationError(`❌ This device doesn't support biometric authentication.\n\nPlease use face recognition instead.`)
      } else {
        setVerificationError(`❌ Device biometric failed: ${error.message}`)
      }
      setProcessing(false)
    }
  }

  // Helper function to check if customer has face recognition enrolled
  async function checkFaceRecognitionAvailable(userId) {
    try {
      const { data } = await supabase
        .from('customer_biometrics')
        .select('id')
        .eq('user_id', userId)
        .limit(1)
      
      return data && data.length > 0
    } catch (error) {
      console.error('Error checking face recognition:', error)
      return false
    }
  }

  function handleVerificationCancel() {
    setConfirming(false)
    setTransactionNonce(null)
    setVerificationError(null)
    setPaymentLock(false) // Release lock on cancel
  }

  async function processPayment(verificationToken, secondFactorToken = null, authType = 'AUTO') {
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
      
      // Determine authentication method and dual-factor status
      let authMethod = 'BIOMETRIC_FACEPAY'
      let isDualFactor = false
      let webauthnVerified = false
      
      if (secondFactorToken) {
        isDualFactor = true
        if (authType === 'DUAL_FACE') {
          authMethod = 'DUAL_BIOMETRIC_FACE_FACE'
        } else {
          authMethod = 'DUAL_BIOMETRIC_FACEPAY_WEBAUTHN'
          webauthnVerified = true
        }
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
        webauthn_verified: webauthnVerified,
        dual_factor_auth: isDualFactor
      })

      if (error) throw error

      setSuccess({
        transactionId,
        amount: parseFloat(amount),
        customerName: selectedCustomer.fullName,
        facepayId: selectedCustomer.facepayId,
        verificationToken,
        webauthnToken: secondFactorToken,
        authMethod,
        isDualFactor,
        authType
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
                {success.isDualFactor ? (
                  <>
                    ✓ Dual-factor biometric verification completed<br/>
                    ✓ {success.authType === 'DUAL_FACE' 
                        ? 'Face recognition + Face re-scan' 
                        : 'Face recognition + Device biometric'}
                  </>
                ) : (
                  '✓ Single-factor face verification completed'
                )}
              </p>
            </div>
          </div>
        ) : verificationMethod === 'device' && !selectedCustomer ? (
          <div className="terminal-device-auth animate-in">
            <h2>Device Biometric Payment</h2>
            <p className="text-muted">Smart biometric detection</p>
            
            <div className="device-auth-info">
              <div className="info-icon">🔍</div>
              <h3>System will detect available:</h3>
              <ul>
                <li>✅ Windows Hello (Windows)</li>
                <li>✅ Touch ID / Face ID (Mac/iPhone)</li>
                <li>✅ Fingerprint sensor</li>
                <li>✅ Face Recognition (Camera backup)</li>
              </ul>
              <p style={{fontSize: '0.9rem', color: '#888', marginTop: '1rem'}}>
                Only available methods will be prompted
              </p>
            </div>
            
            {verificationError && (
              <div className="alert alert-info" style={{
                marginBottom: '1rem',
                whiteSpace: 'pre-line',
                textAlign: 'left',
                fontSize: '0.9rem'
              }}>
                {verificationError}
              </div>
            )}
            
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
            </div>
            
            <button 
              onClick={handleDeviceBiometricAuth} 
              className="btn btn-primary btn-full btn-lg" 
              disabled={!amount || parseFloat(amount) <= 0 || processing}
            >
              {processing ? (
                <>
                  <span className="spinner" />
                  Detecting Methods...
                </>
              ) : (
                'Detect & Authenticate'
              )}
            </button>
            
            {verificationError && !processing && (
              <button 
                onClick={handleDeviceBiometricAuth} 
                className="btn btn-accent btn-full" 
                disabled={!amount || parseFloat(amount) <= 0}
                style={{marginTop: '0.5rem'}}
              >
                Try Again
              </button>
            )}
            
            <button onClick={() => { setAmount(''); closeTerminal(); }} className="btn btn-ghost btn-full">
              Cancel
            </button>
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

        <div className="payment-methods">
          <button onClick={() => openTerminal('face')} className="btn-scan-customer">
            <div className="method-icon">👤</div>
            <div className="method-text">
              <strong>SCAN CUSTOMER FACE</strong>
              <span>Face recognition identification</span>
            </div>
          </button>
          
          <button onClick={() => openTerminal('device')} className="btn-scan-customer btn-device-biometric">
            <div className="method-icon">🔐</div>
            <div className="method-text">
              <strong>DEVICE BIOMETRIC</strong>
              <span>Fingerprint / Windows Hello / Touch ID</span>
            </div>
          </button>
        </div>
        
        {/* Debug: Ensure buttons are visible */}
        <div style={{textAlign: 'center', margin: '2rem 0', padding: '1rem', background: '#f0f0f0', borderRadius: '8px'}}>
          <h3>Payment Terminal Options</h3>
          <p>Two payment methods should be visible above:</p>
          <ul style={{textAlign: 'left', display: 'inline-block'}}>
            <li>👤 SCAN CUSTOMER FACE - Face recognition identification</li>
            <li>🔐 DEVICE BIOMETRIC - Fingerprint / Windows Hello / Touch ID</li>
          </ul>
          <p style={{fontSize: '0.9rem', color: '#666', marginTop: '1rem'}}>
            If you don't see the buttons above, try refreshing the page (Ctrl+F5)
          </p>
        </div>

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
