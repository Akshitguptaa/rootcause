const { parseArgs } = require('util')

const { values } = parseArgs({
  options: {
    target: { type: 'string', default: 'http://localhost:8080/order' },
    concurrency: { type: 'string', default: '50' },
    duration: { type: 'string', default: '15' },
    ramp: { type: 'boolean', default: false }
  }
})

const TARGET = values.target
const MAX_CONCURRENCY = parseInt(values.concurrency)
const DURATION = parseInt(values.duration)
const RAMP = values.ramp

let totalReqs = 0
let totalErrors = 0
let latencies = []
let running = true

function getConcurrency(elapsed) {
  if (!RAMP) return MAX_CONCURRENCY
  const progress = Math.min(1, elapsed / DURATION)
  return Math.max(2, Math.floor(MAX_CONCURRENCY * (0.1 + 0.9 * progress)))
}

function percentile(sorted, p) {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p))
  return sorted[idx]
}

async function worker(id) {
  while (running) {
    const start = Date.now()
    try {
      const r = await fetch(TARGET, { signal: AbortSignal.timeout(8000) })
      const elapsed = Date.now() - start
      latencies.push(elapsed)
      totalReqs++
      if (r.status >= 500) totalErrors++
    } catch (e) {
      const elapsed = Date.now() - start
      latencies.push(elapsed)
      totalReqs++
      totalErrors++
    }
    await new Promise(r => setTimeout(r, 10))
  }
}

async function main() {
  console.log(`\nloadgen → ${TARGET}`)
  console.log(`concurrency: ${MAX_CONCURRENCY} | duration: ${DURATION}s | ramp: ${RAMP}\n`)

  const startTime = Date.now()
  const workers = []

  for (let i = 0; i < MAX_CONCURRENCY; i++) {
    workers.push(worker(i))
  }

  const ticker = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000
    const sec = Math.floor(elapsed)
    const activeConcurrency = getConcurrency(elapsed)
    const sorted = [...latencies].sort((a, b) => a - b)
    const rps = totalReqs / Math.max(0.1, elapsed)
    const errRate = totalReqs > 0 ? (totalErrors / totalReqs) : 0

    const line = [
      `t=${String(sec).padStart(3)}s`,
      `rps=${rps.toFixed(1).padStart(7)}`,
      `p50=${String(percentile(sorted, 0.5)).padStart(5)}ms`,
      `p99=${String(percentile(sorted, 0.99)).padStart(5)}ms`,
      `err=${(errRate * 100).toFixed(1).padStart(5)}%`,
      `total=${totalReqs}`,
      `active=${activeConcurrency}`
    ].join(' | ')

    process.stdout.write('\r' + line)
  }, 1000)

  setTimeout(() => {
    running = false
    clearInterval(ticker)

    setTimeout(() => {
      const elapsed = (Date.now() - startTime) / 1000
      const sorted = [...latencies].sort((a, b) => a - b)
      const rps = totalReqs / elapsed
      const errRate = totalReqs > 0 ? totalErrors / totalReqs : 0

      console.log('\n\n--- results ---')
      console.log(`total requests: ${totalReqs}`)
      console.log(`total errors:   ${totalErrors}`)
      console.log(`duration:       ${elapsed.toFixed(1)}s`)
      console.log(`avg rps:        ${rps.toFixed(1)}`)
      console.log(`p50 latency:    ${percentile(sorted, 0.5)}ms`)
      console.log(`p95 latency:    ${percentile(sorted, 0.95)}ms`)
      console.log(`p99 latency:    ${percentile(sorted, 0.99)}ms`)
      console.log(`error rate:     ${(errRate * 100).toFixed(1)}%`)
      process.exit(0)
    }, 500)
  }, DURATION * 1000)
}

main()
