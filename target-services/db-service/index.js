const express = require('express')
const app = express()
app.use(express.json())

let poolActive = 0
const POOL_MAX = 5

async function withPool(fn) {
  while (poolActive >= POOL_MAX) {
    await new Promise(r => setTimeout(r, 50))
  }
  poolActive++
  try {
    return await fn()
  } finally {
    poolActive--
  }
}

app.get('/query', async (req, res) => {
  await withPool(async () => {
    await new Promise(r => setTimeout(r, 5 + Math.random() * 10))
    res.json({
      source: 'db-service',
      rows: [{ id: 1, item: 'widget', qty: 100 }, { id: 2, item: 'gadget', qty: 47 }]
    })
  })
})

app.post('/write', async (req, res) => {
  await withPool(async () => {
    await new Promise(r => setTimeout(r, 8 + Math.random() * 12))
    res.json({ source: 'db-service', written: true, id: Date.now() })
  })
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'db-service' }))

const PORT = process.env.PORT || 8084
app.listen(PORT, () => console.log(`db-service on :${PORT}`))
