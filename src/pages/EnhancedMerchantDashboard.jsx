// Enhanced Merchant Dashboard
// Dynamic authentication method selection based on customer preferences
// Multi-platform biometric payment processing with security validation

import React, { useState, useEffect, useRef } from 'react'
import { BiometricCamera } from '../components/BiometricCamera'
import { securitySettingsManager } from '../lib/security-settings-manager'
import { biometricAuthenticator } from '../lib/biometric-authenticator'
import { transactionAuthorizationEngine } from '../lib/transaction-authorization-engine'
import './EnhancedMerchantDashboard.css'

const EnhancedMerchantDashboard = () => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const [merchantId] = useState(`merchant_${Date.now()}`)
  const [currentStep, setCurrentStep] = useState('customer-lookup')
  const [customerEmail, setCustomerEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [currency] = useState('INR')
  
  // Customer and Authentication State
  const [customerData, setCustomerData] = useState(null)
  const [authMethods, setAuthMethods] = useState(null)
  const [availableCapabilities, setAvailableCapabilities] = useState([])
  
  // Payment Processing State
  const [paymentSession, setPaymentSession] = useState(null)
  const [selectedAuthMethod, setSelectedAuthMethod] = useState('')
  const [authenticationInProgress, setAuthenticationInProgress] = useState(false)
  const [authenticationResults, setAuthenticationResults] = useState({})
  
  // UI State
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [processingMessage, setProcessingMessage] = useState('')
  
  // References
  const biometricCameraRef = useRef(null)

  // ============================================================================
  // INITIALIZATION AND CAPABILITIES DETECTION
  // ============================================================================
  useEffect(() => {
    initializeBiometricCapabilities()
  }, [])

  const initializeBiometricCapabilities = async () => {
    try {
      const capabilities = await biometricAuthenticator.getSupportedBiometrics()
      setAvailableCapabilities(capabilities)
      console.log('Available biometric capabilities:', capabilities)
    } catch (error) {
      console.error('Failed to detect biometric capabilities:', error)
      setError('Failed to detect device biometric capabilities')
    }
  }

  // ============================================================================
  // CUSTOMER LOOKUP AND VALIDATION
  // ============================================================================
  const handleCustomerLookup = async () => {
    if (!customerEmail || !amount) {
      setError('Please enter customer email and payment amount')
      return
    }

    if (parseFloat(amount) <= 0) {
      setError('Payment amount must be greater than 0')
      return
    }

    setLoading(true)
    setError('')
    setProcessingMessage('Looking up customer...')

    try {
      // Initiate payment to validate customer and limits
      const paymentRequest = {
        merchantId,
        customerEmail: customerEmail.toLowerCase().trim(),
        amount: parseFloat(amount),
        currency,
        timestamp: new Date()
      }

      const session = await transactionAuthorizationEngine.initiatePayment(paymentRequest)
      setPaymentSession(session)

      // Get customer authentication methods
      const customerProfile = await getCustomerProfile(customerEmail)
      if (!customerProfile) {
        throw new Error('Customer not found or not registered for FacePay')
      }

      const methods = await securitySettingsManager.getAuthMethods(customerProfile.id)
      setAuthMethods(methods)
      setCustomerData(customerProfile)

      setCurrentStep('auth-method-selection')
      setSuccess('Customer verified successfully')
      setProcessingMessage('')
    } catch (error) {
      console.error('Customer lookup failed:', error)
      setError(error.message || 'Failed to verify customer or validate payment amount')
      setProcessingMessage('')
    } finally {
      setLoading(false)
    }
  }

  const getCustomerProfile = async (email) => {
    // This would typically query your customer database
    // For now, we'll simulate a customer lookup
    try {
      const response = await fetch(`/api/customers/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      if (response.ok) {
        return await response.json()
      }
      
      // Fallback: create a mock customer for demo
      return {
        id: `customer_${Date.now()}`,
        email,
        name: email.split('@')[0],
        facepayEnabled: true
      }
    } catch (error) {
      console.error('Customer profile lookup failed:', error)
      return null
    }
  }

  // ============================================================================
  // DYNAMIC AUTHENTICATION METHOD SELECTION
  // ============================================================================
  const getAvailableAuthMethods = () => {
    if (!authMethods) return []

    const methods = []

    // Face Payment - if enabled and face recognition is available
    if (authMethods.facePaymentEnabled && availableCapabilities.includes('face-recognition')) {
      methods.push({
        id: 'face',
        name: 'Face Payment',
        description: 'Verify your identity using face recognition',
        icon: '👤',
        available: true,
        capability: 'face-recognition'
      })
    }

    // Device Biometric - if enabled and WebAuthn is available
    if (authMethods.biometricPaymentEnabled && availableCapabilities.includes('webauthn-platform')) {
      let biometricName = 'Device Biometric'
      let biometricIcon = '🔐'
      
      if (availableCapabilities.includes('windows-hello')) {
        biometricName = 'Windows Hello'
        biometricIcon = '🪟'
      } else if (availableCapabilities.includes('touch-id')) {
        biometricName = 'Touch ID'
        biometricIcon = '👆'
      } else if (availableCapabilities.includes('face-id')) {
        biometricName = 'Face ID'
        biometricIcon = '📱'
      }

      methods.push({
        id: 'device-biometric',
        name: biometricName,
        description: 'Use your device\'s built-in biometric authentication',
        icon: biometricIcon,
        available: true,
        capability: 'webauthn-platform'
      })
    }

    return methods
  }

  const handleAuthMethodSelection = async (methodId) => {
    setSelectedAuthMethod(methodId)
    setError('')
    setSuccess('')
    
    if (methodId === 'face') {
      setCurrentStep('face-authentication')
    } else if (methodId === 'device-biometric') {
      await initiateDeviceBiometricAuth()
    }
  }

  // ============================================================================
  // FACE AUTHENTICATION
  // ============================================================================
  const handleFaceAuthResult = async (result) => {
    setAuthenticationInProgress(true)
    setProcessingMessage('Processing face authentication...')

    try {
      if (!result.success || !result.verified) {
        throw new Error(result.errorMessage || 'Face verification failed')
      }

      setAuthenticationResults(prev => ({
        ...prev,
        faceVerified: true,
        faceSimilarity: result.similarity,
        faceEmbeddingId: result.embeddingId
      }))

      // Check if dual factor is required
      if (authMethods.requireDualFactor) {
        setProcessingMessage('Face verified. Second factor required...')
        // Show device biometric as second factor
        await initiateDeviceBiometricAuth()
      } else {
        // Single factor sufficient, proceed to authorization
        await processPaymentAuthorization({
          faceVerified: true,
          faceSimilarity: result.similarity,
          challenge: paymentSession.challenge
        })
      }
    } catch (error) {
      console.error('Face authentication failed:', error)
      setError(error.message || 'Face authentication failed')
      setProcessingMessage('')
    } finally {
      setAuthenticationInProgress(false)
    }
  }

  // ============================================================================
  // DEVICE BIOMETRIC AUTHENTICATION
  // ============================================================================
  const initiateDeviceBiometricAuth = async () => {
    setAuthenticationInProgress(true)
    setProcessingMessage('Initiating device biometric authentication...')

    try {
      if (!await biometricAuthenticator.isDeviceBiometricAvailable()) {
        throw new Error('Device biometric authentication not available')
      }

      const challenge = {
        challenge: paymentSession.challenge,
        amount: paymentSession.amount,
        merchantId: paymentSession.merchantId,
        timestamp: new Date().toISOString()
      }

      const authResult = await biometricAuthenticator.authenticateWebAuthn(
        customerData.id,
        challenge
      )

      if (!authResult.verified) {
        throw new Error(authResult.errorMessage || 'Device biometric authentication failed')
      }

      setAuthenticationResults(prev => ({
        ...prev,
        deviceBiometricVerified: true,
        webauthnSignature: authResult.signature,
        webauthnCredentialId: authResult.credentialId,
        authenticatorName: authResult.authenticatorName
      }))

      // Check if we have all required factors
      const hasFaceAuth = authenticationResults.faceVerified
      const hasDeviceBiometric = true
      
      if (authMethods.requireDualFactor && !hasFaceAuth) {
        setProcessingMessage('Device biometric verified. Face verification required...')
        setCurrentStep('face-authentication')
      } else {
        // Proceed to payment authorization
        await processPaymentAuthorization({
          ...authenticationResults,
          deviceBiometricVerified: true,
          webauthnSignature: authResult.signature,
          webauthnCredentialId: authResult.credentialId,
          challenge: paymentSession.challenge
        })
      }
    } catch (error) {
      console.error('Device biometric authentication failed:', error)
      setError(error.message || 'Device biometric authentication failed')
      setProcessingMessage('')
    } finally {
      setAuthenticationInProgress(false)
    }
  }

  // ============================================================================
  // PAYMENT AUTHORIZATION
  // ============================================================================
  const processPaymentAuthorization = async (authFactors) => {
    setProcessingMessage('Authorizing payment...')

    try {
      const authorizationResult = await transactionAuthorizationEngine.authorizePayment(
        paymentSession,
        authFactors
      )

      if (!authorizationResult.success) {
        throw new Error(authorizationResult.errorMessage || 'Payment authorization failed')
      }

      // Payment authorized successfully
      setCurrentStep('payment-success')
      setSuccess(`Payment authorized successfully! Transaction ID: ${authorizationResult.transactionId}`)
      setProcessingMessage('')

      // Log the successful transaction
      console.log('Payment authorized:', {
        transactionId: authorizationResult.transactionId,
        amount: paymentSession.amount,
        customer: customerData.email,
        authMethod: authorizationResult.authMethod,
        isDualFactor: authorizationResult.isDualFactor
      })

    } catch (error) {
      console.error('Payment authorization failed:', error)
      setError(error.message || 'Payment authorization failed')
      setCurrentStep('auth-method-selection')
      setProcessingMessage('')
    }
  }

  // ============================================================================
  // UI HELPER FUNCTIONS
  // ============================================================================
  const resetTransaction = () => {
    setCurrentStep('customer-lookup')
    setCustomerEmail('')
    setAmount('')
    setCustomerData(null)
    setAuthMethods(null)
    setPaymentSession(null)
    setSelectedAuthMethod('')
    setAuthenticationResults({})
    setError('')
    setSuccess('')
    setProcessingMessage('')
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount)
  }

  // ============================================================================
  // RENDER METHODS
  // ============================================================================
  const renderCustomerLookup = () => (
    <div className="lookup-container">
      <h2>💳 Enhanced FacePay Terminal</h2>
      
      <div className="form-group">
        <label htmlFor="customerEmail">Customer Email</label>
        <input
          type="email"
          id="customerEmail"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          placeholder="customer@example.com"
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="amount">Payment Amount (₹)</label>
        <input
          type="number"
          id="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          disabled={loading}
        />
      </div>

      <button
        onClick={handleCustomerLookup}
        disabled={loading}
        className="primary-button"
      >
        {loading ? 'Looking up...' : 'Lookup Customer & Validate Payment'}
      </button>

      <div className="capabilities-info">
        <h4>Available Authentication Methods:</h4>
        <div className="capabilities-list">
          {availableCapabilities.map(capability => (
            <span key={capability} className="capability-badge">
              {capability.replace('-', ' ')}
            </span>
          ))}
        </div>
      </div>
    </div>
  )

  const renderAuthMethodSelection = () => {
    const availableMethods = getAvailableAuthMethods()

    return (
      <div className="auth-selection-container">
        <div className="customer-info">
          <h3>Customer: {customerData?.name || customerData?.email}</h3>
          <p>Payment Amount: {formatCurrency(paymentSession?.amount)}</p>
          {authMethods?.requireDualFactor && (
            <p className="dual-factor-notice">⚠️ Dual-factor authentication required</p>
          )}
        </div>

        <h3>Select Authentication Method</h3>
        
        {availableMethods.length === 0 ? (
          <div className="no-methods">
            <p>❌ No authentication methods available for this customer.</p>
            <p>The customer may need to configure their payment preferences.</p>
          </div>
        ) : (
          <div className="auth-methods-grid">
            {availableMethods.map(method => (
              <button
                key={method.id}
                onClick={() => handleAuthMethodSelection(method.id)}
                className="auth-method-button"
                disabled={authenticationInProgress}
              >
                <div className="method-icon">{method.icon}</div>
                <div className="method-info">
                  <h4>{method.name}</h4>
                  <p>{method.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <button onClick={resetTransaction} className="secondary-button">
          Start New Transaction
        </button>
      </div>
    )
  }

  const renderFaceAuthentication = () => (
    <div className="face-auth-container">
      <h3>👤 Face Authentication</h3>
      <p>Please position your face in the camera view for verification</p>
      
      <BiometricCamera
        ref={biometricCameraRef}
        onAuthResult={handleFaceAuthResult}
        customerId={customerData?.id}
        disabled={authenticationInProgress}
      />

      <div className="auth-controls">
        <button 
          onClick={() => setCurrentStep('auth-method-selection')}
          className="secondary-button"
          disabled={authenticationInProgress}
        >
          Back to Auth Methods
        </button>
      </div>
    </div>
  )

  const renderPaymentSuccess = () => (
    <div className="success-container">
      <div className="success-icon">✅</div>
      <h2>Payment Authorized Successfully!</h2>
      
      <div className="transaction-details">
        <h4>Transaction Details:</h4>
        <p><strong>Customer:</strong> {customerData?.email}</p>
        <p><strong>Amount:</strong> {formatCurrency(paymentSession?.amount)}</p>
        <p><strong>Merchant:</strong> {merchantId}</p>
        <p><strong>Date:</strong> {new Date().toLocaleString()}</p>
      </div>

      <button onClick={resetTransaction} className="primary-button">
        Process New Payment
      </button>
    </div>
  )

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <div className="enhanced-merchant-dashboard">
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <h1>🚀 Enhanced FacePay Merchant Terminal</h1>
          <p>Multi-platform biometric payment processing</p>
        </header>

        {/* Processing Message */}
        {processingMessage && (
          <div className="processing-message">
            <div className="spinner"></div>
            {processingMessage}
          </div>
        )}

        {/* Error Messages */}
        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        {/* Success Messages */}
        {success && (
          <div className="success-message">
            ✅ {success}
          </div>
        )}

        {/* Main Content */}
        <main className="dashboard-content">
          {currentStep === 'customer-lookup' && renderCustomerLookup()}
          {currentStep === 'auth-method-selection' && renderAuthMethodSelection()}
          {currentStep === 'face-authentication' && renderFaceAuthentication()}
          {currentStep === 'payment-success' && renderPaymentSuccess()}
        </main>

        {/* Footer */}
        <footer className="dashboard-footer">
          <p>Powered by Enhanced FacePay System</p>
          <p>Secure • Multi-platform • Biometric</p>
        </footer>
      </div>
    </div>
  )
}

export default EnhancedMerchantDashboard