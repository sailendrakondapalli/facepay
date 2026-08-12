import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { BiometricCamera } from '../components/BiometricCamera'
import { enrollFace } from '../lib/biometric-api'
import './CustomerRegister.css'

export function CustomerRegister() {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    biometricData: null,
    paymentId: '',
    transactionLimit: 1000,
  })
  const [showCamera, setShowCamera] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [enrollmentStatus, setEnrollmentStatus] = useState(null)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  function updateField(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  async function handleStep1Next() {
    if (!formData.fullName || !formData.phone || !formData.email || !formData.password) {
      setError('All fields are required')
      return
    }
    setStep(2)
  }

  function handleStep2Next() {
    if (!formData.biometricData) {
      setError('Please capture your biometric data')
      return
    }
    setStep(3)
  }

  function handleStep3Next() {
    if (!formData.paymentId) {
      setError('Payment identifier is required')
      return
    }
    setStep(4)
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    setEnrollmentStatus('Creating account...')
    
    try {
      // Step 1: Create authentication account
      const { user } = await signUp(
        formData.email,
        formData.password,
        'customer',
        formData.fullName,
        formData.phone
      )

      const facepayId = `FP-${Date.now().toString(36).toUpperCase()}`

      // Step 2: Create customer profile FIRST (required for biometric enrollment)
      setEnrollmentStatus('Creating customer profile...')
      
      const { data: customerProfile, error: profileError } = await supabase.from('customer_profiles').insert({
        user_id: user.id,
        facepay_id: facepayId,
        face_reference: 'biometric', // Marker indicating real biometric enrollment
        payment_identifier: formData.paymentId,
        transaction_limit: formData.transactionLimit,
        facepay_enabled: true,
      }).select().single()

      if (profileError) throw profileError

      // Step 3: Enroll biometric data via Edge Function (after profile exists)
      setEnrollmentStatus('Enrolling biometric data...')
      
      try {
        const enrollmentResult = await enrollFace(formData.biometricData)
        
        if (!enrollmentResult.success) {
          console.warn('Biometric enrollment failed, but continuing with profile creation')
          setError(`Biometric enrollment failed: ${enrollmentResult.error || 'Unknown error'}. Your account was created but biometric authentication may not work properly.`)
        } else {
          console.log('Biometric enrollment successful:', enrollmentResult)
        }
      } catch (enrollError) {
        console.error('Biometric enrollment error:', enrollError)
        setError(`Biometric enrollment failed: ${enrollError.message}. Your account was created but biometric authentication may not work properly.`)
        // Continue anyway - account is still usable
      }

      setEnrollmentStatus('Registration complete!')
      
      // Navigate to dashboard after short delay
      setTimeout(() => {
        navigate('/customer/dashboard')
      }, 1500)
      
    } catch (err) {
      console.error('Registration error:', err)
      setError(err.message || 'Registration failed')
      setEnrollmentStatus(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleBiometricCapture(biometricData) {
    // Store the complete biometric data for enrollment during final submission
    updateField('biometricData', biometricData)
    setShowCamera(false)
    setError(null)
  }

  return (
    <div className="register-page">
      <div className="register-container">
        <div className="register-header">
          <h1>Create Your FacePay Profile</h1>
          <p>Step {step} of 4</p>
        </div>

        <div className="register-steps-bar">
          {[1,2,3,4].map(i => (
            <div key={i} className={`step-bar-item ${i <= step ? 'active' : ''}`} />
          ))}
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="register-form animate-in">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                placeholder="Enter your full name"
                value={formData.fullName}
                onChange={e => updateField('fullName', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile Number</label>
              <input
                type="tel"
                placeholder="+91 XXXXX XXXXX"
                value={formData.phone}
                onChange={e => updateField('phone', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={e => updateField('email', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                placeholder="Create a strong password"
                value={formData.password}
                onChange={e => updateField('password', e.target.value)}
              />
            </div>
            <button onClick={handleStep1Next} className="btn btn-primary btn-full btn-lg">
              Continue
            </button>
          </div>
        )}

        {step === 2 && !showCamera && (
          <div className="register-form animate-in">
            <div className="face-setup">
              <h3>Biometric Registration</h3>
              <p className="text-muted">
                Capture your face for real biometric authentication. This uses MediaPipe FaceMesh with liveness detection.
              </p>
              {formData.biometricData && (
                <div className="face-preview">
                  <img src={formData.biometricData.imageData} alt="Captured face" />
                  <div className="biometric-info">
                    <p>✓ Biometric data captured</p>
                    <p className="text-muted">Quality: {Math.round(formData.biometricData.quality * 100)}%</p>
                    {formData.biometricData.metadata?.livenessVerified && (
                      <p className="text-muted">✓ Liveness verified</p>
                    )}
                  </div>
                  <button onClick={() => updateField('biometricData', null)} className="btn btn-ghost btn-sm">
                    Retake
                  </button>
                </div>
              )}
              {!formData.biometricData && (
                <button onClick={() => setShowCamera(true)} className="btn btn-accent btn-full btn-lg">
                  Start Biometric Capture
                </button>
              )}
              {formData.biometricData && (
                <button onClick={handleStep2Next} className="btn btn-primary btn-full btn-lg">
                  Continue
                </button>
              )}
              <button onClick={() => setStep(1)} className="btn btn-ghost btn-full">
                Back
              </button>
            </div>
          </div>
        )}

        {step === 2 && showCamera && (
          <div className="animate-scale">
            <BiometricCamera
              onSuccess={handleBiometricCapture}
              onCancel={() => setShowCamera(false)}
              mode="enroll"
              requireLiveness={true}
              showInstructions={true}
            />
          </div>
        )}

        {step === 3 && (
          <div className="register-form animate-in">
            <h3>Payment Profile</h3>
            <p className="text-muted">
              Link your payment identifier. This is demo only — do NOT enter real sensitive credentials.
            </p>
            <div className="form-group">
              <label className="form-label">UPI ID / Demo Payment Identifier</label>
              <input
                type="text"
                placeholder="yourname@upi"
                value={formData.paymentId}
                onChange={e => updateField('paymentId', e.target.value)}
              />
              <span className="form-hint">Do NOT enter UPI PIN, OTP, CVV, or bank password</span>
            </div>
            <div className="demo-banner">
              ⚠ Demo Mode: Real payment accounts will NOT be charged
            </div>
            <button onClick={handleStep3Next} className="btn btn-primary btn-full btn-lg">
              Continue
            </button>
            <button onClick={() => setStep(2)} className="btn btn-ghost btn-full">
              Back
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="register-form animate-in">
            <h3>Security Settings</h3>
            <p className="text-muted">Set your transaction limit and enable FacePay.</p>
            <div className="form-group">
              <label className="form-label">Transaction Limit (₹ per transaction)</label>
              <input
                type="number"
                min="100"
                max="10000"
                step="100"
                value={formData.transactionLimit}
                onChange={e => updateField('transactionLimit', parseInt(e.target.value) || 1000)}
              />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">Enable FacePay</div>
                <div className="setting-hint">Allow biometric payments</div>
              </div>
              <div className="toggle">
                <input type="checkbox" defaultChecked disabled />
                <span className="toggle-slider"></span>
              </div>
            </div>
            
            {enrollmentStatus && (
              <div className="alert alert-info">
                {enrollmentStatus}
              </div>
            )}
            
            <button onClick={handleSubmit} className="btn btn-accent btn-full btn-lg" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create FacePay Profile'}
            </button>
            <button onClick={() => setStep(3)} className="btn btn-ghost btn-full" disabled={loading}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
