const express = require('express')
const app = express()
app.use(express.json())

const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:8082'
const PAYMENT_URL = process.env.PAYMENT_URL || 'http://localhost:8083'

async function fetchWithRetry(url, opts = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(3000) })
      if (r.ok) return r
    } catch (e) {
      if (attempt === 2) throw e
    }
  }
  throw new Error('all retries exhausted for ' + url)
}

app.get('/order', async (req, res) => {
  try {
    const [inv, pay] = await Promise.all([
      fetchWithRetry(`${INVENTORY_URL}/check`).then(r => r.json()),
      fetchWithRetry(`${PAYMENT_URL}/charge`).then(r => r.json())
    ])
    res.json({ source: 'orders', inventory: inv, payment: pay })
  } catch (e) {
    res.status(502).json({ error: 'downstream call failed', detail: e.message })
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'orders' }))

const PORT = process.env.PORT || 8081
app.listen(PORT, () => console.log(`orders on :${PORT}`))
