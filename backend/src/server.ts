// WEB SERVER - DISABLED for Desktop mode
// This Express server is kept for reference but not used in Desktop app
// Desktop app uses IPC communication instead of HTTP

/*
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import documentRoutes from './routes/documentRoutes.js'
import aiRoutes from './routes/aiRoutes.js'
import exportRoutes from './routes/exportRoutes.js'
import chatRoutes from './routes/chatRoutes.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error', details: err.message })
})

// Routes
app.use('/api/documents', documentRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/chat', chatRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Check for required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️  WARNING: GEMINI_API_KEY is not set in .env file')
  console.warn('   AI features will not work. Please add GEMINI_API_KEY to your .env file')
} else {
  console.log('✅ GEMINI_API_KEY is configured')
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
*/

// Desktop mode: Export services directly instead of HTTP routes
export { documentService } from './services/document.js'
export { geminiService } from './services/gemini.js'
export { exportService } from './services/export.js'
export { chatHistoryService } from './services/chatHistory.js'

