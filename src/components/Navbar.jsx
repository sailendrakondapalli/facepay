import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Navbar.css'

export function Navbar() {
  const { user, profile, signOut } = useAuth()

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <div className="brand-icon">FP</div>
          <span className="brand-text">FacePay</span>
        </Link>

        <div className="navbar-menu">
          {!user ? (
            <>
              <Link to="/customer/login" className="btn btn-ghost btn-sm">Customer Login</Link>
              <Link to="/merchant/login" className="btn btn-ghost btn-sm">Merchant Login</Link>
              <Link to="/customer/register" className="btn btn-primary btn-sm">Get Started</Link>
            </>
          ) : (
            <>
              <span className="navbar-user">
                <span className="user-avatar">{profile?.full_name?.charAt(0) || 'U'}</span>
                <span className="user-name">{profile?.full_name}</span>
                <span className="badge badge-primary">{profile?.role}</span>
              </span>
              <button onClick={signOut} className="btn btn-ghost btn-sm">Sign Out</button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
