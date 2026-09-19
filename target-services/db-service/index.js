const express = require('express')
const app = express()
app.use(express.json())

const tracker = require('../lib/tracker')('db-service')

let poolActive = 0
const POOL_MAX = 5

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

app.get('/_metrics', (req, res) => {
  tracker.setPool(poolActive, POOL_MAX)
  res.json(tracker.snapshot())
})

async function withPool(fn) {
  while (poolActive >= POOL_MAX) {
    await new Promise(r => setTimeout(r, 50))
  }
  poolActive++
  tracker.setPool(poolActive, POOL_MAX)
  try {
    return await fn()
  } finally {
    poolActive--
    tracker.setPool(poolActive, POOL_MAX)
  }
}

app.get('/query', async (req, res) => {
  const start = Date.now()
  await withPool(async () => {
    await new Promise(r => setTimeout(r, 5 + Math.random() * 10))
    tracker.record(Date.now() - start, true)
    res.json({
      source: 'db-service',
      rows: [{ id: 1, item: 'widget', qty: 100 }, { id: 2, item: 'gadget', qty: 47 }]
    })
  })
})

app.post('/write', async (req, res) => {
  const start = Date.now()
  await withPool(async () => {
    await new Promise(r => setTimeout(r, 8 + Math.random() * 12))
    tracker.record(Date.now() - start, true)
    res.json({ source: 'db-service', written: true, id: Date.now() })
  })
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'db-service' }))

const PORT = process.env.PORT || 8084
app.listen(PORT, () => console.log(`db-service on :${PORT}`))
