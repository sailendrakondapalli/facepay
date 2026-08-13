import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useToast } from './hooks/useToast'
import { Navbar } from './components/Navbar'
import { ToastContainer } from './components/Toast'
import { Landing } from './pages/Landing'
import { CustomerLogin } from './pages/CustomerLogin'
import { CustomerRegister } from './pages/CustomerRegister'
import { CustomerDashboard } from './pages/CustomerDashboard'
import CustomerSecuritySettings from './pages/CustomerSecuritySettings'
import { MerchantLogin } from './pages/MerchantLogin'
import { MerchantRegister } from './pages/MerchantRegister'
import { MerchantDashboard } from './pages/MerchantDashboard'
import EnhancedMerchantDashboard from './pages/EnhancedMerchantDashboard'

function ProtectedRoute({ children, role }) {
  const { user, profile, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
        <p>Loading...</p>
      </div>
    )
  }
  
  if (!user) {
    return <Navigate to="/" replace />
  }
  
  if (role && profile?.role !== role) {
    const redirectPath = profile?.role === 'customer' ? '/customer/dashboard' : '/merchant/dashboard'
    return <Navigate to={redirectPath} replace />
  }
  
  return children
}

function AppContent() {
  const { toasts, addToast, removeToast } = useToast()
  
  return (
    <div className="app">
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/customer/login" element={<CustomerLogin />} />
          <Route path="/customer/register" element={<CustomerRegister />} />
          <Route path="/merchant/login" element={<MerchantLogin />} />
          <Route path="/merchant/register" element={<MerchantRegister />} />
          <Route
            path="/customer/dashboard"
            element={
              <ProtectedRoute role="customer">
                <CustomerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customer/security"
            element={
              <ProtectedRoute role="customer">
                <CustomerSecuritySettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/merchant/dashboard"
            element={
              <ProtectedRoute role="merchant">
                <MerchantDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/merchant/enhanced"
            element={
              <ProtectedRoute role="merchant">
                <EnhancedMerchantDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}
