import { useNavigate } from 'react-router-dom'
import './LandingPage.css'

function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="landing">
      <div className="landing-content">
        <p className="landing-eyebrow">Downtown Cincinnati &middot; Over-the-Rhine</p>
        <h1 className="landing-title">The Cincinnati Hotel</h1>
        <p className="landing-tagline">Stay where the city began.</p>

        <div className="landing-actions">
          <button
            type="button"
            className="landing-btn landing-btn--primary"
            onClick={() => navigate('/client')}
          >
            I'm a Guest
          </button>
          <button
            type="button"
            className="landing-btn landing-btn--secondary"
            onClick={() => navigate('/admin')}
          >
            Admin Login
          </button>
        </div>
      </div>
    </div>
  )
}

export default LandingPage
