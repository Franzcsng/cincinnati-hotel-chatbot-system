import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import ContactForm from './ContactForm.jsx'
import './ChatWidget.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

function ChatWidget() {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const sessionIdRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  async function ensureSession() {
    if (sessionIdRef.current) return sessionIdRef.current

    const response = await fetch(`${API_BASE_URL}/api/chat/sessions`, {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('Could not start a chat session')
    }

    const data = await response.json()
    sessionIdRef.current = data.session.id
    return data.session.id
  }

  function markContactFormSubmitted(messageId) {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, contactFormSubmitted: true } : message,
      ),
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = inputValue.trim()
    if (!trimmed || isSending) return

    const userMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setError('')
    setIsSending(true)

    try {
      const sessionId = await ensureSession()

      const response = await fetch(`${API_BASE_URL}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: trimmed }),
      })

      if (!response.ok) {
        throw new Error('Message could not be delivered')
      }

      const data = await response.json()
      const replyText = data.reply?.agent_message

      if (!replyText) {
        throw new Error('Received an unexpected response from the assistant')
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: replyText,
          topic: data.reply?.topic,
          question: trimmed,
          showContactForm: Boolean(data.reply?.show_contact_form),
          contactFormSubmitted: false,
        },
      ])
    } catch {
      setError("Something went wrong sending your message. Please try again.")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="chat-widget">
      <div className="chat-widget-messages">
        {messages.length === 0 && (
          <p className="chat-widget-empty">
            Ask about rooms, amenities, parking, or what's nearby — your assistant is
            listening.
          </p>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`chat-turn chat-turn--${message.role}`}>
            <div className={`chat-bubble chat-bubble--${message.role}`}>
              {message.role === 'assistant' ? (
                <ReactMarkdown>{message.content}</ReactMarkdown>
              ) : (
                message.content
              )}
            </div>

            {message.role === 'assistant' && message.showContactForm && (
              message.contactFormSubmitted ? (
                <p className="contact-form-success">
                  Thanks! Our team will be in touch soon.
                </p>
              ) : (
                <ContactForm
                  sessionId={sessionIdRef.current}
                  topic={message.topic}
                  question={message.question}
                  onSubmitted={() => markContactFormSubmitted(message.id)}
                />
              )
            )}
          </div>
        ))}

        {isSending && (
          <div className="chat-turn chat-turn--assistant">
            <div className="chat-bubble chat-bubble--assistant chat-bubble--typing">
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && <p className="chat-widget-error">{error}</p>}

      <form className="chat-widget-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-widget-input"
          placeholder="Type your question..."
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          disabled={isSending}
        />
        <button
          type="submit"
          className="chat-widget-send"
          disabled={isSending || !inputValue.trim()}
        >
          Send
        </button>
      </form>
    </div>
  )
}

export default ChatWidget
