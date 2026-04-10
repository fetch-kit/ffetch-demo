export function createChaosRuntime() {
  return {
    rateLimitDb: new Map(),
    failNthCounters: new WeakMap()
  }
}

export function resetChaosRuntime(runtime) {
  if (!runtime) return
  runtime.rateLimitDb.clear()
  runtime.failNthCounters = new WeakMap()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

async function applyRule(rule, req, runtime, effects) {
  if (!rule || !rule.type) return

  if (rule.type === "latency") {
    await sleep(Number(rule.ms || 0))
    return
  }

  if (rule.type === "latencyRange") {
    const minMs = Number(rule.minMs || 0)
    const maxMs = Number(rule.maxMs || minMs)
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
    await sleep(delay)
    return
  }

  if (rule.type === "fail") {
    effects.shortCircuit = new Response(String(rule.body || "Fail"), {
      status: Number(rule.status || 500)
    })
    return
  }

  if (rule.type === "failRandomly") {
    const rate = Number(rule.rate || 0)
    if (Math.random() < rate) {
      effects.shortCircuit = new Response(String(rule.body || "Random fail"), {
        status: Number(rule.status || 503)
      })
    }
    return
  }

  if (rule.type === "failNth") {
    const n = Math.max(1, Number(rule.n || 1))
    const prev = Number(runtime.failNthCounters.get(rule) || 0)
    const next = prev + 1
    if (next >= n) {
      runtime.failNthCounters.set(rule, 0)
      effects.shortCircuit = new Response(String(rule.body || `Failed on request #${n}`), {
        status: Number(rule.status || 500)
      })
    } else {
      runtime.failNthCounters.set(rule, next)
    }
    return
  }

  if (rule.type === "rateLimit") {
    const limit = Math.max(1, Number(rule.limit || 1))
    const windowMs = Math.max(1, Number(rule.windowMs || 1000))
    const keyHeader = "x-demo-user"
    
    // Case-insensitive header lookup for rate limit key
    let keyValue = req.headers.get(keyHeader)
    if (!keyValue) {
      // Try case-insensitive search
      const allHeaders = Array.from(req.headers.entries())
      const found = allHeaders.find(([k]) => k.toLowerCase() === keyHeader.toLowerCase())
      keyValue = found?.[1] || "unknown"
    }
    
    const key = `${keyHeader}:${keyValue}`
    const now = Date.now()
    const id = `${rule.type}:${keyHeader}:${limit}:${windowMs}:${key}`
    const entry = runtime.rateLimitDb.get(id)

    if (!entry || now > entry.reset) {
      runtime.rateLimitDb.set(id, { count: 1, reset: now + windowMs })
      return
    }

    entry.count += 1
    if (entry.count > limit) {
      const retryAfterMs = Number(rule.retryAfterMs || 0)
      const headers = retryAfterMs > 0
        ? { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) }
        : undefined
      effects.shortCircuit = new Response("Rate limit exceeded", { status: 429, headers })
    }
    return
  }

  if (rule.type === "throttle") {
    effects.throttle = {
      rate: Math.max(1, Number(rule.rate || 1024)),
      chunkSize: Math.max(1, Number(rule.chunkSize || 16384))
    }
  }
}

async function applyThrottle(response, throttle) {
  if (!throttle || !response?.body) return response
  const contentLength = Number(response.headers.get("content-length") || 0)
  if (contentLength > 0) {
    await sleep((contentLength / throttle.rate) * 1000)
    return response
  }

  const clone = response.clone()
  const text = await clone.text()
  await sleep((new TextEncoder().encode(text).length / throttle.rate) * 1000)
  return response
}

function createBrowserChaosClient(state, baseFetch, runtime) {
  const realFetch = baseFetch || fetch
  let networkRequestId = 0
  const stats = {
    totalTransportCalls: 0,
    shortCircuitedCalls: 0
  }

  const withNetworkId = (response) => {
    networkRequestId += 1
    const headers = new Headers(response.headers)
    headers.set("x-arena-network-id", String(networkRequestId))
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  }

  const client = async (input, init) => {
    stats.totalTransportCalls += 1
    const req = input instanceof Request ? new Request(input, init) : new Request(input, init)
    const effects = { shortCircuit: null, throttle: null }

    const rules = [...(state.chaosGlobal || [])]

    for (const rule of rules) {
      await applyRule(rule, req, runtime, effects)
      if (effects.shortCircuit) {
        stats.shortCircuitedCalls += 1
        const throttled = await applyThrottle(effects.shortCircuit, effects.throttle)
        return withNetworkId(throttled)
      }
    }

    try {
      const res = await realFetch(req)
      const throttled = await applyThrottle(res, effects.throttle)
      return withNetworkId(throttled)
    } finally {
      // no-op
    }
  }

  client.getRuntimeStats = () => ({
    totalTransportCalls: stats.totalTransportCalls,
    shortCircuitedCalls: stats.shortCircuitedCalls
  })

  return client
}

export async function createChaosTransport(state, baseFetch, runtime = createChaosRuntime()) {
  // In browsers, use a local chaos engine to avoid Node-only router internals.
  if (typeof window !== "undefined") {
    return createBrowserChaosClient(state, baseFetch, runtime)
  }

  try {
    const mod = await import("@fetchkit/chaos-fetch")
    return mod.createClient(
      {
        global: state.chaosGlobal,
        routes: {}
      },
      baseFetch || fetch
    )
  } catch {
    return createBrowserChaosClient(state, baseFetch, runtime)
  }
}
