import { createChaosRuntime, createChaosTransport, resetChaosRuntime } from "./chaosConfig"
import { createFetchAdapter, createKyAdapter, createFFetchAdapter, createAxiosAdapter } from "./clients"

function pctl(sorted, q) {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))
  return sorted[idx]
}

function createInFlightTracker() {
  return {
    current: 0,
    peak: 0,
    area: 0,
    startedAt: null,
    lastAt: null,
    change(delta, now = performance.now()) {
      if (this.startedAt == null) {
        this.startedAt = now
        this.lastAt = now
      }
      this.area += this.current * (now - this.lastAt)
      this.current = Math.max(0, this.current + delta)
      this.peak = Math.max(this.peak, this.current)
      this.lastAt = now
    },
    snapshot(now = performance.now()) {
      if (this.startedAt == null || this.lastAt == null) {
        return {
          peak: 0,
          average: 0
        }
      }
      this.area += this.current * (now - this.lastAt)
      this.lastAt = now
      const duration = Math.max(1, now - this.startedAt)
      return {
        peak: this.peak,
        average: this.area / duration
      }
    }
  }
}

function createObservedTransport(transport) {
  const tracker = createInFlightTracker()
  let attempts = 0

  return {
    transport: async (input, init) => {
      attempts += 1
      tracker.change(1)
      try {
        return await transport(input, init)
      } finally {
        tracker.change(-1)
      }
    },
    getStats() {
      const stats = tracker.snapshot()
      return {
        attempts,
        peak: stats.peak,
        average: stats.average
      }
    }
  }
}

function normalizeTransportRuntimeStats(stats) {
  return {
    totalTransportCalls: Math.max(0, Number(stats?.totalTransportCalls) || 0),
    shortCircuitedCalls: Math.max(0, Number(stats?.shortCircuitedCalls) || 0),
    upstreamFetchCalls: Math.max(0, Number(stats?.upstreamFetchCalls) || 0),
    upstreamFetchPeakInFlight: Math.max(0, Number(stats?.upstreamFetchPeakInFlight) || 0)
  }
}

function diffTransportRuntimeStats(current, baseline) {
  const c = normalizeTransportRuntimeStats(current)
  const b = normalizeTransportRuntimeStats(baseline)
  return {
    totalTransportCalls: Math.max(0, c.totalTransportCalls - b.totalTransportCalls),
    shortCircuitedCalls: Math.max(0, c.shortCircuitedCalls - b.shortCircuitedCalls),
    upstreamFetchCalls: Math.max(0, c.upstreamFetchCalls - b.upstreamFetchCalls),
    upstreamFetchPeakInFlight: c.upstreamFetchPeakInFlight
  }
}

function summarize(results) {
  const total = results.length
  const success = results.filter((r) => r.ok).length
  const thrown = results.filter((r) => !r.ok && r.errorName).length
  const timeoutCount = results.filter((r) => r.errorName === "TimeoutError").length
  const circuitCount = results.filter((r) => r.errorName === "CircuitOpenError").length
  const status5xx = results.filter((r) => r.status >= 500).length
  const lats = results.map((r) => r.elapsedMs).sort((a, b) => a - b)
  const totalElapsedMs = results.reduce((acc, row) => acc + row.elapsedMs, 0)
  const p50 = pctl(lats, 0.5)
  const p95 = pctl(lats, 0.95)
  const errorCounts = {}
  for (const row of results) {
    const key = row.ok ? "ok" : row.errorName || `HTTP_${row.status || 0}`
    errorCounts[key] = (errorCounts[key] || 0) + 1
  }

  const successRate = total ? success / total : 0
  const timeoutPenalty = total ? (timeoutCount / total) * 25 : 0
  const fatalPenalty = total ? (thrown / total) * 30 : 0
  const tailPenalty = Math.min(p95 / 1000, 1) * 10
  const reliabilityScore = Math.max(0, Math.min(100, successRate * 100 - timeoutPenalty - fatalPenalty - tailPenalty))

  return {
    total,
    success,
    thrown,
    timeoutCount,
    circuitCount,
    status5xx,
    throughputRps: Number((total / Math.max(totalElapsedMs / 1000, 0.001)).toFixed(2)),
    p50: Math.round(p50),
    p95: Math.round(p95),
    reliabilityScore: Number(reliabilityScore.toFixed(1)),
    errorCounts
  }
}

function buildRequestPlan(state) {
  const plans = []
  for (let i = 0; i < state.requestCount; i += 1) {
    const url = state.targetUrl

    plans.push({
      id: i + 1,
      url,
      method: "GET"
    })
  }
  return plans
}

async function runPool(items, concurrency, worker) {
  const out = []
  let index = 0

  async function next() {
    if (index >= items.length) return
    const current = index
    index += 1
    out[current] = await worker(items[current], current)
    await next()
  }

  const threads = []
  const size = Math.max(1, Math.min(concurrency, items.length))
  for (let i = 0; i < size; i += 1) threads.push(next())
  await Promise.all(threads)
  return out
}

async function runForAdapter(adapter, state, plans, onProgress, networkObserved) {
  let clientCompleted = 0
  const logicalTracker = createInFlightTracker()
  const rows = await runPool(plans, state.concurrency, async (plan) => {
    logicalTracker.change(1)
    const started = performance.now()
    const traceId = `${adapter.name}-${plan.id}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    try {
      const result = await adapter.request(
        plan.url,
        {
          method: plan.method,
          headers: {
            "x-demo-user": "arena"
          }
        },
        { traceId }
      )
      const response = result.response
      const attempts = Number(result.attempts || 1)
      const retries = Math.max(0, attempts - 1)
      const elapsedMs = performance.now() - started
      const row = {
        client: adapter.name,
        requestId: plan.id,
        ok: response.ok,
        status: response.status,
        networkId: response.headers.get("x-arena-network-id") || "",
        deduped: false,
        dedupeRole: "none",
        retries,
        elapsedMs,
        errorName: "",
        errorMessage: ""
      }
      clientCompleted += 1
      onProgress?.({
        type: "request-complete",
        client: adapter.name,
        clientCompleted,
        clientTotal: plans.length,
        requestId: plan.id,
        ok: response.ok,
        status: response.status
      })
      return row
    } catch (error) {
      const elapsedMs = performance.now() - started
      const err = error instanceof Error ? error : new Error(String(error))
      const attempts = Number(err.__arenaAttempts || 1)
      const retries = Math.max(0, attempts - 1)
      const row = {
        client: adapter.name,
        requestId: plan.id,
        ok: false,
        status: 0,
        networkId: "",
        deduped: false,
        dedupeRole: "none",
        retries,
        elapsedMs,
        errorName: err.name,
        errorMessage: err.message
      }
      clientCompleted += 1
      onProgress?.({
        type: "request-complete",
        client: adapter.name,
        clientCompleted,
        clientTotal: plans.length,
        requestId: plan.id,
        ok: false,
        status: 0,
        errorName: err.name
      })
      return row
    } finally {
      logicalTracker.change(-1)
    }
  })

  const logical = logicalTracker.snapshot()
  const network = networkObserved?.getStats?.() || { attempts: 0, peak: 0, average: 0 }
  const requestedConcurrency = Math.max(1, Number(state.concurrency) || 1)

  return {
    rows,
    runtime: {
      requestedConcurrency,
      logicalPeakInFlight: logical.peak,
      logicalAvgInFlight: Number(logical.average.toFixed(1)),
      transportPeakInFlight: network.peak,
      transportAvgInFlight: Number(network.average.toFixed(1)),
      transportAttempts: network.attempts,
      transportPeakVsRequestedPct: Number(((network.peak / requestedConcurrency) * 100).toFixed(1))
    }
  }
}

export async function runExperiment(state, options = {}) {
  const onProgress = options.onProgress
  const startedAt = new Date().toISOString()
  const plans = buildRequestPlan(state)

  const adapterFactories = []
  if (state.clients.fetch.enabled) adapterFactories.push((wrappedTransport) => createFetchAdapter(wrappedTransport))
  if (state.clients.axios.enabled) adapterFactories.push((wrappedTransport) => createAxiosAdapter(state, wrappedTransport))
  if (state.clients.ky.enabled) adapterFactories.push((wrappedTransport) => createKyAdapter(state, wrappedTransport))
  if (state.clients.ffetch.enabled) adapterFactories.push((wrappedTransport) => createFFetchAdapter(state, wrappedTransport))

  const totalRequests = plans.length * adapterFactories.length
  let totalCompleted = 0

  const clientNames = []
  if (state.clients.fetch.enabled) clientNames.push("fetch")
  if (state.clients.axios.enabled) clientNames.push("axios")
  if (state.clients.ky.enabled) clientNames.push("ky")
  if (state.clients.ffetch.enabled) clientNames.push("ffetch")

  onProgress?.({
    type: "run-start",
    clients: clientNames,
    totalClients: adapterFactories.length,
    requestsPerClient: plans.length,
    totalRequests
  })

  const byClient = []
  for (let index = 0; index < adapterFactories.length; index += 1) {
    const chaosRuntime = createChaosRuntime()
    const transport = await createChaosTransport(state, undefined, chaosRuntime)
    const observedTransport = createObservedTransport(transport)
    const adapter = adapterFactories[index](observedTransport.transport)
    onProgress?.({
      type: "client-start",
      client: adapter.name,
      clientIndex: index + 1,
      totalClients: adapterFactories.length,
      requestsPerClient: plans.length
    })
    const { rows, runtime } = await runForAdapter(adapter, state, plans, (event) => {
      if (event?.type === "request-complete") {
        totalCompleted += 1
        onProgress?.({
          ...event,
          totalCompleted,
          totalRequests
        })
        return
      }
      onProgress?.(event)
    }, observedTransport)

    if (adapter.name === "ffetch") {
      const byNetworkId = {}
      for (const row of rows) {
        if (!row.networkId) continue
        if (!byNetworkId[row.networkId]) byNetworkId[row.networkId] = []
        byNetworkId[row.networkId].push(row)
      }

      for (const netId of Object.keys(byNetworkId)) {
        const list = byNetworkId[netId]
        if (list.length <= 1) continue
        list.sort((a, b) => a.requestId - b.requestId)
        for (let i = 0; i < list.length; i += 1) {
          const row = list[i]
          if (i === 0) {
            row.dedupeRole = "origin"
            row.deduped = false
          } else {
            row.dedupeRole = "deduped"
            row.deduped = true
          }
        }
      }
    }

    byClient.push({
      client: adapter.name,
      summary: summarize(rows),
      runtime,
      rows
    })
    onProgress?.({
      type: "client-end",
      client: adapter.name,
      clientIndex: index + 1,
      totalClients: adapterFactories.length
    })
  }

  const endedAt = new Date().toISOString()
  onProgress?.({ type: "run-end" })
  return {
    startedAt,
    endedAt,
    clients: byClient
  }
}
