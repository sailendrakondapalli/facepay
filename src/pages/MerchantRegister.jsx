import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import './MerchantRegister.css'

export function MerchantRegister() {
  const [formData, setFormData] = useState({
    businessName: '',
    businessAddress: '',
    fullName: '',
    phone: '',
    email: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  function updateField(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formData.businessName || !formData.email || !formData.password) {
      setError('Business name, email, and password are required')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { user } = await signUp(
        formData.email,
        formData.password,
        'merchant',
        formData.fullName,
        formData.phone
      )

      const merchantId = `M-${Date.now().toString(36).toUpperCase()}`

      const { error: profileError } = await supabase.from('merchant_profiles').insert({
        user_id: user.id,
        business_name: formData.businessName,
        business_address: formData.businessAddress,
        merchant_id: merchantId,
      })

      if (profileError) throw profileError

      navigate('/merchant/dashboard')
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="merchant-register-page">
      <div className="merchant-register-container">
        <div className="register-header">
          <h1>Merchant Registration</h1>
          <p>Create your merchant account and start accepting FacePay</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label className="form-label">Business Name</label>
            <input
              type="text"
              placeholder="Your Store Name"
              value={formData.businessName}
              onChange={e => updateField('businessName', e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Business Address</label>
            <input
              type="text"
              placeholder="123 Main St, City"
              value={formData.businessAddress}
              onChange={e => updateField('businessAddress', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Contact Person Name</label>
            <input
              type="text"
              placeholder="Your full name"
              value={formData.fullName}
              onChange={e => updateField('fullName', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number</label>
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
              placeholder="merchant@business.com"
              value={formData.email}
              onChange={e => updateField('email', e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              placeholder="Create a strong password"
              value={formData.password}
              onChange={e => updateField('password', e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Create Merchant Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
