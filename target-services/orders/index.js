const express = require('express')
const app = express()
app.use(express.json())

const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:8082'
const PAYMENT_URL = process.env.PAYMENT_URL || 'http://localhost:8083'
const tracker = require('../lib/tracker')('orders')

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

async function fetchWithRetry(url, target, opts = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const start = Date.now()
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(3000) })
      const elapsed = Date.now() - start
      if (r.ok) {
        tracker.recordDownstream(target, elapsed, false)
        return r
      }
      tracker.recordDownstream(target, elapsed, true)
    } catch (e) {
      const elapsed = Date.now() - start
      tracker.recordDownstream(target, elapsed, true)
      if (attempt === 2) throw e
      tracker.recordRetry()
    }
  }
  throw new Error('all retries exhausted for ' + url)
}

app.get('/order', async (req, res) => {
  const start = Date.now()
  try {
    const [inv, pay] = await Promise.all([
      fetchWithRetry(`${INVENTORY_URL}/check`, 'inventory').then(r => r.json()),
      fetchWithRetry(`${PAYMENT_URL}/charge`, 'payment').then(r => r.json())
    ])
    tracker.record(Date.now() - start, true)
    res.json({ source: 'orders', inventory: inv, payment: pay })
  } catch (e) {
    tracker.record(Date.now() - start, false)
    res.status(502).json({ error: 'downstream call failed', detail: e.message })
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'orders' }))

const PORT = process.env.PORT || 8081
app.listen(PORT, () => console.log(`orders on :${PORT}`))
