import { Link } from 'react-router-dom'
import './ClientPage.css'

function ClientPage() {
  return (
    <div className="client-placeholder">
      <p className="client-placeholder-eyebrow">The Cincinnati Hotel</p>
      <h1>Guest site coming soon.</h1>
      <Link to="/" className="client-placeholder-link">
        &larr; Back home
      </Link>
    </div>
  )
}

export default ClientPage
