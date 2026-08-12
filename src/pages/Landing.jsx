import { Link } from 'react-router-dom'
import './Landing.css'

export function Landing() {
  return (
    <div className="landing">
      <div className="demo-banner-top">
        <div className="container">
          ⚠ Prototype — Real payments are not currently processed.
        </div>
      </div>

      <section className="hero">
        <div className="container">
          <div className="hero-badge">
            <span className="badge badge-demo">Phone-less Payment</span>
          </div>
          <h1 className="hero-title">
            Leave Your Phone Behind.<br />
            Your Face Is Your Payment Key.
          </h1>
          <p className="hero-subtitle">
            A phone-less biometric payment concept designed for the next generation of physical commerce.
          </p>
          <div className="hero-cta">
            <Link to="/customer/register" className="btn btn-primary btn-lg">Get Started</Link>
            <Link to="/customer/login" className="btn btn-outline btn-lg">Customer Login</Link>
            <Link to="/merchant/login" className="btn btn-outline btn-lg">Merchant Login</Link>
          </div>
          <a href="#how-it-works" className="hero-scroll">See How It Works ↓</a>
        </div>
      </section>

      <section id="how-it-works" className="section">
        <div className="container">
          <h2 className="section-title">How It Works</h2>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <h3>Register Once</h3>
              <p>Sign up with your name, contact info, and biometric profile.</p>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <h3>Connect Your Payment Identity</h3>
              <p>Link your UPI ID or payment account securely.</p>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <h3>Visit a Participating Merchant</h3>
              <p>Walk into any merchant with FacePay terminal support.</p>
            </div>
            <div className="step">
              <div className="step-number">4</div>
              <h3>Scan Your Face</h3>
              <p>The merchant identifies you through biometric recognition.</p>
            </div>
            <div className="step">
              <div className="step-number">5</div>
              <h3>Confirm the Amount</h3>
              <p>Review transaction details and provide confirmation.</p>
            </div>
            <div className="step">
              <div className="step-number">6</div>
              <h3>Complete Payment</h3>
              <p>Authenticate with your face and complete the transaction.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-dark">
        <div className="container">
          <h2 className="section-title">Why FacePay?</h2>
          <div className="features">
            <div className="feature">
              <div className="feature-icon">📱</div>
              <h3>Phone-less Payments</h3>
              <p>No need to carry your phone, wallet, or cards.</p>
            </div>
            <div className="feature">
              <div className="feature-icon">⚡</div>
              <h3>Fast Checkout</h3>
              <p>Complete transactions in seconds with biometric auth.</p>
            </div>
            <div className="feature">
              <div className="feature-icon">🔒</div>
              <h3>Biometric Authentication</h3>
              <p>Your face is unique — more secure than PINs or passwords.</p>
            </div>
            <div className="feature">
              <div className="feature-icon">🏪</div>
              <h3>Merchant-Friendly</h3>
              <p>Simple terminal interface for any business.</p>
            </div>
            <div className="feature">
              <div className="feature-icon">🛡️</div>
              <h3>Secure-by-Design Concept</h3>
              <p>Built with privacy and security as core principles.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section cta-section">
        <div className="container">
          <h2 className="cta-title">Ready to Experience the Future of Payments?</h2>
          <p className="cta-subtitle">Join FacePay today and leave your phone behind.</p>
          <Link to="/customer/register" className="btn btn-accent btn-lg">Create Your FacePay Profile</Link>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-brand">
            <div className="brand-icon">FP</div>
            <span className="brand-text">FacePay</span>
          </div>
          <p className="footer-disclaimer">
            FacePay is currently a prototype. No real money is transferred. Biometric authentication shown in this demo is simulated.
          </p>
          <p className="footer-copy">© 2026 FacePay. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
