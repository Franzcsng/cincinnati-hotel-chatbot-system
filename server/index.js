import './loadEnv.js'
import express from 'express'
import cors from 'cors'
import documentsRouter from './routes/documents.js'
import chatRouter from './routes/chat.js'
import contactRequestsRouter from './routes/contactRequests.js'
import statsRouter from './routes/stats.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/documents', documentsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/contact-requests', contactRequestsRouter)
app.use('/api/stats', statsRouter)

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
