// Customer Security Settings
// Comprehensive interface for customers to configure their authentication preferences
// Transaction limits, biometric preferences, and security settings management

import React, { useState, useEffect } from 'react'
import { securitySettingsManager } from '../lib/security-settings-manager'
import { biometricAuthenticator } from '../lib/biometric-authenticator'
import './CustomerSecuritySettings.css'

const CustomerSecuritySettings = () => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const [customerId] = useState(`customer_${Date.now()}`) // In real app, get from auth context
  const [settings, setSettings] = useState(null)
  const [capabilities, setCapabilities] = useState([])
  const [webauthnCredentials, setWebauthnCredentials] = useState([])
  
  // Form State
  const [formData, setFormData] = useState({
    maxTransactionAmount: 5000,
    dailyTransactionLimit: 25000,
    facePaymentEnabled: true,
    biometricPaymentEnabled: false,
    requireDualFactor: false,
    livenessDetectionEnabled: true
  })
  
  // UI State
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState('limits')

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  useEffect(() => {
    initializeSettings()
  }, [])

  const initializeSettings = async () => {
    setLoading(true)
    try {
      // Load current settings
      const currentSettings = await securitySettingsManager.getCustomerSettings(customerId)
      setSettings(currentSettings)
      setFormData({
        maxTransactionAmount: currentSettings.maxTransactionAmount,
        dailyTransactionLimit: currentSettings.dailyTransactionLimit,
        facePaymentEnabled: currentSettings.facePaymentEnabled,
        biometricPaymentEnabled: currentSettings.biometricPaymentEnabled,
        requireDualFactor: currentSettings.requireDualFactor,
        livenessDetectionEnabled: currentSettings.livenessDetectionEnabled
      })

      // Detect biometric capabilities
      const deviceCapabilities = await biometricAuthenticator.getSupportedBiometrics()
      setCapabilities(deviceCapabilities)

      // Load WebAuthn credentials (simulate)
      setWebauthnCredentials([
        {
          id: 'cred_1',
          friendlyName: 'Windows Hello',
          deviceType: 'platform',
          lastUsed: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          isActive: true
        }
      ])

    } catch (error) {
      console.error('Failed to load settings:', error)
      setError('Failed to load security settings')
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // FORM HANDLING
  // ============================================================================
  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    setError('')
    setSuccess('')
  }

  const validateSettings = () => {
    // Validate transaction limits
    if (formData.maxTransactionAmount <= 0 || formData.maxTransactionAmount > 100000) {
      return 'Per-transaction limit must be between ₹1 and ₹100,000'
    }

    if (formData.dailyTransactionLimit <= 0 || formData.dailyTransactionLimit > 500000) {
      return 'Daily limit must be between ₹1 and ₹500,000'
    }

    if (formData.maxTransactionAmount > formData.dailyTransactionLimit) {
      return 'Per-transaction limit cannot exceed daily limit'
    }

    // Validate authentication methods
    if (!formData.facePaymentEnabled && !formData.biometricPaymentEnabled) {
      return 'At least one authentication method must be enabled'
    }

    return null
  }

  const handleSaveSettings = async () => {
    const validationError = validateSettings()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError('')

    try {
      const success = await securitySettingsManager.updateSecurityPreferences(
        customerId,
        formData
      )

      if (!success) {
        throw new Error('Failed to update settings')
      }

      setSuccess('Security settings updated successfully!')
      
      // Reload settings to confirm changes
      setTimeout(() => {
        initializeSettings()
      }, 1000)

    } catch (error) {
      console.error('Failed to save settings:', error)
      setError(error.message || 'Failed to save security settings')
    } finally {
      setSaving(false)
    }
  }

  // ============================================================================
  // BIOMETRIC REGISTRATION
  // ============================================================================
  const handleRegisterBiometric = async () => {
    try {
      setError('')
      const result = await biometricAuthenticator.registerWebAuthn(customerId, {
        displayName: 'FacePay Customer'
      })

      if (result.success) {
        setSuccess(`${result.friendlyName} registered successfully!`)
        // Reload credentials
        initializeSettings()
      } else {
        setError(result.errorMessage || 'Failed to register biometric device')
      }
    } catch (error) {
      console.error('Biometric registration failed:', error)
      setError('Failed to register biometric device')
    }
  }

  const handleRemoveCredential = async (credentialId) => {
    // In real implementation, call API to remove credential
    setWebauthnCredentials(prev => 
      prev.filter(cred => cred.id !== credentialId)
    )
    setSuccess('Device credential removed successfully')
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount)
  }

  const getCapabilityIcon = (capability) => {
    const icons = {
      'face-recognition': '👤',
      'webauthn-platform': '🔐',
      'windows-hello': '🪟',
      'touch-id': '👆',
      'face-id': '📱',
      'fingerprint': '👆'
    }
    return icons[capability] || '🔐'
  }

  const getCapabilityName = (capability) => {
    const names = {
      'face-recognition': 'Face Recognition',
      'webauthn-platform': 'Platform Authenticator',
      'windows-hello': 'Windows Hello',
      'touch-id': 'Touch ID',
      'face-id': 'Face ID',
      'fingerprint': 'Fingerprint'
    }
    return names[capability] || capability
  }

  // ============================================================================
  // RENDER METHODS
  // ============================================================================
  const renderTransactionLimits = () => (
    <div className=\"settings-section\">
      <h3>💰 Transaction Limits</h3>
      <p className=\"section-description\">
        Configure your spending limits for enhanced security
      </p>

      <div className=\"form-row\">
        <div className=\"form-group\">
          <label>Per-Transaction Limit</label>
          <div className=\"input-group\">
            <span className=\"input-prefix\">₹</span>
            <input
              type=\"number\"
              value={formData.maxTransactionAmount}
              onChange={(e) => handleInputChange('maxTransactionAmount', parseInt(e.target.value) || 0)}
              min=\"1\"
              max=\"100000\"
            />
          </div>
          <small>Maximum amount for a single transaction (₹1 - ₹100,000)</small>
        </div>

        <div className=\"form-group\">
          <label>Daily Transaction Limit</label>
          <div className=\"input-group\">
            <span className=\"input-prefix\">₹</span>
            <input
              type=\"number\"
              value={formData.dailyTransactionLimit}
              onChange={(e) => handleInputChange('dailyTransactionLimit', parseInt(e.target.value) || 0)}
              min=\"1\"
              max=\"500000\"
            />
          </div>
          <small>Maximum total amount per day (₹1 - ₹500,000)</small>
        </div>
      </div>

      <div className=\"limits-preview\">
        <h4>Current Limits Preview</h4>
        <div className=\"limits-grid\">
          <div className=\"limit-item\">
            <span className=\"limit-label\">Per Transaction:</span>
            <span className=\"limit-value\">{formatCurrency(formData.maxTransactionAmount)}</span>
          </div>
          <div className=\"limit-item\">
            <span className=\"limit-label\">Daily Total:</span>
            <span className=\"limit-value\">{formatCurrency(formData.dailyTransactionLimit)}</span>
          </div>
        </div>
      </div>
    </div>
  )

  const renderAuthenticationMethods = () => (
    <div className=\"settings-section\">
      <h3>🔐 Authentication Methods</h3>
      <p className=\"section-description\">
        Choose how you want to authenticate payments
      </p>

      <div className=\"auth-methods-config\">
        {/* Face Payment */}
        <div className=\"auth-method-card\">
          <div className=\"method-header\">
            <div className=\"method-info\">
              <span className=\"method-icon\">👤</span>
              <div>
                <h4>Face Payment</h4>
                <p>Use face recognition for payment authentication</p>
              </div>
            </div>
            <label className=\"toggle-switch\">
              <input
                type=\"checkbox\"
                checked={formData.facePaymentEnabled}
                onChange={(e) => handleInputChange('facePaymentEnabled', e.target.checked)}
              />
              <span className=\"toggle-slider\"></span>
            </label>
          </div>
          <div className=\"method-status\">
            {capabilities.includes('face-recognition') ? (
              <span className=\"status-available\">✅ Available</span>
            ) : (
              <span className=\"status-unavailable\">❌ Camera not available</span>
            )}
          </div>
        </div>

        {/* Biometric Payment */}
        <div className=\"auth-method-card\">
          <div className=\"method-header\">
            <div className=\"method-info\">
              <span className=\"method-icon\">🔐</span>
              <div>
                <h4>Device Biometric</h4>
                <p>Use your device's built-in biometric authentication</p>
              </div>
            </div>
            <label className=\"toggle-switch\">
              <input
                type=\"checkbox\"
                checked={formData.biometricPaymentEnabled}
                onChange={(e) => handleInputChange('biometricPaymentEnabled', e.target.checked)}
              />
              <span className=\"toggle-slider\"></span>
            </label>
          </div>
          <div className=\"method-status\">
            {capabilities.includes('webauthn-platform') ? (
              <span className=\"status-available\">✅ Available</span>
            ) : (
              <span className=\"status-unavailable\">❌ Not supported on this device</span>
            )}
          </div>
        </div>
      </div>

      {/* Available Capabilities */}
      <div className=\"capabilities-section\">
        <h4>Available on Your Device</h4>
        <div className=\"capabilities-grid\">
          {capabilities.map(capability => (
            <div key={capability} className=\"capability-item\">
              <span className=\"capability-icon\">{getCapabilityIcon(capability)}</span>
              <span className=\"capability-name\">{getCapabilityName(capability)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderSecurityOptions = () => (
    <div className=\"settings-section\">
      <h3>🛡️ Security Options</h3>
      <p className=\"section-description\">
        Advanced security features for enhanced protection
      </p>

      <div className=\"security-options\">
        <div className=\"option-item\">
          <div className=\"option-info\">
            <h4>Dual-Factor Authentication</h4>
            <p>Require both face and device biometric for high-value transactions</p>
          </div>
          <label className=\"toggle-switch\">
            <input
              type=\"checkbox\"
              checked={formData.requireDualFactor}
              onChange={(e) => handleInputChange('requireDualFactor', e.target.checked)}
            />
            <span className=\"toggle-slider\"></span>
          </label>
        </div>

        <div className=\"option-item\">
          <div className=\"option-info\">
            <h4>Liveness Detection</h4>
            <p>Enhanced face authentication with liveness verification</p>
          </div>
          <label className=\"toggle-switch\">
            <input
              type=\"checkbox\"
              checked={formData.livenessDetectionEnabled}
              onChange={(e) => handleInputChange('livenessDetectionEnabled', e.target.checked)}
            />
            <span className=\"toggle-slider\"></span>
          </label>
        </div>
      </div>
    </div>
  )

  const renderBiometricDevices = () => (
    <div className=\"settings-section\">
      <h3>📱 Registered Devices</h3>
      <p className=\"section-description\">
        Manage your registered biometric devices
      </p>

      {webauthnCredentials.length > 0 ? (
        <div className=\"devices-list\">
          {webauthnCredentials.map(credential => (
            <div key={credential.id} className=\"device-item\">
              <div className=\"device-info\">
                <div className=\"device-icon\">🔐</div>
                <div>
                  <h4>{credential.friendlyName}</h4>
                  <p>Last used: {credential.lastUsed.toLocaleDateString()}</p>
                </div>
              </div>
              <div className=\"device-actions\">
                <span className={`device-status ${credential.isActive ? 'active' : 'inactive'}`}>
                  {credential.isActive ? 'Active' : 'Inactive'}
                </span>
                <button 
                  onClick={() => handleRemoveCredential(credential.id)}
                  className=\"remove-device-btn\"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className=\"no-devices\">
          <p>No biometric devices registered</p>
        </div>
      )}

      {capabilities.includes('webauthn-platform') && (
        <button
          onClick={handleRegisterBiometric}
          className=\"register-device-btn\"
        >
          Register New Device
        </button>
      )}
    </div>
  )

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  if (loading) {
    return (
      <div className=\"settings-container loading-state\">
        <div className=\"loading-spinner\"></div>
        <p>Loading security settings...</p>
      </div>
    )
  }

  return (
    <div className=\"customer-security-settings\">
      <div className=\"settings-container\">
        {/* Header */}
        <header className=\"settings-header\">
          <h1>🛡️ Security Settings</h1>
          <p>Configure your FacePay authentication and security preferences</p>
        </header>

        {/* Messages */}
        {error && (
          <div className=\"error-message\">
            ❌ {error}
          </div>
        )}

        {success && (
          <div className=\"success-message\">
            ✅ {success}
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className=\"settings-nav\">
          <button
            className={`nav-tab ${activeTab === 'limits' ? 'active' : ''}`}
            onClick={() => setActiveTab('limits')}
          >
            Transaction Limits
          </button>
          <button
            className={`nav-tab ${activeTab === 'auth' ? 'active' : ''}`}
            onClick={() => setActiveTab('auth')}
          >
            Authentication
          </button>
          <button
            className={`nav-tab ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            Security Options
          </button>
          <button
            className={`nav-tab ${activeTab === 'devices' ? 'active' : ''}`}
            onClick={() => setActiveTab('devices')}
          >
            Devices
          </button>
        </nav>

        {/* Content */}
        <main className=\"settings-content\">
          {activeTab === 'limits' && renderTransactionLimits()}
          {activeTab === 'auth' && renderAuthenticationMethods()}
          {activeTab === 'security' && renderSecurityOptions()}
          {activeTab === 'devices' && renderBiometricDevices()}
        </main>

        {/* Actions */}
        <footer className=\"settings-actions\">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className=\"save-button\"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            onClick={initializeSettings}
            disabled={saving}
            className=\"reset-button\"
          >
            Reset to Current
          </button>
        </footer>
      </div>
    </div>
  )
}

export default CustomerSecuritySettings