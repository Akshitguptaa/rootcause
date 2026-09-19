const express = require('express')
const app = express()
app.use(express.json())

const DB_URL = process.env.DB_URL || 'http://localhost:8084'

app.get('/charge', async (req, res) => {
  try {
    const r = await fetch(`${DB_URL}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'charge', amount: 49.99 })
    })
    const data = await r.json()
    res.json({ source: 'payment', charged: true, tx: data })
  } catch (e) {
    res.status(502).json({ error: 'db unreachable', detail: e.message })
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'payment' }))

const PORT = process.env.PORT || 8083
app.listen(PORT, () => console.log(`payment on :${PORT}`))
