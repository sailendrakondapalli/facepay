import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import './CustomerDashboard.css'

export function CustomerDashboard() {
  const { profile, user } = useAuth()
  const [customerProfile, setCustomerProfile] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [todaySpending, setTodaySpending] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [user])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: custProfile } = await supabase
        .from('customer_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()
      setCustomerProfile(custProfile)

      if (custProfile) {
        const { data: txns } = await supabase
          .from('transactions')
          .select(`
            *,
            merchant:merchant_profiles(business_name)
          `)
          .eq('customer_id', custProfile.id)
          .order('created_at', { ascending: false })
          .limit(10)
        setTransactions(txns || [])

        const today = new Date().toISOString().split('T')[0]
        const todayTxns = (txns || []).filter(t => t.created_at.startsWith(today))
        const total = todayTxns.reduce((sum, t) => sum + parseFloat(t.amount), 0)
        setTodaySpending(total)
      }
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function toggleFacePay() {
    if (!customerProfile) return
    const newStatus = !customerProfile.facepay_enabled
    await supabase
      .from('customer_profiles')
      .update({ facepay_enabled: newStatus })
      .eq('id', customerProfile.id)
    setCustomerProfile({ ...customerProfile, facepay_enabled: newStatus })
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="customer-dashboard">
      <div className="dashboard-container">
        <div className="dashboard-welcome">
          <h1>Welcome, {profile?.full_name}</h1>
          <p className="text-muted">Manage your FacePay account and transactions</p>
        </div>

        <div className="demo-banner">
          ⚠ Demo Mode — All transactions are simulated
        </div>

        <div className="dashboard-cards">
          <div className="dash-card">
            <div className="dash-card-header">
              <span className="dash-card-label">FacePay Status</span>
              <span className={`badge ${customerProfile?.facepay_enabled ? 'badge-success' : 'badge-danger'}`}>
                {customerProfile?.facepay_enabled ? 'ACTIVE' : 'DISABLED'}
              </span>
            </div>
            <div className="dash-card-value">
              {customerProfile?.facepay_enabled ? 'Ready to Pay' : 'Inactive'}
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-card-label">FacePay ID</div>
            <div className="dash-card-value dash-card-mono">
              {customerProfile?.facepay_id || '—'}
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-card-label">Transaction Limit</div>
            <div className="dash-card-value">
              ₹{customerProfile?.transaction_limit?.toLocaleString('en-IN') || '—'}
            </div>
            <div className="dash-card-hint">Per transaction</div>
          </div>

          <div className="dash-card">
            <div className="dash-card-label">Today's Spending</div>
            <div className="dash-card-value">
              ₹{todaySpending.toLocaleString('en-IN')}
            </div>
            <div className="dash-card-hint">{new Date().toLocaleDateString('en-IN')}</div>
          </div>
        </div>

        <div className="dashboard-section">
          <h2>Recent Transactions</h2>
          {transactions.length === 0 ? (
            <div className="empty-state">
              <p>No transactions yet</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Transaction ID</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(txn => (
                    <tr key={txn.id}>
                      <td>{txn.merchant?.business_name || '—'}</td>
                      <td className="amount">₹{parseFloat(txn.amount).toLocaleString('en-IN')}</td>
                      <td>{new Date(txn.created_at).toLocaleString('en-IN')}</td>
                      <td>
                        <span className="badge badge-demo">{txn.status}</span>
                      </td>
                      <td className="mono-text">{txn.transaction_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <h2>Security Settings</h2>
          <div className="card-elevated">
            <div className="setting-row">
              <div>
                <div className="setting-label">FacePay Enabled</div>
                <div className="setting-hint">Allow biometric payments at merchant terminals</div>
              </div>
              <div className="toggle">
                <input
                  type="checkbox"
                  checked={customerProfile?.facepay_enabled || false}
                  onChange={toggleFacePay}
                />
                <span className="toggle-slider"></span>
              </div>
            </div>
            <div className="divider" />
            <div className="setting-item">
              <div className="setting-label">Transaction Limit</div>
              <div className="setting-value">₹{customerProfile?.transaction_limit?.toLocaleString('en-IN') || '—'}</div>
            </div>
            <div className="setting-item">
              <div className="setting-label">Last Authentication</div>
              <div className="setting-value text-muted">Not available (Demo)</div>
            </div>
            <div className="setting-item">
              <div className="setting-label">Account Status</div>
              <div className="setting-value">
                <span className="badge badge-success">ACTIVE</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
