// Integration tests for Enhanced FacePay System
// Tests end-to-end payment flows with multi-factor authentication

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CustomerSecuritySettingsManager } from '../security-settings-manager'
import { MultiBiometricAuthenticator } from '../biometric-authenticator'
import { PaymentAuthorizationEngine } from '../transaction-authorization-engine'

// Mock all external dependencies
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: mockData.customerProfile, error: null })),
          limit: vi.fn(() => Promise.resolve({ data: [mockData.customerCredential], error: null }))
        }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: mockData.paymentSession, error: null }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }))
    })),
    rpc: vi.fn(() => Promise.resolve({ 
      data: mockData.validationResult, 
      error: null 
    }))
  }
}))

// Mock fetch for face recognition API
global.fetch = vi.fn()

// Mock WebAuthn
global.navigator = {
  credentials: {
    create: vi.fn(),
    get: vi.fn()
  },
  mediaDevices: {
    enumerateDevices: vi.fn(() => Promise.resolve([
      { kind: 'videoinput', deviceId: 'camera1' }
    ]))
  }
}

global.PublicKeyCredential = {
  isUserVerifyingPlatformAuthenticatorAvailable: vi.fn(() => Promise.resolve(true))
}

// Mock Canvas API
global.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  putImageData: vi.fn()
}))
global.HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,test-image')

const mockData = {
  customerProfile: {
    id: 'customer-123',
    user_id: 'user-456',
    email: 'test@example.com',
    full_name: 'Test Customer',
    facepay_enabled: true,
    customer_profiles: {
      id: 'customer-123',
      facepay_id: 'FP-12345',
      facepay_enabled: true
    },
    profiles: {
      full_name: 'Test Customer',
      email: 'test@example.com'
    }
  },
  
  securitySettings: {
    id: 'settings-123',
    customer_profile_id: 'customer-123',
    max_transaction_amount: 5000,
    daily_transaction_limit: 20000,
    face_payment_enabled: true,
    biometric_payment_enabled: true,
    require_dual_factor: false,
    liveness_detection_enabled: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },

  customerCredential: {
    id: 'cred-123',
    user_id: 'user-456',
    credential_id: 'webauthn-cred-123',
    counter: 5,
    is_active: true,
    friendly_name: 'Windows Hello',
    transports: ['internal']
  },

  paymentSession: {
    id: 'session-123',
    session_id: 'sess-456',
    merchant_id: 'merchant-789',
    customer_email: 'test@example.com',
    amount: 1000,
    currency: 'INR',
    challenge: 'secure-challenge-123',
    nonce: 'secure-nonce-456',
    status: 'INITIATED',
    expires_at: new Date(Date.now() + 900000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },

  validationResult: [
    {
      valid: true,
      reason: 'Transaction within limits',
      max_transaction_amount: 5000,
      daily_transaction_limit: 20000,
      current_daily_spending: 500,
      transactions_today: 2
    }
  ]
}

describe('Enhanced FacePay Integration Tests', () => {
  let securityManager
  let biometricAuth
  let paymentEngine

  beforeEach(() => {
    securityManager = new CustomerSecuritySettingsManager()
    biometricAuth = new MultiBiometricAuthenticator()
    paymentEngine = new PaymentAuthorizationEngine()
    vi.clearAllMocks()
  })

  describe('Complete Payment Flow - Face Only', () => {
    
    it('should complete face-only payment flow successfully', async () => {
      // Step 1: Check customer security settings
      const authMethods = await securityManager.getAuthMethods('customer-123')
      expect(authMethods.facePaymentEnabled).toBe(true)

      // Step 2: Validate transaction limits
      const limitValidation = await securityManager.validateTransactionAmount('customer-123', 1000)
      expect(limitValidation.valid).toBe(true)

      // Step 3: Create payment session
      const paymentRequest = {
        merchantId: 'merchant-789',
        customerEmail: 'test@example.com',
        amount: 1000,
        currency: 'INR',
        timestamp: new Date()
      }

      const session = await paymentEngine.initiatePayment(paymentRequest)
      expect(session.sessionId).toBeTruthy()
      expect(session.challenge).toBeTruthy()

      // Step 4: Face authentication
      const mockImageData = new ImageData(640, 480)
      
      // Mock successful face verification
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          verified: true,
          similarity: 0.85,
          verification_token: 'face-token-123'
        })
      })

      const faceResult = await biometricAuth.verifyFace(mockImageData, 'user-456', 0.75)
      expect(faceResult.success).toBe(true)
      expect(faceResult.verified).toBe(true)

      // Step 5: Authorize payment
      const authFactors = {
        faceVerified: true,
        faceSimilarity: faceResult.similarity,
        challenge: session.challenge
      }

      const authResult = await paymentEngine.authorizePayment(session, authFactors)
      expect(authResult.success).toBe(true)
      expect(authResult.transactionId).toBeTruthy()
      expect(authResult.isDualFactor).toBe(false)
    })
  })

  describe('Complete Payment Flow - Dual Factor', () => {
    
    it('should complete dual-factor payment flow successfully', async () => {
      // Mock dual-factor settings
      const dualFactorSettings = {
        ...mockData.securitySettings,
        require_dual_factor: true
      }

      vi.mocked(securityManager.supabase?.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: dualFactorSettings, error: null }))
          }))
        }))
      })

      // Step 1: Create payment session
      const paymentRequest = {
        merchantId: 'merchant-789',
        customerEmail: 'test@example.com',
        amount: 2000,
        currency: 'INR',
        timestamp: new Date()
      }

      const session = await paymentEngine.initiatePayment(paymentRequest)
      expect(session.sessionId).toBeTruthy()

      // Step 2: Face authentication
      const mockImageData = new ImageData(640, 480)
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          verified: true,
          similarity: 0.88,
          verification_token: 'face-token-456'
        })
      })

      const faceResult = await biometricAuth.verifyFace(mockImageData, 'user-456', 0.75)
      expect(faceResult.verified).toBe(true)

      // Step 3: Device biometric authentication
      const mockAssertion = {
        rawId: new TextEncoder().encode('webauthn-cred-123'),
        response: {
          authenticatorData: new ArrayBuffer(37),
          signature: new ArrayBuffer(64)
        }
      }

      // Set counter in authenticator data
      const view = new DataView(mockAssertion.response.authenticatorData)
      view.setUint32(33, 6, false) // Counter higher than stored (5)

      global.navigator.credentials.get.mockResolvedValueOnce(mockAssertion)

      const webauthnResult = await biometricAuth.authenticateWebAuthn('user-456', {
        challenge: session.challenge,
        amount: 2000,
        merchantId: 'merchant-789'
      })

      expect(webauthnResult.verified).toBe(true)

      // Step 4: Authorize dual-factor payment
      const authFactors = {
        faceVerified: true,
        faceSimilarity: faceResult.similarity,
        deviceBiometricVerified: true,
        webauthnSignature: webauthnResult.signature,
        webauthnCredentialId: 'webauthn-cred-123',
        challenge: session.challenge
      }

      const authResult = await paymentEngine.authorizePayment(session, authFactors)
      expect(authResult.success).toBe(true)
      expect(authResult.isDualFactor).toBe(true)
      expect(authResult.authMethod).toContain('DUAL')
    })
  })

  describe('Error Scenarios', () => {
    
    it('should reject payment when transaction limit exceeded', async () => {
      // Mock limit exceeded validation
      vi.mocked(securityManager.supabase?.rpc).mockResolvedValueOnce({
        data: [{
          valid: false,
          reason: 'Transaction amount exceeds maximum limit of ₹5000',
          max_transaction_amount: 5000,
          daily_transaction_limit: 20000,
          current_daily_spending: 0,
          transactions_today: 0
        }],
        error: null
      })

      const limitValidation = await securityManager.validateTransactionAmount('customer-123', 10000)
      expect(limitValidation.valid).toBe(false)
      expect(limitValidation.reason).toContain('limit')
    })

    it('should reject payment when face similarity below threshold', async () => {
      // Mock low similarity face verification
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          verified: false,
          similarity: 0.65, // Below 0.75 threshold
          error: 'Similarity below threshold'
        })
      })

      const mockImageData = new ImageData(640, 480)
      const faceResult = await biometricAuth.verifyFace(mockImageData, 'user-456', 0.75)
      
      expect(faceResult.success).toBe(true)
      expect(faceResult.verified).toBe(false)
      expect(faceResult.similarity).toBe(0.65)
    })

    it('should detect and prevent replay attacks', async () => {
      // Mock WebAuthn with same counter (replay attack)
      const mockAssertion = {
        rawId: new TextEncoder().encode('webauthn-cred-123'),
        response: {
          authenticatorData: new ArrayBuffer(37),
          signature: new ArrayBuffer(64)
        }
      }

      // Set counter to same value as stored (5) - replay attack
      const view = new DataView(mockAssertion.response.authenticatorData)
      view.setUint32(33, 5, false)

      global.navigator.credentials.get.mockResolvedValueOnce(mockAssertion)

      const webauthnResult = await biometricAuth.authenticateWebAuthn('user-456', {
        challenge: 'test-challenge'
      })

      expect(webauthnResult.verified).toBe(false)
      expect(webauthnResult.errorMessage).toContain('replay')
    })

    it('should handle authentication method not available', async () => {
      // Mock no WebAuthn support
      delete global.navigator.credentials
      
      const webauthnResult = await biometricAuth.authenticateWebAuthn('user-456', {
        challenge: 'test-challenge'
      })

      expect(webauthnResult.verified).toBe(false)
      expect(webauthnResult.errorMessage).toContain('not supported')
    })
  })

  describe('Security Settings Integration', () => {
    
    it('should enforce at least one authentication method enabled', async () => {
      // Mock settings with only face payment enabled
      const singleMethodSettings = {
        ...mockData.securitySettings,
        face_payment_enabled: true,
        biometric_payment_enabled: false
      }

      vi.mocked(securityManager.supabase?.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: singleMethodSettings, error: null }))
          }))
        }))
      })

      vi.mocked(securityManager.supabase?.rpc).mockResolvedValueOnce({
        data: [{
          face_payment_enabled: true,
          biometric_payment_enabled: false,
          has_webauthn_credentials: false,
          require_dual_factor: false,
          webauthn_credential_count: 0
        }],
        error: null
      })

      // Should throw error when trying to disable the only enabled method
      await expect(securityManager.disableFacePayment('customer-123'))
        .rejects.toThrow('at least one authentication method must remain enabled')
    })

    it('should update security settings successfully', async () => {
      const updateResult = await securityManager.updateTransactionLimit('customer-123', 7500)
      expect(updateResult).toBe(true)

      const dailyResult = await securityManager.updateDailyLimit('customer-123', 30000)
      expect(dailyResult).toBe(true)

      const enableResult = await securityManager.enableBiometricPayment('customer-123')
      expect(enableResult).toBe(true)
    })
  })

  describe('Platform Compatibility', () => {
    
    it('should detect available biometric capabilities', async () => {
      const capabilities = await biometricAuth.getSupportedBiometrics()
      expect(capabilities).toContain('face-recognition')
      
      const cameraAvailable = await biometricAuth.isFaceCameraAvailable()
      expect(cameraAvailable).toBe(true)
      
      const deviceBiometricAvailable = await biometricAuth.isDeviceBiometricAvailable()
      expect(deviceBiometricAvailable).toBe(true)
    })

    it('should handle platform-specific authenticator names', async () => {
      // Test Windows Hello detection
      Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        configurable: true
      })

      const capabilities = await biometricAuth.getSupportedBiometrics()
      expect(capabilities).toContain('windows-hello')
    })
  })
})