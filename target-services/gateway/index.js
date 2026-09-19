const express = require('express')
const app = express()
app.use(express.json())

const ORDERS_URL = process.env.ORDERS_URL || 'http://localhost:8081'

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
