module.exports = function createTracker(serviceId) {
  const requests = []
  const downstream = {}
  let retryCount = 0
  let poolActive = null
  let poolMax = null

  function trimOld(arr) {
    const cutoff = Date.now() - 10000
    while (arr.length && arr[0].ts < cutoff) arr.shift()
  }

  return {
    record(latency_ms, success) {
      requests.push({ ts: Date.now(), latency_ms, success })
      trimOld(requests)
    },

    recordDownstream(target, latency_ms, hadError) {
      if (!downstream[target]) downstream[target] = []
      downstream[target].push({ ts: Date.now(), latency_ms, error: hadError })
      trimOld(downstream[target])
    },

    recordRetry() {
      retryCount++
    },

    setPool(active, max) {
      poolActive = active
      poolMax = max
    },

    snapshot() {
      const now = Date.now()
      const cutoff = now - 10000
      const recent = requests.filter(r => r.ts > cutoff)
      const latencies = recent.map(r => r.latency_ms).sort((a, b) => a - b)
      const total = recent.length
      const errors = recent.filter(r => !r.success).length

      const retryCutoff = now - 1000
      const recentRetries = retryCount

      const downstreamCalls = Object.entries(downstream).map(([target, calls]) => {
        const rc = calls.filter(c => c.ts > cutoff)
        const avg = rc.length ? rc.reduce((s, c) => s + c.latency_ms, 0) / rc.length : 0
        return {
          target,
          latency_ms: Math.round(avg * 100) / 100,
          errors: rc.filter(c => c.error).length,
          call_count: rc.length
        }
      })

      return {
        service_id: serviceId,
        timestamp: now / 1000,
        throughput_rps: Math.round((total / 10) * 10) / 10,
        latency_p50_ms: latencies[Math.floor(total * 0.5)] || 0,
        latency_p99_ms: latencies[Math.min(total - 1, Math.floor(total * 0.99))] || 0,
        error_rate: total > 0 ? Math.round((errors / total) * 1000) / 1000 : 0,
        retries_per_sec: recentRetries,
        pool_active: poolActive,
        pool_max: poolMax,
        downstream_calls: downstreamCalls
      }
    }
  }
}
