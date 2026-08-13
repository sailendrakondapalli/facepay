// TransactionAuthorizationEngine
// Multi-factor payment authorization and orchestration system for enhanced FacePay
// Handles secure challenge generation, replay prevention, and comprehensive payment authorization

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  TransactionAuthorizationEngine as ITransactionAuthorizationEngine,
  PaymentRequest,
  PaymentSession,
  ValidationResult,
  AuthenticationFactors,
  AuthorizationResult,
  TransactionAuthorization,
  SecurityValidationError,
  BiometricAuthError
} from '../types/enhanced-types'
import { CustomerSecuritySettingsManager } from './security-settings-manager'
import { EnhancedBiometricAuthenticator } from './biometric-authenticator'

export class TransactionAuthorizationEngine implements ITransactionAuthorizationEngine {
  private supabase: SupabaseClient
  private securityManager: CustomerSecuritySettingsManager
  private biometricAuth: EnhancedBiometricAuthenticator
  private challengeExpiration = 5 * 60 * 1000 // 5 minutes
  private replayPrevention = new Map<string, number>() // In production, use Redis

  constructor(
    supabaseUrl?: string, 
    supabaseKey?: string,
    securityManager?: CustomerSecuritySettingsManager,
    biometricAuth?: EnhancedBiometricAuthenticator
  ) {
    this.supabase = createClient(
      supabaseUrl || process.env.VITE_SUPABASE_URL || '',
      supabaseKey || process.env.VITE_SUPABASE_ANON_KEY || ''
    )
    this.securityManager = securityManager || new CustomerSecuritySettingsManager()
    this.biometricAuth = biometricAuth || new EnhancedBiometricAuthenticator()
  }

  // ============================================================================
  // PAYMENT INITIATION
  // ============================================================================

  async initiatePayment(request: PaymentRequest): Promise<PaymentSession> {
    try {
      // Validate payment request
      await this.validatePaymentRequest(request)

      // Get customer profile by email
      const customerProfile = await this.getCustomerByEmail(request.customerEmail)
      if (!customerProfile) {
        throw new SecurityValidationError(
          'Customer not found or not registered for FacePay',
          'CUSTOMER_NOT_FOUND',
          { email: request.customerEmail }
        )
      }

      // Validate customer transaction limits
      const limitValidation = await this.validateCustomerLimits(customerProfile.id, request.amount)
      if (!limitValidation.valid) {
        throw new SecurityValidationError(
          limitValidation.reason || 'Transaction exceeds customer limits',
          'TRANSACTION_LIMIT_EXCEEDED',
          limitValidation
        )
      }

      // Generate secure session
      const sessionId = this.generateSessionId()
      const challenge = await this.generateSecureChallenge()
      const nonce = this.generateNonce()

      const paymentSession: PaymentSession = {
        id: sessionId,
        sessionId,
        merchantId: request.merchantId,
        customerEmail: request.customerEmail,
        amount: request.amount,
        currency: request.currency || 'INR',
        challenge,
        nonce,
        status: 'INITIATED',
        expiresAt: new Date(Date.now() + this.challengeExpiration),
        createdAt: new Date(),
        updatedAt: new Date()
      }

      // Store payment session
      const { error: sessionError } = await this.supabase
        .from('payment_sessions')
        .insert([{
          id: paymentSession.id,
          sessionId: paymentSession.sessionId,
          merchantId: paymentSession.merchantId,
          customerEmail: paymentSession.customerEmail,
          amount: paymentSession.amount,
          currency: paymentSession.currency,
          challenge: paymentSession.challenge,
          nonce: paymentSession.nonce,
          status: paymentSession.status,
          expiresAt: paymentSession.expiresAt.toISOString(),
          createdAt: paymentSession.createdAt.toISOString(),
          updatedAt: paymentSession.updatedAt.toISOString()
        }])

      if (sessionError) {
        throw new SecurityValidationError(
          'Failed to create payment session',
          'SESSION_CREATION_FAILED',
          { error: sessionError.message }
        )
      }

      return paymentSession
    } catch (error) {
      console.error('Payment initiation failed:', error)
      throw error
    }
  }

  // ============================================================================
  // CUSTOMER LIMIT VALIDATION
  // ============================================================================

  async validateCustomerLimits(customerId: string, amount: number): Promise<ValidationResult> {
    try {
      return await this.securityManager.validateTransactionAmount(customerId, amount)
    } catch (error) {
      console.error('Limit validation failed:', error)
      return {
        valid: false,
        reason: 'Unable to validate transaction limits - please try again'
      }
    }
  }

  // ============================================================================
  // PAYMENT AUTHORIZATION
  // ============================================================================

  async authorizePayment(session: PaymentSession, authFactors: AuthenticationFactors): Promise<AuthorizationResult> {
    try {
      // Validate session
      const validSession = await this.validatePaymentSession(session)
      if (!validSession) {
        throw new SecurityValidationError(
          'Invalid or expired payment session',
          'INVALID_SESSION'
        )
      }

      // Validate challenge
      if (authFactors.challenge !== session.challenge) {
        throw new SecurityValidationError(
          'Invalid authentication challenge',
          'INVALID_CHALLENGE'
        )
      }

      // Get customer profile
      const customerProfile = await this.getCustomerByEmail(session.customerEmail)
      if (!customerProfile) {
        throw new SecurityValidationError(
          'Customer profile not found',
          'CUSTOMER_NOT_FOUND'
        )
      }

      // Get customer authentication settings
      const authMethods = await this.securityManager.getAuthMethods(customerProfile.id)

      // Validate authentication factors
      const authValidation = await this.validateAuthenticationFactors(
        customerProfile.id,
        authFactors,
        authMethods
      )

      if (!authValidation.success) {
        return {
          success: false,
          errorMessage: authValidation.errorMessage || 'Authentication failed',
          riskScore: authValidation.riskScore || 1.0
        }
      }

      // Final transaction limit check (double-check)
      const limitValidation = await this.validateCustomerLimits(customerProfile.id, session.amount)
      if (!limitValidation.valid) {
        return {
          success: false,
          errorMessage: limitValidation.reason || 'Transaction exceeds limits',
          riskScore: 0.8
        }
      }

      // Prevent replay attacks
      const replayCheck = await this.preventReplayAttacks(session.sessionId)
      if (!replayCheck) {
        return {
          success: false,
          errorMessage: 'Transaction already processed',
          riskScore: 1.0
        }
      }

      // Create transaction authorization record
      const transactionId = this.generateTransactionId()
      const authorizationRecord = await this.createTransactionAuthorization(
        transactionId,
        session,
        customerProfile.id,
        authFactors,
        authValidation
      )

      // Update payment session
      await this.updatePaymentSession(session.sessionId, 'AUTHORIZED')

      return {
        success: true,
        transactionId,
        authMethod: this.determineAuthMethod(authFactors),
        isDualFactor: authValidation.isDualFactor,
        authType: authValidation.authType,
        riskScore: authValidation.riskScore
      }

    } catch (error) {
      console.error('Payment authorization failed:', error)
      
      if (error instanceof SecurityValidationError || error instanceof BiometricAuthError) {
        return {
          success: false,
          errorMessage: error.message,
          riskScore: 1.0
        }
      }

      return {
        success: false,
        errorMessage: 'Payment authorization failed - please try again',
        riskScore: 0.9
      }
    }
  }

  // ============================================================================
  // SECURITY UTILITIES
  // ============================================================================

  async generateSecureChallenge(): Promise<string> {
    // Generate cryptographically secure challenge
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2)
    
    return btoa(`${this.arrayBufferToHex(array.buffer)}-${timestamp}-${random}`)
  }

  async preventReplayAttacks(transactionId: string): Promise<boolean> {
    try {
      // Check if transaction was already processed
      if (this.replayPrevention.has(transactionId)) {
        return false
      }

      // Check database for existing authorization
      const { data, error } = await this.supabase
        .from('transaction_authorizations')
        .select('id')
        .eq('transactionId', transactionId)
        .limit(1)

      if (error) {
        console.error('Replay check failed:', error)
        return false
      }

      if (data && data.length > 0) {
        return false // Transaction already exists
      }

      // Mark transaction as processed
      this.replayPrevention.set(transactionId, Date.now())

      // Clean up old entries (in production, use Redis with TTL)
      this.cleanupReplayPrevention()

      return true
    } catch (error) {
      console.error('Replay prevention failed:', error)
      return false
    }
  }

  async getPaymentSession(sessionId: string): Promise<PaymentSession | null> {
    try {
      const { data, error } = await this.supabase
        .from('payment_sessions')
        .select('*')
        .eq('sessionId', sessionId)
        .single()

      if (error || !data) {
        return null
      }

      return {
        id: data.id,
        sessionId: data.sessionId,
        merchantId: data.merchantId,
        customerEmail: data.customerEmail,
        amount: data.amount,
        currency: data.currency,
        challenge: data.challenge,
        nonce: data.nonce,
        status: data.status,
        expiresAt: new Date(data.expiresAt),
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt)
      }
    } catch (error) {
      console.error('Failed to retrieve payment session:', error)
      return null
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async validatePaymentRequest(request: PaymentRequest): Promise<void> {
    if (!request.merchantId || !request.customerEmail || !request.amount) {
      throw new SecurityValidationError(
        'Missing required payment request fields',
        'INVALID_REQUEST'
      )
    }

    if (request.amount <= 0) {
      throw new SecurityValidationError(
        'Payment amount must be positive',
        'INVALID_AMOUNT'
      )
    }

    if (request.amount > 100000) { // ₹1 lakh max
      throw new SecurityValidationError(
        'Payment amount exceeds maximum allowed',
        'EXCESSIVE_AMOUNT'
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(request.customerEmail)) {
      throw new SecurityValidationError(
        'Invalid customer email format',
        'INVALID_EMAIL'
      )
    }
  }

  private async getCustomerByEmail(email: string): Promise<{ id: string; userId: string } | null> {
    try {
      const { data, error } = await this.supabase
        .from('customer_profiles')
        .select('id, userId')
        .eq('email', email)
        .eq('facepayEnabled', true)
        .single()

      if (error || !data) {
        return null
      }

      return {
        id: data.id,
        userId: data.userId
      }
    } catch (error) {
      console.error('Customer lookup failed:', error)
      return null
    }
  }

  private async validatePaymentSession(session: PaymentSession): Promise<boolean> {
    // Check expiration
    if (new Date() > session.expiresAt) {
      return false
    }

    // Check session status
    if (session.status === 'COMPLETED' || session.status === 'FAILED' || session.status === 'EXPIRED') {
      return false
    }

    return true
  }

  private async validateAuthenticationFactors(
    customerId: string,
    authFactors: AuthenticationFactors,
    authMethods: any
  ): Promise<{
    success: boolean
    errorMessage?: string
    riskScore?: number
    isDualFactor?: boolean
    authType?: string
  }> {
    let riskScore = 0.3 // Base risk score
    let authCount = 0
    let authMethods_used: string[] = []

    // Validate face authentication if provided
    if (authFactors.faceVerified && authFactors.faceSimilarity !== undefined) {
      if (!authMethods.facePaymentEnabled) {
        return {
          success: false,
          errorMessage: 'Face payment not enabled for this customer',
          riskScore: 1.0
        }
      }

      if (authFactors.faceSimilarity < 0.5) {
        return {
          success: false,
          errorMessage: 'Face verification failed - similarity too low',
          riskScore: 0.9
        }
      }

      authCount++
      authMethods_used.push('face')
      riskScore -= 0.2 // Lower risk with face auth
    }

    // Validate device biometric authentication if provided  
    if (authFactors.deviceBiometricVerified) {
      if (!authMethods.biometricPaymentEnabled) {
        return {
          success: false,
          errorMessage: 'Biometric payment not enabled for this customer',
          riskScore: 1.0
        }
      }

      if (!authFactors.webauthnSignature || !authFactors.webauthnCredentialId) {
        return {
          success: false,
          errorMessage: 'Invalid biometric authentication data',
          riskScore: 0.8
        }
      }

      authCount++
      authMethods_used.push('device_biometric')
      riskScore -= 0.25 // Lower risk with device biometric
    }

    // Check if at least one authentication method was used
    if (authCount === 0) {
      return {
        success: false,
        errorMessage: 'No valid authentication factors provided',
        riskScore: 1.0
      }
    }

    // Check dual factor requirement
    const isDualFactor = authCount >= 2
    if (authMethods.requireDualFactor && !isDualFactor) {
      return {
        success: false,
        errorMessage: 'Dual factor authentication required',
        riskScore: 0.8
      }
    }

    return {
      success: true,
      riskScore: Math.max(0.1, riskScore), // Minimum risk score
      isDualFactor,
      authType: authMethods_used.join('_')
    }
  }

  private async createTransactionAuthorization(
    transactionId: string,
    session: PaymentSession,
    customerId: string,
    authFactors: AuthenticationFactors,
    authValidation: any
  ): Promise<TransactionAuthorization> {
    const authorization: TransactionAuthorization = {
      id: this.generateAuthorizationId(),
      transactionId,
      customerProfileId: customerId,
      merchantId: session.merchantId,
      faceVerified: authFactors.faceVerified || false,
      faceSimilarity: authFactors.faceSimilarity,
      deviceBiometricVerified: authFactors.deviceBiometricVerified || false,
      webauthnCredentialId: authFactors.webauthnCredentialId,
      webauthnSignature: authFactors.webauthnSignature,
      challenge: authFactors.challenge,
      challengeExpiresAt: session.expiresAt,
      riskScore: authValidation.riskScore || 0.5,
      fraudFlags: [],
      status: 'AUTHORIZED',
      authorizedAt: new Date(),
      createdAt: new Date()
    }

    // Store in database
    const { error } = await this.supabase
      .from('transaction_authorizations')
      .insert([{
        id: authorization.id,
        transactionId: authorization.transactionId,
        customerProfileId: authorization.customerProfileId,
        merchantId: authorization.merchantId,
        faceVerified: authorization.faceVerified,
        faceSimilarity: authorization.faceSimilarity,
        deviceBiometricVerified: authorization.deviceBiometricVerified,
        webauthnCredentialId: authorization.webauthnCredentialId,
        challenge: authorization.challenge,
        challengeExpiresAt: authorization.challengeExpiresAt.toISOString(),
        riskScore: authorization.riskScore,
        fraudFlags: authorization.fraudFlags,
        status: authorization.status,
        authorizedAt: authorization.authorizedAt?.toISOString(),
        createdAt: authorization.createdAt.toISOString()
      }])

    if (error) {
      console.error('Failed to store transaction authorization:', error)
    }

    return authorization
  }

  private async updatePaymentSession(sessionId: string, status: string): Promise<void> {
    const { error } = await this.supabase
      .from('payment_sessions')
      .update({
        status,
        updatedAt: new Date().toISOString()
      })
      .eq('sessionId', sessionId)

    if (error) {
      console.error('Failed to update payment session:', error)
    }
  }

  private determineAuthMethod(authFactors: AuthenticationFactors): string {
    const methods: string[] = []
    
    if (authFactors.faceVerified) {
      methods.push('FACE')
    }
    
    if (authFactors.deviceBiometricVerified) {
      methods.push('DEVICE_BIOMETRIC')
    }

    if (methods.length === 2) {
      return 'DUAL_BIOMETRIC_FACE_DEVICE'
    }
    
    return methods[0] || 'UNKNOWN'
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2)}`
  }

  private generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substring(2)}`
  }

  private generateAuthorizationId(): string {
    return `auth_${Date.now()}_${Math.random().toString(36).substring(2)}`
  }

  private generateNonce(): string {
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    return this.arrayBufferToHex(array.buffer)
  }

  private arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  private cleanupReplayPrevention(): void {
    const now = Date.now()
    const expiration = 10 * 60 * 1000 // 10 minutes
    
    for (const [key, timestamp] of this.replayPrevention.entries()) {
      if (now - timestamp > expiration) {
        this.replayPrevention.delete(key)
      }
    }
  }

  // ============================================================================
  // HEALTH CHECK AND DIAGNOSTICS
  // ============================================================================

  async healthCheck(): Promise<{ healthy: boolean; details: Record<string, any> }> {
    try {
      // Test database connection
      const { data, error } = await this.supabase
        .from('payment_sessions')
        .select('count')
        .limit(1)

      const securityManagerHealth = await this.securityManager.healthCheck()
      const biometricAuthHealth = await this.biometricAuth.healthCheck()

      return {
        healthy: !error && securityManagerHealth.healthy && biometricAuthHealth.healthy,
        details: {
          database: error ? 'connection_failed' : 'connected',
          securityManager: securityManagerHealth.healthy,
          biometricAuth: biometricAuthHealth.healthy,
          timestamp: new Date().toISOString(),
          service: 'TransactionAuthorizationEngine'
        }
      }
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      }
    }
  }
}

// Export singleton instance for convenience
export const transactionAuthorizationEngine = new TransactionAuthorizationEngine()

// Named exports for testing and custom initialization
export { TransactionAuthorizationEngine as default }