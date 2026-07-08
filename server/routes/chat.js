import { Router } from 'express'
import { randomUUID } from 'crypto'
import { supabase } from '../lib/supabaseClient.js'

const router = Router()

router.post('/sessions', async (req, res) => {
  const sessionId = randomUUID()

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ id: sessionId, started_at: new Date().toISOString() })
    .select()
    .single()

  if (error) {
    console.error('Failed to create chat session:', error)
    return res.status(500).json({ error: 'Failed to start chat session' })
  }

  res.status(201).json({ session: data })
})

router.post('/messages', async (req, res) => {
  const { session_id: sessionId, message } = req.body

  if (!sessionId || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'session_id and message are required' })
  }

  const webhookUrl = process.env.CHAT_WEBHOOK_URL
  if (!webhookUrl) {
    console.error('CHAT_WEBHOOK_URL is not configured')
    return res.status(500).json({ error: 'Chat is not configured' })
  }

  try { 
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message: message.trim() }),
    })

    if (!webhookResponse.ok) {
      console.error(`Chat webhook responded with status ${webhookResponse.status}`)
      return res.status(502).json({ error: 'Failed to reach the hotel assistant' })
    }

    const reply = await webhookResponse.json()
    res.status(200).json({ reply })
  } catch (error) {
    console.error('Failed to call chat webhook:', error)
    res.status(502).json({ error: 'Failed to reach the hotel assistant' })
  }
})

export default router
