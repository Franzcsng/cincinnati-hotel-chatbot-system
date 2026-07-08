import { Router } from 'express'
import { supabase } from '../lib/supabaseClient.js'

const router = Router()

function normalizeTopic(rawTopic) {
  const trimmed = rawTopic?.trim()
  if (!trimmed) return 'Uncategorized'
  return trimmed.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
}

router.get('/', async (req, res) => {
  const { count: totalSessions, error: sessionsError } = await supabase
    .from('chat_sessions')
    .select('*', { count: 'exact', head: true })

  if (sessionsError) {
    console.error('Failed to count chat sessions:', sessionsError)
    return res.status(500).json({ error: 'Failed to load statistics' })
  }

  // Each exchange is logged as two rows (role='client' and role='assistant') with
  // identical topic/answered values. Filtering to 'client' avoids double-counting.
  const { data: questions, error: questionsError } = await supabase
    .from('messages')
    .select('topic, answered')
    .eq('role', 'client')

  if (questionsError) {
    console.error('Failed to load messages:', questionsError)
    return res.status(500).json({ error: 'Failed to load statistics' })
  }

  const topicCounts = new Map()
  let answeredCount = 0

  for (const question of questions) {
    const topic = normalizeTopic(question.topic)
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)
    if (question.answered) answeredCount += 1
  }

  const questionsByTopic = [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)

  res.status(200).json({
    total_sessions: totalSessions ?? 0,
    total_questions: questions.length,
    answered_questions: answeredCount,
    questions_by_topic: questionsByTopic,
  })
})

export default router
