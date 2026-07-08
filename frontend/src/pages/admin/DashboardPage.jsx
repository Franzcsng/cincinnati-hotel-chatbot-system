import { useEffect, useState } from 'react'
import './DashboardPage.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const POLL_INTERVAL_MS = 8000

function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function fetchStats() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/stats`)
        if (!response.ok) throw new Error('Failed to load statistics')
        const data = await response.json()
        if (!cancelled) {
          setStats(data)
          setError('')
        }
      } catch {
        if (!cancelled) setError('Could not load statistics.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const answerRate =
    stats && stats.total_questions > 0
      ? Math.round((stats.answered_questions / stats.total_questions) * 100)
      : null

  const maxTopicCount =
    stats?.questions_by_topic.reduce((max, item) => Math.max(max, item.count), 0) ?? 0

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Dashboard</h1>

      {isLoading ? (
        <div className="admin-card admin-card--empty">
          <p>Loading statistics...</p>
        </div>
      ) : error ? (
        <div className="admin-card admin-card--empty">
          <p>{error}</p>
        </div>
      ) : (
        <>
          <div className="stat-tile-row">
            <div className="stat-tile">
              <span className="stat-tile-label">Total chat sessions</span>
              <span className="stat-tile-value">{stats.total_sessions.toLocaleString()}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Questions asked</span>
              <span className="stat-tile-value">{stats.total_questions.toLocaleString()}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Answer rate</span>
              <span className="stat-tile-value">
                {answerRate === null ? '—' : `${answerRate}%`}
              </span>
            </div>
          </div>

          <div className="admin-card">
            <h2 className="topic-breakdown-title">Questions by topic</h2>
            {stats.questions_by_topic.length === 0 ? (
              <p className="topic-breakdown-empty">No questions asked yet.</p>
            ) : (
              <ul className="topic-breakdown-list">
                {stats.questions_by_topic.map((item) => (
                  <li key={item.topic} className="topic-breakdown-row">
                    <span className="topic-breakdown-label" title={item.topic}>
                      {item.topic}
                    </span>
                    <div className="topic-breakdown-track">
                      <div
                        className="topic-breakdown-bar"
                        style={{
                          width: `${maxTopicCount ? (item.count / maxTopicCount) * 100 : 0}%`,
                        }}
                        title={`${item.topic}: ${item.count}`}
                      />
                    </div>
                    <span className="topic-breakdown-count">{item.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default DashboardPage
