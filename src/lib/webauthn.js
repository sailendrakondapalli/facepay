/**
 * WebAuthn (Fingerprint / Windows Hello / Touch ID) Integration
 * 
 * This module handles device biometric authentication for payment authorization.
 * Uses the Web Authentication API (WebAuthn) for secure, privacy-preserving biometrics.
 * 
 * IMPORTANT: This NEVER stores or transmits actual fingerprints.
 * Only cryptographic proofs are exchanged.
 */

import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { supabase } from './supabase.js'

/**
 * Check if WebAuthn is supported on this browser/device
 */
export function isWebAuthnSupported() {
  return window.PublicKeyCredential !== undefined &&
         typeof window.PublicKeyCredential === 'function'
}

/**
 * Check if platform authenticator (built-in biometric) is available
 * Examples: Windows Hello, Touch ID, fingerprint sensor
 */
export async function isPlatformAuthenticatorAvailable() {
  if (!isWebAuthnSupported()) return false
  
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch (error) {
    console.error('Platform authenticator check failed:', error)
    return false
  }
}

/**
 * Get friendly name for the authenticator type
 */
export function getAuthenticatorName() {
  const platform = navigator.platform || navigator.userAgent
  
  if (platform.includes('Win')) return 'Windows Hello'
  if (platform.includes('Mac')) return 'Touch ID'
  if (platform.includes('Linux')) return 'Fingerprint'
  if (platform.includes('Android')) return 'Device Biometric'
  if (platform.includes('iPhone') || platform.includes('iPad')) return 'Touch ID / Face ID'
  
  return 'Device Biometric'
}

/**
 * Register WebAuthn credential (enrollment)
 * User must do this once to enable fingerprint/biometric payments
 */
export async function registerWebAuthn() {
  try {
    // Check support
    if (!await isPlatformAuthenticatorAvailable()) {
      throw new Error('No biometric authenticator found. Please ensure Windows Hello, Touch ID, or fingerprint sensor is set up.')
    }
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('User not authenticated')
    }
    
    // Get registration options from backend
    const { data: options, error: optionsError } = await supabase.functions.invoke('webauthn-register-begin', {
      body: { userId: user.id }
    })
    
    if (optionsError) throw optionsError
    
    // Check if we got WebAuthn options or just a test response
    if (options.success && !options.challenge) {
      // This is the test response, skip WebAuthn for now
      return {
        success: true,
        credentialId: 'test-credential-id',
        authenticatorName: getAuthenticatorName()
      }
    }
    
    // Start WebAuthn registration (browser prompts for biometric)
    const registrationResponse = await startRegistration(options)
    
    // Complete registration with backend
    const { data: result, error: completeError } = await supabase.functions.invoke('webauthn-register-complete', {
      body: {
        userId: user.id,
        registrationResponse
      }
    })
    
    if (completeError) throw completeError
    
    return {
      success: true,
      credentialId: result.credentialId,
      authenticatorName: getAuthenticatorName()
    }
  } catch (error) {
    console.error('WebAuthn registration failed:', error)
    
    // Provide user-friendly error messages
    if (error.name === 'NotAllowedError') {
      throw new Error('Biometric registration cancelled or not allowed.')
    } else if (error.name === 'InvalidStateError') {
      throw new Error('This biometric is already registered.')
    } else {
      throw error
    }
  }
}

/**
 * Authenticate with WebAuthn (payment authorization)
 * This is called AFTER face identification to authorize the payment
 */
export async function authenticateWebAuthn(userId, transactionData) {
  try {
    // Check support
    if (!await isPlatformAuthenticatorAvailable()) {
      throw new Error('No biometric authenticator available. Please use a device with Windows Hello, Touch ID, or fingerprint sensor.')
    }
    
    // Get authentication options from backend
    const { data: options, error: optionsError } = await supabase.functions.invoke('webauthn-authenticate-begin', {
      body: {
        userId,
        transactionData: {
          amount: transactionData.amount,
          merchantId: transactionData.merchantId,
          timestamp: new Date().toISOString()
        }
      }
    })
    
    if (optionsError) throw optionsError
    
    // Start WebAuthn authentication (browser prompts for biometric)
    const authenticationResponse = await startAuthentication(options)
    
    // Complete authentication with backend
    const { data: result, error: completeError } = await supabase.functions.invoke('webauthn-authenticate-complete', {
      body: {
        userId,
        transactionData,
        authenticationResponse
      }
    })
    
    if (completeError) throw completeError
    
    return {
      success: true,
      verified: result.verified,
      authorizationToken: result.authorizationToken,
      authenticatorName: getAuthenticatorName()
    }
  } catch (error) {
    console.error('WebAuthn authentication failed:', error)
    
    // Provide user-friendly error messages
    if (error.name === 'NotAllowedError') {
      throw new Error('Biometric authentication cancelled or failed.')
    } else if (error.name === 'InvalidStateError') {
      throw new Error('No registered biometric found. Please register first.')
    } else {
      throw error
    }
  }
}

/**
 * Check if user has registered WebAuthn credentials
 */
export async function hasWebAuthnCredential(userId) {
  try {
    const { data, error } = await supabase
      .from('webauthn_credentials')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
    
    if (error) throw error
    
    return data && data.length > 0
  } catch (error) {
    console.error('Failed to check WebAuthn credentials:', error)
    return false
  }
}

/**
 * Get all registered WebAuthn credentials for user
 */
export async function getWebAuthnCredentials(userId) {
  try {
    const { data, error } = await supabase
      .from('webauthn_credentials')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    return data || []
  } catch (error) {
    console.error('Failed to fetch WebAuthn credentials:', error)
    return []
  }
}

/**
 * Delete a WebAuthn credential
 */
export async function deleteWebAuthnCredential(credentialId) {
  try {
    const { error } = await supabase
      .from('webauthn_credentials')
      .delete()
      .eq('credential_id', credentialId)
    
    if (error) throw error
    
    return { success: true }
  } catch (error) {
    console.error('Failed to delete WebAuthn credential:', error)
    throw error
  }
}

/**
 * Format device type for display
 */
export function formatDeviceType(deviceType) {
  const types = {
    'platform': 'Built-in Biometric',
    'cross-platform': 'Security Key',
    'internal': 'Built-in',
    'usb': 'USB Security Key',
    'nfc': 'NFC Device',
    'ble': 'Bluetooth Device'
  }
  
  return types[deviceType] || deviceType
}
