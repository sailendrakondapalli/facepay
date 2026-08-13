// BiometricAuthenticator
// Multi-platform biometric authentication interface and base implementation
// Provides unified abstraction for face recognition (YuNet + SFace) and WebAuthn device biometrics

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  BiometricAuthenticator,
  FaceEnrollmentResult,
  FaceIdentificationResult, 
  FaceVerificationResult,
  WebAuthnRegistrationOptions,
  WebAuthnRegistrationResult,
  Challenge,
  WebAuthnAuthResult,
  BiometricCapability,
  BiometricAuthError,
  WebAuthnError
} from '../types/enhanced-types'

// ============================================================================
// FACE RECOGNITION API CLIENT
// ============================================================================

class FaceRecognitionClient {
  private baseUrl: string
  private timeout: number

  constructor(baseUrl = 'http://localhost:5000', timeout = 30000) {
    this.baseUrl = baseUrl
    this.timeout = timeout
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch {
      return false
    }
  }

  async enrollFace(imageData: ImageData, userId: string): Promise<FaceEnrollmentResult> {
    try {
      // Convert ImageData to base64
      const canvas = document.createElement('canvas')
      canvas.width = imageData.width
      canvas.height = imageData.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Cannot create canvas context')
      }
      
      ctx.putImageData(imageData, 0, 0)
      const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]

      const response = await fetch(`${this.baseUrl}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          image_data: base64Image,
          format: 'base64'
        }),
        signal: AbortSignal.timeout(this.timeout)
      })

      const result = await response.json()

      if (!response.ok) {
        return {
          success: false,
          errorMessage: result.error || `HTTP ${response.status}`
        }
      }

      return {
        success: true,
        embedding: result.embedding,
        qualityScore: result.quality_score
      }
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Face enrollment failed'
      }
    }
  }

  async identifyFace(imageData: ImageData): Promise<FaceIdentificationResult> {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = imageData.width
      canvas.height = imageData.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Cannot create canvas context')
      }
      
      ctx.putImageData(imageData, 0, 0)
      const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]

      const response = await fetch(`${this.baseUrl}/identify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_data: base64Image,
          format: 'base64',
          threshold: 0.5
        }),
        signal: AbortSignal.timeout(this.timeout)
      })

      const result = await response.json()

      if (!response.ok) {
        return {
          success: false,
          identified: false,
          similarity: 0,
          errorMessage: result.error || `HTTP ${response.status}`
        }
      }

      return {
        success: true,
        identified: result.identified,
        customer: result.identified ? {
          id: result.user_id,
          userId: result.user_id,
          name: result.user_name || result.user_id,
          email: result.user_email || `${result.user_id}@unknown.com`
        } : undefined,
        similarity: result.similarity || 0
      }
    } catch (error) {
      return {
        success: false,
        identified: false,
        similarity: 0,
        errorMessage: error instanceof Error ? error.message : 'Face identification failed'
      }
    }
  }

  async verifyFace(imageData: ImageData, userId: string, threshold = 0.5): Promise<FaceVerificationResult> {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = imageData.width
      canvas.height = imageData.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Cannot create canvas context')
      }
      
      ctx.putImageData(imageData, 0, 0)
      const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]

      const response = await fetch(`${this.baseUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          image_data: base64Image,
          format: 'base64',
          threshold
        }),
        signal: AbortSignal.timeout(this.timeout)
      })

      const result = await response.json()

      if (!response.ok) {
        return {
          success: false,
          verified: false,
          similarity: 0,
          errorMessage: result.error || `HTTP ${response.status}`
        }
      }

      return {
        success: true,
        verified: result.verified,
        similarity: result.similarity || 0,
        verificationToken: result.verified ? this.generateVerificationToken(userId) : undefined
      }
    } catch (error) {
      return {
        success: false,
        verified: false,
        similarity: 0,
        errorMessage: error instanceof Error ? error.message : 'Face verification failed'
      }
    }
  }

  private generateVerificationToken(userId: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2)
    return btoa(`${userId}:${timestamp}:${random}`)
  }
}

// ============================================================================
// WEBAUTHN HANDLER
// ============================================================================

class WebAuthnHandler {
  async isWebAuthnSupported(): boolean {
    return !!(window.navigator?.credentials && window.PublicKeyCredential)
  }

  async isUserVerifyingPlatformAuthenticatorAvailable(): Promise<boolean> {
    if (!this.isWebAuthnSupported()) {
      return false
    }

    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    } catch {
      return false
    }
  }

  async createCredential(
    userId: string, 
    options: WebAuthnRegistrationOptions = {}
  ): Promise<WebAuthnRegistrationResult> {
    try {
      if (!this.isWebAuthnSupported()) {
        throw new WebAuthnError('WebAuthn not supported', 'WEBAUTHN_NOT_SUPPORTED')
      }

      const challenge = this.generateChallenge()
      const credentialCreationOptions: CredentialCreationOptions = {
        publicKey: {
          challenge: new TextEncoder().encode(challenge),
          rp: {
            name: 'FacePay Enhanced Authentication',
            id: window.location.hostname
          },
          user: {
            id: new TextEncoder().encode(userId),
            name: `user-${userId}`,
            displayName: options.displayName || `FacePay User ${userId}`
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 } // RS256
          ],
          timeout: options.timeout || 60000,
          attestation: options.attestation || 'direct',
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
            ...options.authenticatorSelection
          }
        }
      }

      const credential = await navigator.credentials.create(credentialCreationOptions) as PublicKeyCredential

      if (!credential) {
        throw new WebAuthnError('Credential creation failed', 'CREDENTIAL_CREATION_FAILED')
      }

      // Determine device type and friendly name
      const deviceType = this.getDeviceType()
      const friendlyName = this.getFriendlyAuthenticatorName(deviceType)

      return {
        success: true,
        credentialId: this.arrayBufferToBase64(credential.rawId),
        friendlyName,
        deviceType: 'platform'
      }
    } catch (error) {
      if (error instanceof WebAuthnError) {
        throw error
      }

      let errorMessage = 'WebAuthn registration failed'
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'User cancelled authentication or timeout occurred'
        } else if (error.name === 'NotSupportedError') {
          errorMessage = 'This authenticator is not supported'
        } else if (error.name === 'SecurityError') {
          errorMessage = 'Security requirements not met'
        } else {
          errorMessage = error.message
        }
      }

      return {
        success: false,
        errorMessage
      }
    }
  }

  async getAssertion(userId: string, challenge: Challenge): Promise<WebAuthnAuthResult> {
    try {
      if (!this.isWebAuthnSupported()) {
        throw new WebAuthnError('WebAuthn not supported', 'WEBAUTHN_NOT_SUPPORTED')
      }

      const credentialRequestOptions: CredentialRequestOptions = {
        publicKey: {
          challenge: new TextEncoder().encode(challenge.challenge),
          timeout: 60000,
          userVerification: 'required',
          rpId: window.location.hostname
        }
      }

      const assertion = await navigator.credentials.get(credentialRequestOptions) as PublicKeyCredential

      if (!assertion || !assertion.response) {
        throw new WebAuthnError('Authentication failed', 'ASSERTION_FAILED')
      }

      const response = assertion.response as AuthenticatorAssertionResponse
      const deviceType = this.getDeviceType()
      const authenticatorName = this.getFriendlyAuthenticatorName(deviceType)

      return {
        verified: true,
        authorizationToken: this.generateAuthToken(userId, challenge),
        authenticatorName,
        signature: response.signature,
        counter: this.getSignatureCounter(response)
      }
    } catch (error) {
      if (error instanceof WebAuthnError) {
        throw error
      }

      let errorMessage = 'WebAuthn authentication failed'
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'User cancelled authentication or timeout occurred'
        } else if (error.name === 'NotSupportedError') {
          errorMessage = 'This authenticator is not supported'
        } else {
          errorMessage = error.message
        }
      }

      return {
        verified: false,
        errorMessage
      }
    }
  }

  private generateChallenge(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return this.arrayBufferToBase64(array.buffer)
  }

  private generateAuthToken(userId: string, challenge: Challenge): string {
    const timestamp = Date.now()
    const payload = {
      userId,
      challenge: challenge.challenge,
      amount: challenge.amount,
      merchantId: challenge.merchantId,
      timestamp
    }
    return btoa(JSON.stringify(payload))
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  private getSignatureCounter(response: AuthenticatorAssertionResponse): number {
    // Extract signature counter from authenticator data
    const authData = new Uint8Array(response.authenticatorData)
    if (authData.length < 37) return 0
    
    const counterBytes = authData.slice(33, 37)
    return new DataView(counterBytes.buffer).getUint32(0, false)
  }

  private getDeviceType(): string {
    const userAgent = navigator.userAgent.toLowerCase()
    
    if (userAgent.includes('windows')) {
      return 'Windows Hello'
    } else if (userAgent.includes('mac')) {
      return 'Touch ID'
    } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
      return 'Face ID / Touch ID'
    } else if (userAgent.includes('android')) {
      return 'Android Biometric'
    }
    
    return 'Device Biometric'
  }

  private getFriendlyAuthenticatorName(deviceType: string): string {
    const typeMap: Record<string, string> = {
      'Windows Hello': 'Windows Hello',
      'Touch ID': 'macOS Touch ID',
      'Face ID / Touch ID': 'iOS Biometric',
      'Android Biometric': 'Android Biometric',
      'Device Biometric': 'Platform Authenticator'
    }
    
    return typeMap[deviceType] || 'Biometric Authenticator'
  }
}

// ============================================================================
// MAIN BIOMETRIC AUTHENTICATOR IMPLEMENTATION
// ============================================================================

export class EnhancedBiometricAuthenticator implements BiometricAuthenticator {
  private supabase: SupabaseClient
  private faceClient: FaceRecognitionClient
  private webauthnHandler: WebAuthnHandler

  constructor(supabaseUrl?: string, supabaseKey?: string, faceApiUrl?: string) {
    this.supabase = createClient(
      supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '',
      supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    )
    this.faceClient = new FaceRecognitionClient(faceApiUrl)
    this.webauthnHandler = new WebAuthnHandler()
  }

  // ============================================================================
  // FACE RECOGNITION METHODS
  // ============================================================================

  async enrollFace(imageData: ImageData): Promise<FaceEnrollmentResult> {
    try {
      // Check if face API is available
      const isHealthy = await this.faceClient.isHealthy()
      if (!isHealthy) {
        throw new BiometricAuthError(
          'Face recognition service unavailable',
          'FACE_API_UNAVAILABLE'
        )
      }

      // For enrollment, we need a user ID - this should be provided by the calling context
      // This is a simplified implementation; in production, user ID would be from auth context
      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2)}`
      
      return await this.faceClient.enrollFace(imageData, userId)
    } catch (error) {
      if (error instanceof BiometricAuthError) {
        throw error
      }
      
      throw new BiometricAuthError(
        'Face enrollment failed',
        'FACE_ENROLLMENT_ERROR',
        { originalError: error instanceof Error ? error.message : 'Unknown error' }
      )
    }
  }

  async identifyFace(imageData: ImageData, threshold = 0.5): Promise<FaceIdentificationResult> {
    try {
      const isHealthy = await this.faceClient.isHealthy()
      if (!isHealthy) {
        throw new BiometricAuthError(
          'Face recognition service unavailable',
          'FACE_API_UNAVAILABLE'
        )
      }

      return await this.faceClient.identifyFace(imageData)
    } catch (error) {
      if (error instanceof BiometricAuthError) {
        throw error
      }
      
      throw new BiometricAuthError(
        'Face identification failed',
        'FACE_IDENTIFICATION_ERROR',
        { originalError: error instanceof Error ? error.message : 'Unknown error' }
      )
    }
  }

  async verifyFace(imageData: ImageData, customerId: string, threshold = 0.5): Promise<FaceVerificationResult> {
    try {
      const isHealthy = await this.faceClient.isHealthy()
      if (!isHealthy) {
        throw new BiometricAuthError(
          'Face recognition service unavailable',
          'FACE_API_UNAVAILABLE'
        )
      }

      return await this.faceClient.verifyFace(imageData, customerId, threshold)
    } catch (error) {
      if (error instanceof BiometricAuthError) {
        throw error
      }
      
      throw new BiometricAuthError(
        'Face verification failed',
        'FACE_VERIFICATION_ERROR',
        { originalError: error instanceof Error ? error.message : 'Unknown error' }
      )
    }
  }

  // ============================================================================
  // WEBAUTHN METHODS
  // ============================================================================

  async registerWebAuthn(userId: string, options?: WebAuthnRegistrationOptions): Promise<WebAuthnRegistrationResult> {
    try {
      if (!await this.webauthnHandler.isWebAuthnSupported()) {
        throw new WebAuthnError('WebAuthn not supported on this device', 'WEBAUTHN_NOT_SUPPORTED')
      }

      const result = await this.webauthnHandler.createCredential(userId, options)
      
      if (result.success && result.credentialId) {
        // Store credential in database
        await this.storeWebAuthnCredential(userId, result)
      }

      return result
    } catch (error) {
      if (error instanceof WebAuthnError) {
        throw error
      }
      
      throw new WebAuthnError(
        'WebAuthn registration failed',
        'WEBAUTHN_REGISTRATION_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  async authenticateWebAuthn(userId: string, challenge: Challenge): Promise<WebAuthnAuthResult> {
    try {
      if (!await this.webauthnHandler.isWebAuthnSupported()) {
        throw new WebAuthnError('WebAuthn not supported on this device', 'WEBAUTHN_NOT_SUPPORTED')
      }

      return await this.webauthnHandler.getAssertion(userId, challenge)
    } catch (error) {
      if (error instanceof WebAuthnError) {
        throw error
      }
      
      throw new WebAuthnError(
        'WebAuthn authentication failed',
        'WEBAUTHN_AUTH_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  // ============================================================================
  // PLATFORM DETECTION METHODS
  // ============================================================================

  async getSupportedBiometrics(): Promise<BiometricCapability[]> {
    const capabilities: BiometricCapability[] = []

    // Check face recognition availability
    const faceApiHealthy = await this.faceClient.isHealthy()
    if (faceApiHealthy) {
      capabilities.push('face-recognition')
    }

    // Check WebAuthn platform authenticator
    const webauthnSupported = await this.webauthnHandler.isWebAuthnSupported()
    const platformAuthAvailable = await this.webauthnHandler.isUserVerifyingPlatformAuthenticatorAvailable()

    if (webauthnSupported && platformAuthAvailable) {
      capabilities.push('webauthn-platform')
      
      // Add platform-specific capabilities
      const userAgent = navigator.userAgent.toLowerCase()
      if (userAgent.includes('windows')) {
        capabilities.push('windows-hello')
      } else if (userAgent.includes('mac')) {
        capabilities.push('touch-id')
      } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
        capabilities.push('face-id')
      } else if (userAgent.includes('android')) {
        capabilities.push('fingerprint')
      }
    }

    return capabilities
  }

  async isDeviceBiometricAvailable(): Promise<boolean> {
    return await this.webauthnHandler.isUserVerifyingPlatformAuthenticatorAvailable()
  }

  async isFaceCameraAvailable(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach(track => track.stop())
      return true
    } catch {
      return false
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async storeWebAuthnCredential(userId: string, result: WebAuthnRegistrationResult): Promise<void> {
    try {
      const credentialData = {
        userId,
        customerProfileId: userId, // In real implementation, map userId to customerProfileId
        credentialId: result.credentialId,
        friendlyName: result.friendlyName || 'Unknown Device',
        deviceType: result.deviceType,
        transports: ['internal'], // Platform authenticator
        isActive: true,
        createdAt: new Date().toISOString()
      }

      const { error } = await this.supabase
        .from('webauthn_credentials')
        .insert([credentialData])

      if (error) {
        console.error('Failed to store WebAuthn credential:', error)
      }
    } catch (error) {
      console.error('Error storing WebAuthn credential:', error)
    }
  }

  // ============================================================================
  // HEALTH CHECK AND DIAGNOSTICS
  // ============================================================================

  async healthCheck(): Promise<{ healthy: boolean; services: Record<string, boolean> }> {
    const [faceApiHealthy, webauthnSupported] = await Promise.all([
      this.faceClient.isHealthy(),
      this.webauthnHandler.isWebAuthnSupported()
    ])

    return {
      healthy: faceApiHealthy || webauthnSupported,
      services: {
        faceRecognitionApi: faceApiHealthy,
        webauthnSupport: webauthnSupported,
        platformBiometric: await this.webauthnHandler.isUserVerifyingPlatformAuthenticatorAvailable(),
        cameraAccess: await this.isFaceCameraAvailable()
      }
    }
  }
}

// Export singleton instance for convenience
export const biometricAuthenticator = new EnhancedBiometricAuthenticator()

// Named exports for testing and custom initialization
export { EnhancedBiometricAuthenticator as default, WebAuthnHandler, FaceRecognitionClient }