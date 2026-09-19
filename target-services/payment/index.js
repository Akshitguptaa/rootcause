const express = require('express')
const app = express()
app.use(express.json())

const DB_URL = process.env.DB_URL || 'http://localhost:8084'
const tracker = require('../lib/tracker')('payment')

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

app.get('/_metrics', (req, res) => res.json(tracker.snapshot()))

app.get('/charge', async (req, res) => {
  const start = Date.now()
  try {
    const r = await fetch(`${DB_URL}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'charge', amount: 49.99 })
    })
    const elapsed = Date.now() - start
    const data = await r.json()
    tracker.record(elapsed, true)
    tracker.recordDownstream('db-service', elapsed, false)
    res.json({ source: 'payment', charged: true, tx: data })
  } catch (e) {
    const elapsed = Date.now() - start
    tracker.record(elapsed, false)
    tracker.recordDownstream('db-service', elapsed, true)
    res.status(502).json({ error: 'db unreachable', detail: e.message })
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'payment' }))

const PORT = process.env.PORT || 8083
app.listen(PORT, () => console.log(`payment on :${PORT}`))
