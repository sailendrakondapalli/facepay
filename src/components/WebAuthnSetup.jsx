import { useState, useEffect } from 'react'
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  getAuthenticatorName,
  registerWebAuthn,
  hasWebAuthnCredential,
  getWebAuthnCredentials,
  deleteWebAuthnCredential,
  formatDeviceType
} from '../lib/webauthn.js'
import './WebAuthnSetup.css'

export function WebAuthnSetup({ userId, onComplete }) {
  const [supported, setSupported] = useState(false)
  const [available, setAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [hasCredential, setHasCredential] = useState(false)
  const [credentials, setCredentials] = useState([])
  const [authenticatorName, setAuthenticatorName] = useState('')

  useEffect(() => {
    checkSupport()
    loadCredentials()
  }, [userId])

  async function checkSupport() {
    setLoading(true)
    try {
      const isSupported = isWebAuthnSupported()
      setSupported(isSupported)
      
      if (isSupported) {
        const isAvailable = await isPlatformAuthenticatorAvailable()
        setAvailable(isAvailable)
        setAuthenticatorName(getAuthenticatorName())
      }
      
      const hasCred = await hasWebAuthnCredential(userId)
      setHasCredential(hasCred)
    } catch (err) {
      console.error('Failed to check WebAuthn support:', err)
      setError('Failed to check biometric support')
    } finally {
      setLoading(false)
    }
  }

  async function loadCredentials() {
    try {
      const creds = await getWebAuthnCredentials(userId)
      setCredentials(creds)
    } catch (err) {
      console.error('Failed to load credentials:', err)
    }
  }

  async function handleRegister() {
    setRegistering(true)
    setError(null)
    setSuccess(null)
    
    try {
      const result = await registerWebAuthn()
      setSuccess(`${result.authenticatorName} registered successfully!`)
      setHasCredential(true)
      await loadCredentials()
      
      // Notify parent component
      if (onComplete) {
        setTimeout(() => onComplete(result), 1500)
      }
    } catch (err) {
      console.error('Registration failed:', err)
      setError(err.message || 'Failed to register biometric authentication')
    } finally {
      setRegistering(false)
    }
  }

  async function handleDelete(credentialId) {
    if (!confirm('Are you sure you want to remove this biometric authenticator?')) {
      return
    }
    
    try {
      await deleteWebAuthnCredential(credentialId)
      setSuccess('Biometric authenticator removed')
      await loadCredentials()
      setHasCredential(credentials.length > 1)
    } catch (err) {
      console.error('Delete failed:', err)
      setError('Failed to remove biometric authenticator')
    }
  }

  if (loading) {
    return (
      <div className="webauthn-setup">
        <div className="spinner" />
        <p>Checking biometric support...</p>
      </div>
    )
  }

  if (!supported) {
    return (
      <div className="webauthn-setup">
        <div className="alert alert-warning">
          <h3>⚠️ Not Supported</h3>
          <p>Your browser doesn't support biometric authentication.</p>
          <p className="text-muted">Please use a modern browser like Chrome, Edge, Firefox, or Safari.</p>
        </div>
      </div>
    )
  }

  if (!available) {
    return (
      <div className="webauthn-setup">
        <div className="alert alert-warning">
          <h3>⚠️ No Biometric Available</h3>
          <p>No biometric authenticator found on this device.</p>
          <div className="hint-box">
            <h4>How to enable:</h4>
            <ul>
              <li><strong>Windows:</strong> Enable Windows Hello in Settings → Accounts → Sign-in options</li>
              <li><strong>Mac:</strong> Touch ID is automatically available on supported models</li>
              <li><strong>Linux:</strong> Ensure fingerprint reader is configured</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="webauthn-setup">
      <div className="webauthn-header">
        <div className="icon-large">🔐</div>
        <h2>Biometric Payment Authorization</h2>
        <p className="text-muted">
          Add an extra layer of security using {authenticatorName}
        </p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          ✓ {success}
        </div>
      )}

      <div className="security-info">
        <h3>🛡️ How it works</h3>
        <div className="info-steps">
          <div className="info-step">
            <span className="step-number">1</span>
            <div className="step-content">
              <strong>Face Recognition</strong>
              <p>Identifies WHO you are (1:N matching)</p>
            </div>
          </div>
          <div className="info-step">
            <span className="step-number">2</span>
            <div className="step-content">
              <strong>{authenticatorName}</strong>
              <p>Proves YOU approve this payment (authorization)</p>
            </div>
          </div>
          <div className="info-step">
            <span className="step-number">3</span>
            <div className="step-content">
              <strong>Payment Processed</strong>
              <p>Both factors verified = secure transaction</p>
            </div>
          </div>
        </div>
      </div>

      <div className="privacy-notice">
        <h4>🔒 Your Privacy</h4>
        <p>
          Your {authenticatorName.toLowerCase()} data <strong>NEVER leaves your device</strong>.
          We only receive a cryptographic proof that you authorized the payment.
          No fingerprints or biometric data are stored on our servers.
        </p>
      </div>

      {credentials.length > 0 && (
        <div className="credentials-list">
          <h3>Registered Authenticators</h3>
          {credentials.map(cred => (
            <div key={cred.id} className="credential-card">
              <div className="credential-info">
                <div className="credential-icon">
                  {cred.device_type === 'platform' ? '📱' : '🔑'}
                </div>
                <div className="credential-details">
                  <strong>{cred.friendly_name || formatDeviceType(cred.device_type)}</strong>
                  <p className="text-muted">
                    Registered: {new Date(cred.created_at).toLocaleDateString()}
                    {cred.last_used_at && ` • Last used: ${new Date(cred.last_used_at).toLocaleString()}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(cred.credential_id)}
                className="btn btn-outline btn-sm btn-danger"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="webauthn-actions">
        {!hasCredential || credentials.length === 0 ? (
          <button
            onClick={handleRegister}
            disabled={registering}
            className="btn btn-primary btn-lg btn-full"
          >
            {registering ? (
              <>
                <span className="spinner spinner-sm" />
                Registering {authenticatorName}...
              </>
            ) : (
              <>
                🔐 Register {authenticatorName}
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleRegister}
            disabled={registering}
            className="btn btn-outline btn-full"
          >
            {registering ? (
              <>
                <span className="spinner spinner-sm" />
                Adding...
              </>
            ) : (
              <>
                ➕ Add Another Authenticator
              </>
            )}
          </button>
        )}
      </div>

      <div className="benefits-grid">
        <div className="benefit-card">
          <div className="benefit-icon">🚫</div>
          <strong>No Stolen Photos</strong>
          <p>Even if someone has your photo, they can't make payments without your device biometric</p>
        </div>
        <div className="benefit-card">
          <div className="benefit-icon">⚡</div>
          <strong>Fast & Convenient</strong>
          <p>Just scan your face and confirm with {authenticatorName.toLowerCase()}</p>
        </div>
        <div className="benefit-card">
          <div className="benefit-icon">🔒</div>
          <strong>Bank-Level Security</strong>
          <p>Multi-factor biometric authentication used by financial institutions</p>
        </div>
      </div>
    </div>
  )
}
