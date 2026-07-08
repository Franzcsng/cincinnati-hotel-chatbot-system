import ChatWidget from '../../components/ChatWidget.jsx'
import './ClientPage.css'

function ClientPage() {
  return (
    <div className="client-page">
      <section className="hero">
        <div className="hero-image-placeholder">Hero image placeholder</div>
        <div className="hero-content">
          <p className="hero-eyebrow">Downtown Cincinnati &middot; Over-the-Rhine</p>
          <h1 className="hero-title">The Cincinnati Hotel</h1>
          <p className="hero-tagline">Stay where the city began.</p>
          <p className="hero-intro">
            Tucked into the heart of Over-the-Rhine, our rooms blend the neighborhood's
            brick-and-iron history with modern comfort — steps from the city's best
            restaurants, live music, and game days.
          </p>
        </div>
      </section>

      <section className="chat-section">
        <p className="chat-section-eyebrow">Meet Your Hotel Assistant</p>
        <h2 className="chat-section-title">Have a question?</h2>
        <p className="chat-section-subtitle">
          If you have questions about our amenities, rooms, parking, or the neighborhood,
          just ask.
        </p>
        <ChatWidget />
      </section>
    </div>
  )
}

export default ClientPage
