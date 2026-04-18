/**
 * Severity levels for diagnoses and recommendations.
 * ordered from highest to lowest urgency for ranking.
 */
export const Severity = /** @type {const} */ ({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  INFO: "info"
})

export const SEVERITY_RANK = {
  [Severity.HIGH]: 3,
  [Severity.MEDIUM]: 2,
  [Severity.LOW]: 1,
  [Severity.INFO]: 0
}

/**
 * Diagnosis ids — what structural problem was detected.
 */
export const DiagnosisId = /** @type {const} */ ({
  RATE_LIMIT_DOMINANT: "RATE_LIMIT_DOMINANT",
  SERVER_ERROR_DOMINANT: "SERVER_ERROR_DOMINANT",
  TIMEOUT_DOMINANT: "TIMEOUT_DOMINANT",
  TAIL_LATENCY_INSTABILITY: "TAIL_LATENCY_INSTABILITY",
  RETRY_INEFFECTIVE: "RETRY_INEFFECTIVE",
  RETRY_EXHAUSTING: "RETRY_EXHAUSTING",
  CONCURRENCY_PRESSURE: "CONCURRENCY_PRESSURE",
  CIRCUIT_FREQUENT: "CIRCUIT_FREQUENT",
  DEDUPE_UNDERUTILIZED: "DEDUPE_UNDERUTILIZED",
  HEDGING_COST_HIGH: "HEDGING_COST_HIGH",
  HEDGING_BENEFICIAL: "HEDGING_BENEFICIAL",
  HIGH_ERROR_RATE: "HIGH_ERROR_RATE",
  LOW_THROUGHPUT_PRESSURE: "LOW_THROUGHPUT_PRESSURE",
  MIXED_ERROR_MODES: "MIXED_ERROR_MODES",
  CLIENT_NO_RETRY: "CLIENT_NO_RETRY",
  CLIENT_TIMEOUT_TIGHT: "CLIENT_TIMEOUT_TIGHT",
  RETRY_AFTER_UNHONORABLE: "RETRY_AFTER_UNHONORABLE"
})

/**
 * Recommendation ids — what action to suggest.
 */
export const RecommendationId = /** @type {const} */ ({
  ADD_RETRY: "ADD_RETRY",
  INCREASE_RETRY_LIMIT: "INCREASE_RETRY_LIMIT",
  REDUCE_RETRY_LIMIT: "REDUCE_RETRY_LIMIT",
  ENABLE_RETRY_AFTER: "ENABLE_RETRY_AFTER",
  SWITCH_EXPO_JITTER: "SWITCH_EXPO_JITTER",
  REDUCE_CONCURRENCY: "REDUCE_CONCURRENCY",
  INCREASE_TIMEOUT: "INCREASE_TIMEOUT",
  REDUCE_TIMEOUT: "REDUCE_TIMEOUT",
  ENABLE_CIRCUIT: "ENABLE_CIRCUIT",
  REDUCE_CIRCUIT_THRESHOLD: "REDUCE_CIRCUIT_THRESHOLD",
  ENABLE_DEDUPE: "ENABLE_DEDUPE",
  ENABLE_HEDGING: "ENABLE_HEDGING",
  INCREASE_HEDGE_DELAY: "INCREASE_HEDGE_DELAY",
  REDUCE_HEDGE_DELAY: "REDUCE_HEDGE_DELAY",
  ADD_RATE_LIMIT_STATUS_CODE: "ADD_RATE_LIMIT_STATUS_CODE",
  LOWER_CONCURRENCY_RATE_LIMIT: "LOWER_CONCURRENCY_RATE_LIMIT",
  USE_FFETCH_FOR_PLUGINS: "USE_FFETCH_FOR_PLUGINS"
})

/**
 * @typedef {object} ClientFacts
 * @property {string} clientName
 * @property {string} clientType
 * @property {number} total
 * @property {number} successCount
 * @property {number} failureCount
 * @property {number} successRate         0..1
 * @property {number} errorRate           0..1 (opposite of successRate)
 * @property {number} reliabilityScore    0..100
 * @property {number} http429Share        fraction of total that are 429
 * @property {number} http5xxShare        fraction of total that are 5xx
 * @property {number} timeoutShare        fraction of total that are timeout errors
 * @property {number} circuitShare        fraction of total that are circuit-open errors
 * @property {number} networkErrorShare   fraction of total that are low-level network errors (status 0)
 * @property {number} p50
 * @property {number} p95
 * @property {number} p99
 * @property {number} tailRatio           p99 / max(p95, 1)
 * @property {number} spreadRatio         p95 / max(p50, 1)
 * @property {number} throughputRps
 * @property {number} retryIncidence      fraction of requests that had at least one retry
 * @property {number} avgRetriesPerRequest
 * @property {number} retryMaxSaturation  fraction of requests that used all allowed retries
 * @property {number} failAfterRetryRate  fraction of requests that exhausted retries and still failed
 * @property {number} dedupeRate          fraction of requests that were served from dedupe
 * @property {number} transportRatio      transportAttempts / total (>1 indicates retries/hedging in transport)
 * @property {number} retryTransportRatio  extra attempts from retries only (totalRetries / total)
 * @property {number} hedgeTransportRatio  extra attempts from hedging only (transportRatio - 1 - retryTransportRatio, clamped ≥ 0)
 * @property {boolean} hasDedupePlugin
 * @property {boolean} hasCircuitPlugin
 * @property {boolean} hasHedgePlugin
 * @property {boolean} hasRetryConfig
 * @property {number} configuredRetryLimit   0 if no retry config
 * @property {boolean} hasRetryAfterConfig   true when retryAfterStatusCodes is configured and non-empty
 * @property {boolean} has429InRetryStatusCodes
 * @property {number} configuredTimeoutMs    0 = no timeout
 * @property {number} insufficientSampleFlag 0 = ok, 1 = marginal, 2 = insufficient
 */

/**
 * @typedef {object} RunFacts
 * @property {ClientFacts[]} clients
 * @property {number} clientCount
 * @property {boolean} hasRateLimitChaos   true when active chaos includes rateLimit
 * @property {boolean} hasRetryAfterChaos  true when rateLimit chaos has retryAfterMs > 0
 * @property {boolean} hasLatencyChaos
 * @property {boolean} hasFailRandomlyChaos
 * @property {number}  chaosFailRate       max random fail rate from chaos rules, 0 if none
 */

/**
 * @typedef {object} Diagnosis
 * @property {string} id               DiagnosisId value
 * @property {string} severity         Severity value
 * @property {string} clientName       which client this is for, or "cross-client" for run-wide
 * @property {string} summary          one-line human-readable description
 * @property {Record<string,number|string|boolean>} evidence  metrics used
 * @property {number} confidence       0..1 strength of signal
 */

/**
 * @typedef {object} Recommendation
 * @property {string} id               RecommendationId value
 * @property {string} clientName
 * @property {string} severity         Severity value
 * @property {string} title            concise action title
 * @property {string} description      why and what to do
 * @property {string[]} basedOn        DiagnosisId[] that triggered this
 * @property {Record<string,number|string|boolean>} evidence
 * @property {string[]} conflicts      RecommendationId[] that cannot coexist with this
 */

/**
 * @typedef {object} TakeawaysResult
 * @property {Diagnosis[]} diagnoses
 * @property {Recommendation[]} recommendations
 * @property {Array<{ clientName: string, recommendationId: string, ruleId: string, reason: string }>} blocked
 */
