import { useState } from 'react'
import './ContactForm.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

function ContactForm({ sessionId, topic, question, onSubmitted }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitting | error

  async function handleSubmit(event) {
    event.preventDefault()
    setStatus('submitting')

    try {
      const response = await fetch(`${API_BASE_URL}/api/contact-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          topic,
          question,
        }),
      })

      if (!response.ok) {
        throw new Error('Request failed')
      }

      onSubmitted()
    } catch {
      setStatus('error')
    }
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <p className="contact-form-title">Connect with our team</p>

      <input
        type="text"
        className="contact-form-input"
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <input
        type="email"
        className="contact-form-input"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <input
        type="tel"
        className="contact-form-input"
        placeholder="Phone (optional)"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
      />

      {status === 'error' && (
        <p className="contact-form-error">Something went wrong. Please try again.</p>
      )}

      <button type="submit" className="contact-form-submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Sending...' : 'Send'}
      </button>
    </form>
  )
}

export default ContactForm
