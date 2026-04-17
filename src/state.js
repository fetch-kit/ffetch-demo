function randomId(prefix = "client") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function createDefaultClientConfig(type) {
  if (type === "fetch") return { enabled: true }
  if (type === "axios") {
    return {
      enabled: true,
      timeoutMs: 3000
    }
  }
  if (type === "ky") {
    return {
      enabled: true,
      timeoutMs: 3000,
      retryLimit: 2,
      retryMethods: ["get"],
      retryStatusCodes: [408, 413, 429, 500, 502, 503, 504],
      retryAfterStatusCodes: [413, 429, 503],
      backoffMaxMs: 0,
      throwHttpErrors: true,
      backoffBaseMs: 0
    }
  }

  return {
    enabled: true,
    timeoutMs: 3000,
    retries: 2,
    retryDelayMode: "fixed",
    retryDelayMs: 0,
    throwOnHttpError: false,
    useDedupePlugin: false,
    dedupeTtlMs: 30000,
    dedupeSweepIntervalMs: 5000,
    useCircuitPlugin: false,
    circuitThreshold: 5,
    circuitResetMs: 10000,
    circuitOrder: 20,
    dedupeOrder: 10,
    useHedgePlugin: false,
    hedgeDelayMs: 50,
    hedgeMaxHedges: 1,
    hedgeOrder: 15
  }
}

export function createClientInstance(type = "fetch") {
  return {
    id: randomId(type),
    type,
    label: type,
    config: createDefaultClientConfig(type)
  }
}

export const defaultState = {
  scenarioPreset: "api-instability",
  chaosRulesExpanded: false,
  clientPanels: {
    fetch: false,
    axios: false,
    ky: false,
    ffetch: false
  },
  targetUrl: "https://jsonplaceholder.typicode.com/posts/1",
  requestCount: 60,
  concurrency: 6,
  payloadSizeBytes: 0,
  runMode: "compare-all",
  chaosGlobal: [
    { type: "latencyRange", minMs: 30, maxMs: 250 },
    { type: "failRandomly", rate: 0.2, status: 503, body: "Chaos random failure" },
    { type: "rateLimit", limit: 20, windowMs: 1000, retryAfterMs: 0 }
  ],
  clients: {
    fetch: {
      enabled: true
    },
    ky: {
      enabled: true,
      timeoutMs: 3000,
      retryLimit: 2,
      retryMethods: ["get"],
      retryStatusCodes: [408, 413, 429, 500, 502, 503, 504],
      retryAfterStatusCodes: [413, 429, 503],
      backoffMaxMs: 0,
      throwHttpErrors: true,
      backoffBaseMs: 0
    },
    ffetch: {
      enabled: true,
      timeoutMs: 3000,
      retries: 2,
      retryDelayMode: "fixed",
      retryDelayMs: 0,
      throwOnHttpError: false,
      useDedupePlugin: false,
      dedupeTtlMs: 30000,
      dedupeSweepIntervalMs: 5000,
      useCircuitPlugin: false,
      circuitThreshold: 5,
      circuitResetMs: 10000,
      circuitOrder: 20,
      dedupeOrder: 10,
      useHedgePlugin: false,
      hedgeDelayMs: 50,
      hedgeMaxHedges: 1,
      hedgeOrder: 15
    },
    axios: {
      enabled: true,
      timeoutMs: 3000
    }
  },
  clientInstances: [
    createClientInstance("fetch"),
    createClientInstance("axios"),
    createClientInstance("ky"),
    createClientInstance("ffetch")
  ]
}

export function createState() {
  return structuredClone(defaultState)
}

export function applyPreset(state, preset) {
  state.scenarioPreset = preset
  if (preset === "zero-config") {
    state.chaosGlobal = []
    state.requestCount = 40
    state.concurrency = 6
  }

  if (preset === "light") {
    state.chaosGlobal = [
      { type: "latencyRange", minMs: 20, maxMs: 100 },
      { type: "failRandomly", rate: 0.05, status: 503, body: "Light turbulence" }
    ]
    state.requestCount = 40
    state.concurrency = 5
  }
  if (preset === "api-instability") {
    state.chaosGlobal = [
      { type: "latencyRange", minMs: 50, maxMs: 300 },
      { type: "failRandomly", rate: 0.25, status: 503, body: "API unstable" }
    ]
    state.requestCount = 60
    state.concurrency = 6
  }
  if (preset === "meltdown-recovery") {
    state.chaosGlobal = [
      { type: "latencyRange", minMs: 80, maxMs: 500 },
      { type: "failNth", n: 3, status: 500, body: "Every third request fails" },
      { type: "failRandomly", rate: 0.15, status: 503, body: "Intermittent outage" }
    ]
    state.requestCount = 70
    state.concurrency = 7
  }
  if (preset === "rate-limited") {
    state.chaosGlobal = [
      { type: "latencyRange", minMs: 20, maxMs: 100 },
      { type: "rateLimit", limit: 10, windowMs: 1000, retryAfterMs: 1000 }
    ]
    state.requestCount = 60
    state.concurrency = 8
  }
  if (preset === "slow-network") {
    state.chaosGlobal = [
      { type: "latencyRange", minMs: 200, maxMs: 800 },
      { type: "throttle", rate: 512, chunkSize: 4096 },
      { type: "failRandomly", rate: 0.05, status: 503, body: "Connection dropped" }
    ]
    state.requestCount = 40
    state.concurrency = 4
  }

  if (preset === "burst-traffic") {
    state.chaosGlobal = [
      { type: "latencyRange", minMs: 30, maxMs: 140 },
      { type: "rateLimit", limit: 6, windowMs: 1000, retryAfterMs: 800 },
      { type: "failNth", n: 8, status: 503, body: "Burst overload" }
    ]
    state.requestCount = 80
    state.concurrency = 12
  }

  if (preset === "brownout") {
    state.chaosGlobal = [
      { type: "latencyRange", minMs: 80, maxMs: 500 },
      { type: "failRandomly", rate: 0.1, status: 503, body: "Service brownout" },
      { type: "failNth", n: 6, status: 500, body: "Periodic backend errors" }
    ]
    state.requestCount = 70
    state.concurrency = 7
  }

  if (preset === "strict-rate-limit") {
    state.chaosGlobal = [
      { type: "latencyRange", minMs: 25, maxMs: 90 },
      { type: "rateLimit", limit: 5, windowMs: 1000, retryAfterMs: 1500 }
    ]
    state.requestCount = 60
    state.concurrency = 10
  }

  if (preset === "degraded-backend") {
    state.chaosGlobal = [
      { type: "latencyRange", minMs: 150, maxMs: 700 },
      { type: "failRandomly", rate: 0.12, status: 503, body: "Degraded backend" },
      { type: "failNth", n: 5, status: 500, body: "Intermittent server failure" }
    ]
    state.requestCount = 65
    state.concurrency = 6
  }
}
