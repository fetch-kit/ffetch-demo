import { Severity, DiagnosisId, SEVERITY_RANK } from "./types.js"

// ─── Thresholds ────────────────────────────────────────────────────────────────
const T = {
  // error-share dominance: fraction of total requests
  DOMINANT_429_SHARE: 0.12,
  DOMINANT_5XX_SHARE: 0.15,
  DOMINANT_TIMEOUT_SHARE: 0.10,
  DOMINANT_CIRCUIT_SHARE: 0.08,

  // high overall error rate
  HIGH_ERROR_RATE: 0.20,

  // tail latency ratios
  TAIL_RATIO_HIGH: 2.0,       // p99 / p95 >= 2x
  SPREAD_RATIO_HIGH: 3.0,     // p95 / p50 >= 3x

  // retry effectiveness thresholds
  RETRY_INCIDENCE_HIGH: 0.25,         // >25% requests had a retry
  FAIL_AFTER_RETRY_HIGH: 0.30,        // >30% of retried requests still failed
  RETRY_MAX_SATURATION_HIGH: 0.35,    // >35% hit max retries

  // concurrency pressure
  TRANSPORT_RATIO_HIGH: 1.6,          // >1.6x transport attempts per logical request

  // dedupe under-utilization
  DEDUPE_RATE_THRESHOLD: 0.05,        // < 5% deduped but plugin is on (low signal, just note)

  // hedging cost
  HEDGE_TRANSPORT_RATIO_HIGH: 1.8,    // >1.8 transport attempts per request means hedging is expensive

  // circuit open
  CIRCUIT_SHARE_FREQUENT: 0.08,

  // mixed error modes
  MODES_MIXED_THRESHOLD: 2,           // at least 2 dominant error modes coexist

  // insufficient samples
  SAMPLE_MARGINAL: 20,
  SAMPLE_INSUFFICIENT: 10,

  // client timeout tight relative to actual p95
  TIMEOUT_TO_P95_RATIO: 1.3,         // timeout <= 1.3 * p95 means timeout is very tight
}

/**
 * Build per-client derived facts from a raw result bucket and its client config.
 * @param {{ client: string, summary: object, runtime: object, rows: object[] }} bucket
 * @param {{ type: string, config: object }} instance - matching state.clientInstances entry
 * @returns {import('./types.js').ClientFacts}
 */
export function extractClientFacts(bucket, instance) {
  const summary = bucket.summary || {}
  const runtime = bucket.runtime || {}
  const rows = bucket.rows || []
  const cfg = instance?.config || {}
  const type = instance?.type || "unknown"

  const total = Math.max(1, summary.total || 0)
  const successCount = summary.success || 0
  const failureCount = total - successCount

  const errorCounts = summary.errorCounts || {}
  const http429Count = errorCounts["HTTP_429"] || 0
  const http5xxCount = Object.entries(errorCounts)
    .filter(([k]) => /^HTTP_[5]\d{2}$/.test(k))
    .reduce((s, [, v]) => s + v, 0)
  const timeoutCount = errorCounts["TimeoutError"] || 0
  const circuitCount = errorCounts["CircuitOpenError"] || 0
  const networkErrorCount = rows.filter(r => !r.ok && r.status === 0 && !r.errorName).length

  const retryList = rows.map(r => r.retries || 0)
  const retryIncidenceCount = retryList.filter(r => r > 0).length
  const totalRetries = retryList.reduce((s, r) => s + r, 0)
  const configuredRetryLimit = cfg.retries ?? cfg.retryLimit ?? 0
  const maxSaturationCount = configuredRetryLimit > 0
    ? retryList.filter(r => r >= configuredRetryLimit).length
    : 0

  // rows with retries but still failed
  const failAfterRetryCount = rows.filter(r => (r.retries || 0) > 0 && !r.ok).length

  const dedupeCount = rows.filter(r => r.deduped).length

  const transportAttempts = runtime.transportAttempts || 0
  const transportRatio = transportAttempts / total

  // capability flags
  const hasRetryConfig = configuredRetryLimit > 0
  const hasRetryAfterConfig = Array.isArray(cfg.retryAfterStatusCodes) && cfg.retryAfterStatusCodes.length > 0
  const has429InRetryStatusCodes = Array.isArray(cfg.retryStatusCodes) && cfg.retryStatusCodes.includes(429)
  const hasDedupePlugin = Boolean(cfg.useDedupePlugin)
  const hasCircuitPlugin = Boolean(cfg.useCircuitPlugin)
  const hasHedgePlugin = Boolean(cfg.useHedgePlugin)
  const configuredTimeoutMs = cfg.timeoutMs ?? 0

  const p50 = summary.p50 || 0
  const p95 = summary.p95 || 0
  const p99 = summary.p99 || 0
  const tailRatio = p99 / Math.max(p95, 1)
  const spreadRatio = p95 / Math.max(p50, 1)

  const sampleN = summary.latencyN || total
  const insufficientSampleFlag =
    sampleN < T.SAMPLE_INSUFFICIENT ? 2
    : sampleN < T.SAMPLE_MARGINAL ? 1
    : 0

  return {
    clientName: bucket.client,
    clientType: type,
    total,
    successCount,
    failureCount,
    successRate: successCount / total,
    errorRate: failureCount / total,
    reliabilityScore: summary.reliabilityScore || 0,
    http429Share: http429Count / total,
    http5xxShare: http5xxCount / total,
    timeoutShare: timeoutCount / total,
    circuitShare: circuitCount / total,
    networkErrorShare: networkErrorCount / total,
    p50,
    p95,
    p99,
    tailRatio,
    spreadRatio,
    throughputRps: summary.throughputRps || 0,
    retryIncidence: retryIncidenceCount / total,
    avgRetriesPerRequest: totalRetries / total,
    retryMaxSaturation: maxSaturationCount / total,
    failAfterRetryRate: retryIncidenceCount > 0 ? failAfterRetryCount / retryIncidenceCount : 0,
    dedupeRate: dedupeCount / total,
    transportRatio,
    retryTransportRatio: totalRetries / total,
    hedgeTransportRatio: Math.max(0, transportRatio - 1 - totalRetries / total),
    hasDedupePlugin,
    hasCircuitPlugin,
    hasHedgePlugin,
    hasRetryConfig,
    configuredRetryLimit,
    retryDelayMode: cfg.retryDelayMode || "fixed",
    hasRetryAfterConfig,
    has429InRetryStatusCodes,
    configuredTimeoutMs,
    insufficientSampleFlag
  }
}

/**
 * Build run-wide facts from the chaos configuration.
 * @param {object} state - full arena state
 * @returns {Pick<import('./types.js').RunFacts, 'hasRateLimitChaos'|'hasRetryAfterChaos'|'hasLatencyChaos'|'hasFailRandomlyChaos'|'chaosFailRate'>}
 */
export function extractRunFacts(state) {
  const rules = state?.chaosGlobal || []
  const rateLimitRule = rules.find(r => r.type === "rateLimit")
  const failRandomlyRule = rules.find(r => r.type === "failRandomly")
  return {
    hasRateLimitChaos: Boolean(rateLimitRule),
    hasRetryAfterChaos: Boolean(rateLimitRule) && (rateLimitRule.retryAfterMs || 0) > 0,
    hasLatencyChaos: rules.some(r => r.type === "latency" || r.type === "latencyRange"),
    hasFailRandomlyChaos: Boolean(failRandomlyRule),
    chaosFailRate: failRandomlyRule ? (failRandomlyRule.rate || 0) : 0
  }
}
