// Customer Security Settings
// Interface for customers to configure authentication preferences and transaction limits

import React, { useState, useEffect } from 'react'
import { securitySettingsManager } from '../lib/security-settings-manager'
import { biometricAuthenticator } from '../lib/biometric-authenticator'
import './CustomerSecuritySettings.css'

const CustomerSecuritySettings = () => {
  const [customerId] = useState(`customer_${Date.now()}`)
  const [settings, setSettings] = useState(null)
  const [capabilities, setCapabilities] = useState([])
  
  const [formData, setFormData] = useState({
    maxTransactionAmount: 5000,
    dailyTransactionLimit: 25000,
    facePaymentEnabled: true,
    biometricPaymentEnabled: false,
    requireDualFactor: false,
    livenessDetectionEnabled: true
  })
  
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState('limits')

  useEffect(() => {
    initializeSettings()
  }, [])

  const initializeSettings = async () => {
    setLoading(true)
    try {
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

      const deviceCapabilities = await biometricAuthenticator.getSupportedBiometrics()
      setCapabilities(deviceCapabilities)
    } catch (error) {
      console.error('Failed to load settings:', error)
      setError('Failed to load security settings')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError('')
    setSuccess('')
  }

  const handleSaveSettings = async () => {
    if (formData.maxTransactionAmount > formData.dailyTransactionLimit) {
      setError('Per-transaction limit cannot exceed daily limit')
      return
    }

    if (!formData.facePaymentEnabled && !formData.biometricPaymentEnabled) {
      setError('At least one authentication method must be enabled')
      return
    }

    setSaving(true)
    setError('')

    try {
      const success = await securitySettingsManager.updateSecurityPreferences(customerId, formData)
      if (success) {
        setSuccess('Security settings updated successfully!')
        setTimeout(() => initializeSettings(), 1000)
      }
    } catch (error) {
      setError(error.message || 'Failed to save security settings')
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="settings-container loading-state">
        <div className="loading-spinner"></div>
        <p>Loading security settings...</p>
      </div>
    )
  }

  return (
    <div className="customer-security-settings">
      <div className="settings-container">
        <header className="settings-header">
          <h1>🛡️ Security Settings</h1>
          <p>Configure your FacePay authentication and security preferences</p>
        </header>

        {error && <div className="error-message">❌ {error}</div>}
        {success && <div className="success-message">✅ {success}</div>}

        <nav className="settings-nav">
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
        </nav>

        <main className="settings-content">
          {activeTab === 'limits' && (
            <div className="settings-section">
              <h3>💰 Transaction Limits</h3>
              <p className="section-description">Configure your spending limits</p>

              <div className="form-row">
                <div className="form-group">
                  <label>Per-Transaction Limit</label>
                  <div className="input-group">
                    <span className="input-prefix">₹</span>
                    <input
                      type="number"
                      value={formData.maxTransactionAmount}
                      onChange={(e) => handleInputChange('maxTransactionAmount', parseInt(e.target.value) || 0)}
                      min="1"
                      max="100000"
                    />
                  </div>
                  <small>Maximum amount for a single transaction (₹1 - ₹100,000)</small>
                </div>

                <div className="form-group">
                  <label>Daily Transaction Limit</label>
                  <div className="input-group">
                    <span className="input-prefix">₹</span>
                    <input
                      type="number"
                      value={formData.dailyTransactionLimit}
                      onChange={(e) => handleInputChange('dailyTransactionLimit', parseInt(e.target.value) || 0)}
                      min="1"
                      max="500000"
                    />
                  </div>
                  <small>Maximum total amount per day (₹1 - ₹500,000)</small>
                </div>
              </div>

              <div className="limits-preview">
                <h4>Current Limits Preview</h4>
                <div className="limits-grid">
                  <div className="limit-item">
                    <span className="limit-label">Per Transaction:</span>
                    <span className="limit-value">{formatCurrency(formData.maxTransactionAmount)}</span>
                  </div>
                  <div className="limit-item">
                    <span className="limit-label">Daily Total:</span>
                    <span className="limit-value">{formatCurrency(formData.dailyTransactionLimit)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'auth' && (
            <div className="settings-section">
              <h3>🔐 Authentication Methods</h3>
              <p className="section-description">Choose how you want to authenticate payments</p>

              <div className="auth-methods-config">
                <div className="auth-method-card">
                  <div className="method-header">
                    <div className="method-info">
                      <span className="method-icon">👤</span>
                      <div>
                        <h4>Face Payment</h4>
                        <p>Use face recognition for payment authentication</p>
                      </div>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={formData.facePaymentEnabled}
                        onChange={(e) => handleInputChange('facePaymentEnabled', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="method-status">
                    {capabilities.includes('face-recognition') ? (
                      <span className="status-available">✅ Available</span>
                    ) : (
                      <span className="status-unavailable">❌ Camera not available</span>
                    )}
                  </div>
                </div>

                <div className="auth-method-card">
                  <div className="method-header">
                    <div className="method-info">
                      <span className="method-icon">🔐</span>
                      <div>
                        <h4>Device Biometric</h4>
                        <p>Use your device's built-in biometric authentication</p>
                      </div>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={formData.biometricPaymentEnabled}
                        onChange={(e) => handleInputChange('biometricPaymentEnabled', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="method-status">
                    {capabilities.includes('webauthn-platform') ? (
                      <span className="status-available">✅ Available</span>
                    ) : (
                      <span className="status-unavailable">❌ Not supported</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="settings-section">
              <h3>🛡️ Security Options</h3>
              <p className="section-description">Advanced security features</p>

              <div className="security-options">
                <div className="option-item">
                  <div className="option-info">
                    <h4>Dual-Factor Authentication</h4>
                    <p>Require both face and device biometric</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={formData.requireDualFactor}
                      onChange={(e) => handleInputChange('requireDualFactor', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="option-item">
                  <div className="option-info">
                    <h4>Liveness Detection</h4>
                    <p>Enhanced face authentication with liveness verification</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={formData.livenessDetectionEnabled}
                      onChange={(e) => handleInputChange('livenessDetectionEnabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="settings-actions">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="save-button"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            onClick={initializeSettings}
            disabled={saving}
            className="reset-button"
          >
            Reset to Current
          </button>
        </footer>
      </div>
    </div>
  )
}

export default CustomerSecuritySettings
