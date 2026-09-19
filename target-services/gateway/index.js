const express = require('express')
const app = express()
app.use(express.json())

const ORDERS_URL = process.env.ORDERS_URL || 'http://localhost:8081'

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

app.get('/order', async (req, res) => {
  try {
    const r = await fetch(`${ORDERS_URL}/order`, {
      signal: AbortSignal.timeout(5000)
    })
    if (!r.ok) return res.status(r.status).json({ error: 'orders returned ' + r.status })
    const data = await r.json()
    res.json({ source: 'gateway', ...data })
  } catch (e) {
    res.status(502).json({ error: 'orders unreachable', detail: e.message })
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gateway' }))

const PORT = process.env.PORT || 8080
app.listen(PORT, () => console.log(`gateway on :${PORT}`))
