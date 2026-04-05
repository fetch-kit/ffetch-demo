import ky from "ky"
import axios from "axios"
import { createClient as createFFetchClient } from "@fetchkit/ffetch"
import { dedupePlugin } from "@fetchkit/ffetch/plugins/dedupe"
import { circuitPlugin } from "@fetchkit/ffetch/plugins/circuit"

function withTraceHeader(init = {}, traceId, client = "unknown") {
  const headers = new Headers(init.headers || {})
  headers.set("x-arena-trace-id", traceId)
  headers.set("x-http-client", client)
  return { ...init, headers }
}

function createAttemptTrackerTransport(transport) {
  const attemptsByTrace = new Map()

  function extractTraceId(input, init) {
    if (input instanceof Request) {
      const fromRequest = input.headers.get("x-arena-trace-id")
      if (fromRequest) return fromRequest
    }
    const headers = new Headers(init?.headers || {})
    return headers.get("x-arena-trace-id") || ""
  }

  const wrappedTransport = async (input, init) => {
    const traceId = extractTraceId(input, init)
    if (traceId) {
      attemptsByTrace.set(traceId, (attemptsByTrace.get(traceId) || 0) + 1)
    }
    return transport(input, init)
  }

  return {
    transport: wrappedTransport,
    getAttempts(traceId) {
      return attemptsByTrace.get(traceId) || 0
    }
  }
}

export function createFetchAdapter(transport) {
  const tracker = createAttemptTrackerTransport(transport)
  return {
    name: "fetch",
    async request(url, init, meta = {}) {
      const traceId = String(meta.traceId || "")
      const tracedInit = withTraceHeader(init, traceId, "fetch")
      try {
        const response = await tracker.transport(url, tracedInit)
        return {
          response,
          attempts: tracker.getAttempts(traceId)
        }
      } catch (error) {
        if (error && typeof error === "object") {
          error.__arenaAttempts = tracker.getAttempts(traceId)
        }
        throw error
      }
    }
  }
}

export function createKyAdapter(state, transport) {
  const tracker = createAttemptTrackerTransport(transport)
  const kyConfig = state.clients.ky
  const retryDelay = (attempt) => {
    const raw = 2 ** Math.max(0, attempt - 1) * kyConfig.backoffBaseMs
    return Math.min(raw, kyConfig.backoffMaxMs)
  }

  const instance = ky.create({
    fetch: tracker.transport,
    timeout: kyConfig.timeoutMs,
    throwHttpErrors: kyConfig.throwHttpErrors,
    retry: {
      limit: kyConfig.retryLimit,
      methods: kyConfig.retryMethods,
      statusCodes: kyConfig.retryStatusCodes,
      delay: retryDelay
    }
  })

  return {
    name: "ky",
    async request(url, init, meta = {}) {
      const traceId = String(meta.traceId || "")
      const tracedInit = withTraceHeader(init, traceId, "ky")
      try {
        const response = await instance(url, tracedInit)
        return {
          response,
          attempts: tracker.getAttempts(traceId)
        }
      } catch (error) {
        // Handle ky HTTPError - extract the response object
        const attempts = tracker.getAttempts(traceId)
        if (error.response) {
          // HTTPError has a response property
          if (error && typeof error === "object") {
            error.__arenaAttempts = attempts
          }
          return {
            response: error.response,
            attempts
          }
        }
        // Non-HTTP error, re-throw
        if (error && typeof error === "object") {
          error.__arenaAttempts = attempts
        }
        throw error
      }
    }
  }
}

function createRetryDelay(mode, fixedMs) {
  if (mode === "fixed") return fixedMs
  return ({ attempt, response }) => {
    const retryAfter = response?.headers?.get?.("Retry-After")
    if (retryAfter) {
      const seconds = Number(retryAfter)
      if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
    }
    return 2 ** attempt * fixedMs + Math.random() * 100
  }
}

function extractTraceIdFromAxiosConfig(config) {
  let traceId = config.__traceId || ""
  if (!traceId && config.headers) {
    traceId =
      config.headers["x-arena-trace-id"] ||
      config.headers["X-Arena-Trace-Id"] ||
      Object.entries(config.headers).find(([key]) => key.toLowerCase() === "x-arena-trace-id")?.[1] ||
      ""
  }
  return String(traceId || "")
}

function normalizeAxiosHeaders(configHeaders, traceId) {
  const headers = new Headers(configHeaders || {})

  if (traceId) {
    headers.set("x-arena-trace-id", traceId)
  }

  if (!headers.has("x-demo-user")) {
    const existingUser = Array.from(headers.entries()).find(([k]) => k.toLowerCase() === "x-demo-user")?.[1]
    if (existingUser) {
      const existingUserKey = Array.from(headers.keys()).find((k) => k.toLowerCase() === "x-demo-user")
      if (existingUserKey) headers.delete(existingUserKey)
      headers.set("x-demo-user", existingUser)
    } else if (configHeaders?.["x-demo-user"]) {
      headers.set("x-demo-user", configHeaders["x-demo-user"])
    }
  }

  return headers
}

function buildAxiosTransportInit(config, headers, signal) {
  const init = {
    method: config.method?.toUpperCase() || "GET",
    headers,
    signal
  }

  if (config.data) {
    init.body = typeof config.data === "string" ? config.data : JSON.stringify(config.data)
  }

  return init
}

function parseAxiosResponseData(text) {
  if (text.length === 0) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function toAxiosAdapterResponse(response, config, data) {
  return {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    config,
    request: {}
  }
}

function headersToPlainObject(headers) {
  const out = {}
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value
    })
    return out
  }

  Object.assign(out, headers)
  return out
}

function buildAxiosRequestConfig(tracedInit, traceId) {
  const axiosConfig = {
    method: tracedInit.method || "GET",
    headers: headersToPlainObject(tracedInit.headers),
    data: tracedInit.body,
    validateStatus: () => true
  }

  axiosConfig.__traceId = traceId
  return axiosConfig
}

function toWebResponseFromAxios(axiosResponse, traceId) {
  const responseInit = {
    status: axiosResponse.status,
    statusText: axiosResponse.statusText,
    headers: new Headers(axiosResponse.headers)
  }
  responseInit.headers.set("x-arena-trace-id", traceId)

  const body = typeof axiosResponse.data === "string" ? axiosResponse.data : JSON.stringify(axiosResponse.data)
  return new Response(body, responseInit)
}

export function createFFetchAdapter(state, transport) {
  const cfg = state.clients.ffetch
  const tracker = createAttemptTrackerTransport(transport)
  const plugins = []

  if (cfg.useDedupePlugin) {
    plugins.push(
      dedupePlugin({
        ttl: cfg.dedupeTtlMs,
        sweepInterval: cfg.dedupeSweepIntervalMs,
        order: cfg.dedupeOrder
      })
    )
  }

  if (cfg.useCircuitPlugin) {
    plugins.push(
      circuitPlugin({
        threshold: cfg.circuitThreshold,
        reset: cfg.circuitResetMs,
        order: cfg.circuitOrder
      })
    )
  }

  const client = createFFetchClient({
    fetchHandler: tracker.transport,
    timeout: cfg.timeoutMs,
    retries: cfg.retries,
    retryDelay: createRetryDelay(cfg.retryDelayMode, cfg.retryDelayMs),
    throwOnHttpError: cfg.throwOnHttpError,
    plugins
  })

  return {
    name: "ffetch",
    async request(url, init, meta = {}) {
      const traceId = String(meta.traceId || "")
      const tracedInit = withTraceHeader(init, traceId, "ffetch")
      try {
        const response = await client(url, tracedInit)
        return {
          response,
          attempts: tracker.getAttempts(traceId)
        }
      } catch (error) {
        if (error && typeof error === "object") {
          error.__arenaAttempts = tracker.getAttempts(traceId)
        }
        throw error
      }
    },
    getMeta() {
      return {
        pending: client.pendingRequests.length,
        circuitOpen: "circuitOpen" in client ? Boolean(client.circuitOpen) : false
      }
    }
  }
}

export function createAxiosAdapter(state, transport) {
  const cfg = state.clients.axios
  const tracker = createAttemptTrackerTransport(transport)

  const instance = axios.create({
    adapter: async (config) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs)

      try {
        const traceId = extractTraceIdFromAxiosConfig(config)
        const url = config.url
        const headers = normalizeAxiosHeaders(config.headers, traceId)
        const init = buildAxiosTransportInit(config, headers, controller.signal)

        const response = await tracker.transport(url, init)
        const text = await response.text()

        clearTimeout(timeoutId)
        const data = parseAxiosResponseData(text)
        return toAxiosAdapterResponse(response, config, data)
      } catch (error) {
        clearTimeout(timeoutId)
        if (error.name === "AbortError") {
          const err = new Error("Request Timeout")
          err.code = "ECONNABORTED"
          throw err
        }
        throw error
      }
    }
  })

  return {
    name: "axios",
    async request(url, init, meta = {}) {
      const traceId = String(meta.traceId || "")
      const tracedInit = withTraceHeader(init, traceId, "axios")

      try {
        const axiosConfig = buildAxiosRequestConfig(tracedInit, traceId)

        const axiosResponse = await instance(url, axiosConfig)
        const response = toWebResponseFromAxios(axiosResponse, traceId)

        return {
          response,
          attempts: tracker.getAttempts(traceId)
        }
      } catch (error) {
        const attempts = tracker.getAttempts(traceId)
        if (error && typeof error === "object") {
          error.__arenaAttempts = attempts
        }
        throw error
      }
    }
  }
}
