const express = require('express')
const app = express()
app.use(express.json())

const DB_URL = process.env.DB_URL || 'http://localhost:8084'

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
