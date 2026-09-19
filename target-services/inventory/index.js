const express = require('express')
const app = express()
app.use(express.json())

const DB_URL = process.env.DB_URL || 'http://localhost:8084'

let chaos = { enabled: false, latency_ms: 0, error_rate: 0 }

app.use((req, res, next) => {
  if (req.path.startsWith('/_') || req.path === '/health') return next()
  if (!chaos.enabled) return next()
  setTimeout(() => {
    if (Math.random() < chaos.error_rate) {
      return res.status(500).json({ error: 'chaos-induced failure' })
    }
    next()
  }, chaos.latency_ms)
})

app.post('/_chaos', (req, res) => {
  chaos = { ...chaos, ...req.body }
  res.json({ applied: chaos })
})

app.delete('/_chaos', (req, res) => {
  chaos = { enabled: false, latency_ms: 0, error_rate: 0 }
  res.json({ cleared: true })
})

app.get('/check', async (req, res) => {
  try {
    const r = await fetch(`${DB_URL}/query`, {
      signal: AbortSignal.timeout(10000)
    })
    const data = await r.json()
    res.json({ source: 'inventory', available: true, db: data })
  } catch (e) {
    res.status(502).json({ error: 'db unreachable', detail: e.message })
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'inventory' }))

const PORT = process.env.PORT || 8082
app.listen(PORT, () => console.log(`inventory on :${PORT}`))
