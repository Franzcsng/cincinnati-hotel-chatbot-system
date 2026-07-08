import { Router } from 'express'

const router = Router()

router.post('/', async (req, res) => {
  const { session_id: sessionId, name, email, phone, topic, question } = req.body

  if (!sessionId || !name || !email) {
    return res.status(400).json({ error: 'session_id, name, and email are required' })
  }

  const webhookUrl = process.env.CONTACT_REQUEST_WEBHOOK_URL
  if (!webhookUrl) {
    console.error('CONTACT_REQUEST_WEBHOOK_URL is not configured')
    return res.status(500).json({ error: 'Contact requests are not configured yet' })
  }

  try {
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        name,
        email,
        phone: phone || null,
        topic: topic || null,
        question: question || null,
      }),
    })

    if (!webhookResponse.ok) {
      console.error(`Contact request webhook responded with status ${webhookResponse.status}`)
      return res.status(502).json({ error: 'Failed to submit your request' })
    }

    res.status(200).json({ status: 'submitted' })
  } catch (error) {
    console.error('Failed to call contact request webhook:', error)
    res.status(502).json({ error: 'Failed to submit your request' })
  }
})

export default router
