import { Severity, DiagnosisId, RecommendationId } from "./types.js"
import { applyCrossConfigRules } from "./crossConfigRules.js"

/**
 * Generate guarded recommendations for a client given its diagnoses and facts.
 * Each recommendation is only emitted when all guards pass.
 *
 * @param {import('./types.js').Diagnosis[]} diagnoses - diagnoses for this client
 * @param {import('./types.js').ClientFacts} facts
 * @param {import('./types.js').RunFacts} runFacts
 * @param {{ includeBlocked?: boolean }} [options]
 * @returns {import('./types.js').Recommendation[] | { recommendations: import('./types.js').Recommendation[], blocked: Array<{ id: string, recommendationId: string, reason: string }> }}
 */
export function recommendForClient(diagnoses, facts, runFacts, options = {}) {
  const diagnosed = new Set(diagnoses.map(d => d.id))
  const results = []

  // With hedging enabled, retries can multiply transport load quickly.
  // Avoid retry suggestions when hedge overhead is already high.
  // Guard: hedge + retries both genuinely amplifying transport (not just one side)
  const hedgeRetryAmplificationHigh = facts.hedgeTransportRatio >= 0.3 && facts.retryTransportRatio >= 0.3
  // Inverse guard: avoid suggesting hedging when retries are already
  // causing significant amplification pressure.
  const retryHedgeAmplificationHigh = facts.retryTransportRatio >= 1.5

  function emit(id, severity, title, description, basedOn, evidence, conflicts = []) {
    results.push({ id, clientName: facts.clientName, severity, title, description, basedOn, evidence, conflicts })
  }

  // ─── Retry-related ──────────────────────────────────────────────────────────

  // Add retry — client has no retry but many failures (only for retryable clients)
  if (diagnosed.has(DiagnosisId.CLIENT_NO_RETRY) && facts.clientType !== "fetch") {
    if (!hedgeRetryAmplificationHigh) {
      const hedgeAware = facts.hasHedgePlugin
      emit(
        RecommendationId.ADD_RETRY,
        Severity.HIGH,
        "Enable retries",
        hedgeAware
          ? `${pct(facts.errorRate)} of requests are failing with no retry configured. Because hedging is enabled, start conservatively with 1 retry to avoid excessive request amplification.`
          : `${pct(facts.errorRate)} of requests are failing with no retry configured. Adding 2–3 retries would recover many transient failures.`,
        [DiagnosisId.CLIENT_NO_RETRY],
        {
          errorRate: facts.errorRate,
          successRate: facts.successRate,
          hasHedgePlugin: facts.hasHedgePlugin,
          transportRatio: facts.transportRatio
        },
        [RecommendationId.REDUCE_RETRY_LIMIT]
      )
    }
  }

  // Increase retry limit — retries are exhausting and still failing
  if (
    diagnosed.has(DiagnosisId.RETRY_EXHAUSTING) &&
    diagnosed.has(DiagnosisId.RETRY_INEFFECTIVE) &&
    facts.configuredRetryLimit > 0 &&
    facts.configuredRetryLimit < 5
  ) {
    emit(
      RecommendationId.INCREASE_RETRY_LIMIT,
      Severity.MEDIUM,
      "Increase retry limit",
      `${pct(facts.retryMaxSaturation)} of requests hit the configured limit of ${facts.configuredRetryLimit}. Increasing to ${facts.configuredRetryLimit + 2} may recover more.`,
      [DiagnosisId.RETRY_EXHAUSTING, DiagnosisId.RETRY_INEFFECTIVE],
      { current: facts.configuredRetryLimit, retryMaxSaturation: facts.retryMaxSaturation },
      [RecommendationId.REDUCE_RETRY_LIMIT]
    )
  }

  // Reduce retry limit — retrying is causing transport pressure but failures persist; cutting is better
  if (
    diagnosed.has(DiagnosisId.RETRY_INEFFECTIVE) &&
    !diagnosed.has(DiagnosisId.RETRY_EXHAUSTING) &&
    facts.configuredRetryLimit >= 3 &&
    facts.failAfterRetryRate >= 0.6
  ) {
    emit(
      RecommendationId.REDUCE_RETRY_LIMIT,
      Severity.LOW,
      "Reduce retry limit — retries are not recovering failures",
      `${pct(facts.failAfterRetryRate)} of retried requests still fail. Retrying ${facts.configuredRetryLimit} times is adding latency without benefit.`,
      [DiagnosisId.RETRY_INEFFECTIVE],
      { failAfterRetryRate: facts.failAfterRetryRate, configuredRetryLimit: facts.configuredRetryLimit },
      [RecommendationId.ADD_RETRY, RecommendationId.INCREASE_RETRY_LIMIT]
    )
  }

  // Enable Retry-After — chaos sends it but client can't honor it
  if (
    diagnosed.has(DiagnosisId.RETRY_AFTER_UNHONORABLE) &&
    (facts.clientType === "ky" || facts.clientType === "ffetch") &&
    !facts.hasRetryAfterConfig
  ) {
    emit(
      RecommendationId.ENABLE_RETRY_AFTER,
      Severity.MEDIUM,
      "Configure retryAfterStatusCodes",
      `The chaos layer is sending Retry-After headers on 429s, but client has no retryAfterStatusCodes. Add [429] to retryAfterStatusCodes to honor server backoff hints.`,
      [DiagnosisId.RETRY_AFTER_UNHONORABLE],
      { hasRetryAfterChaos: true, hasRetryAfterConfig: facts.hasRetryAfterConfig }
    )
  }

  // Switch to exponential jitter — retrying server errors frequently
  if (
    (diagnosed.has(DiagnosisId.SERVER_ERROR_DOMINANT) || diagnosed.has(DiagnosisId.RETRY_INEFFECTIVE)) &&
    facts.clientType === "ffetch" &&
    facts.hasRetryConfig &&
    facts.retryDelayMode !== "expo-jitter"
  ) {
    emit(
      RecommendationId.SWITCH_EXPO_JITTER,
      Severity.LOW,
      "Switch to exponential-jitter retry delay",
      `Fixed delay retries on 5xx errors may cause thundering-herd recovery. Switching to expo-jitter staggers retries under sustained server stress.`,
      [DiagnosisId.SERVER_ERROR_DOMINANT],
      { currentMode: facts.retryDelayMode || "fixed" }
    )
  }

  // Add 429 to retry status codes — rate limits are dominant but 429 not in list
  if (
    diagnosed.has(DiagnosisId.RATE_LIMIT_DOMINANT) &&
    facts.hasRetryConfig &&
    !facts.has429InRetryStatusCodes
  ) {
    emit(
      RecommendationId.ADD_RATE_LIMIT_STATUS_CODE,
      Severity.HIGH,
      "Add 429 to retry status codes",
      `${pct(facts.http429Share)} of requests received 429 rate limit responses but 429 is not in retryStatusCodes. These are being discarded without retry.`,
      [DiagnosisId.RATE_LIMIT_DOMINANT],
      { http429Share: facts.http429Share, has429InRetryStatusCodes: false }
    )
  }

  // ─── Concurrency-related ────────────────────────────────────────────────────

  // Reduce concurrency — rate limits dominant and concurrency is high
  if (
    (diagnosed.has(DiagnosisId.RATE_LIMIT_DOMINANT) || diagnosed.has(DiagnosisId.CONCURRENCY_PRESSURE)) &&
    facts.transportRatio >= 1.4
  ) {
    emit(
      RecommendationId.REDUCE_CONCURRENCY,
      Severity.MEDIUM,
      "Reduce concurrency to ease rate-limit pressure",
      `High concurrency (transport ratio ${facts.transportRatio.toFixed(1)}×) likely triggered the rate limiter. Lowering concurrency reduces burst intensity.`,
      [DiagnosisId.RATE_LIMIT_DOMINANT, DiagnosisId.CONCURRENCY_PRESSURE].filter(id => diagnosed.has(id)),
      { transportRatio: facts.transportRatio }
    )
  }

  // ─── Timeout-related ────────────────────────────────────────────────────────

  // Increase timeout — timeout is very tight relative to p95
  if (diagnosed.has(DiagnosisId.CLIENT_TIMEOUT_TIGHT) && facts.configuredTimeoutMs > 0) {
    const suggested = Math.round(facts.p95 * 1.5)
    emit(
      RecommendationId.INCREASE_TIMEOUT,
      Severity.MEDIUM,
      "Increase timeout",
      `Timeout (${facts.configuredTimeoutMs}ms) is too close to p95 (${facts.p95}ms). Consider increasing to at least ${suggested}ms (1.5× p95).`,
      [DiagnosisId.CLIENT_TIMEOUT_TIGHT, DiagnosisId.TIMEOUT_DOMINANT].filter(id => diagnosed.has(id)),
      { configuredTimeoutMs: facts.configuredTimeoutMs, p95: facts.p95, suggested }
    )
  }

  // ─── Plugin-related: ffetch only ────────────────────────────────────────────

  // Enable circuit breaker — circuit is firing often but circuit is already on,
  // or errors are very high and circuit is not active
  if (diagnosed.has(DiagnosisId.CIRCUIT_FREQUENT) && facts.hasCircuitPlugin) {
    // If circuit is already opening on the vast majority of requests, the server is simply broken —
    // lowering the threshold further won't help and may cause cascading fast-fails.
    const circuitAlreadyDominant = facts.circuitShare >= 0.5
    if (!circuitAlreadyDominant) {
      emit(
        RecommendationId.REDUCE_CIRCUIT_THRESHOLD,
        Severity.MEDIUM,
        "Reduce circuit breaker threshold",
        `Circuit opened on ${pct(facts.circuitShare)} of requests. Lowering the threshold trips the breaker faster to shed load earlier.`,
        [DiagnosisId.CIRCUIT_FREQUENT],
        { circuitShare: facts.circuitShare }
      )
    }
  }

  if (
    (diagnosed.has(DiagnosisId.SERVER_ERROR_DOMINANT) || diagnosed.has(DiagnosisId.HIGH_ERROR_RATE)) &&
    facts.clientType === "ffetch" &&
    !facts.hasCircuitPlugin &&
    !diagnosed.has(DiagnosisId.CLIENT_TIMEOUT_TIGHT) && // timeout misconfiguration is the real problem, not load
    !diagnosed.has(DiagnosisId.RATE_LIMIT_DOMINANT) &&  // rate limiting is a config gap, not a load-shedding problem
    facts.errorRate >= 0.25
  ) {
    emit(
      RecommendationId.ENABLE_CIRCUIT,
      Severity.MEDIUM,
      "Enable circuit breaker plugin",
      `${pct(facts.errorRate)} of requests are failing. A circuit breaker would shed load during outages instead of retrying indefinitely.`,
      [DiagnosisId.SERVER_ERROR_DOMINANT, DiagnosisId.HIGH_ERROR_RATE].filter(id => diagnosed.has(id)),
      { errorRate: facts.errorRate }
    )
  }

  // Enable dedupe — same URL, high concurrency, dedupe plugin not enabled
  if (
    diagnosed.has(DiagnosisId.DEDUPE_UNDERUTILIZED) &&
    facts.clientType === "ffetch" &&
    !facts.hasDedupePlugin
  ) {
    emit(
      RecommendationId.ENABLE_DEDUPE,
      Severity.INFO,
      "Enable dedupe plugin",
      `High concurrent requests to the same URL could be collapsed. The dedupe plugin serves one response to all in-flight callers.`,
      [DiagnosisId.DEDUPE_UNDERUTILIZED],
      { dedupeRate: facts.dedupeRate }
    )
  }

  // Enable hedging — tail latency instability, no hedging active
  // Skip if retries are already handling failures well (low error rate) — hedging would only add transport pressure
  // Also require meaningful p99/p95 ratio: spread-only wide distributions don't benefit from hedging
  const retriesWorkingWell = facts.hasRetryConfig && facts.errorRate <= 0.05
  if (
    diagnosed.has(DiagnosisId.TAIL_LATENCY_INSTABILITY) &&
    facts.clientType === "ffetch" &&
    !facts.hasHedgePlugin &&
    !retriesWorkingWell &&
    facts.tailRatio >= 1.5 && // must have actual p99/p95 spike, not just wide spread
    facts.http5xxShare < 0.15 && // hedging not useful if server is just broken
    !retryHedgeAmplificationHigh
  ) {
    emit(
      RecommendationId.ENABLE_HEDGING,
      Severity.LOW,
      "Enable hedge plugin to reduce tail latency",
      facts.hasRetryConfig
        ? `p99/p95 = ${facts.tailRatio.toFixed(1)}× indicates tail latency instability. Enable hedging carefully with low retries (for example 0-1) to avoid compounded request amplification.`
        : `p99/p95 = ${facts.tailRatio.toFixed(1)}× indicates tail latency instability. Hedging races a second request after the delay and cancels the slower one.`,
      [DiagnosisId.TAIL_LATENCY_INSTABILITY],
      { tailRatio: facts.tailRatio, p95: facts.p95, p99: facts.p99, hasRetryConfig: facts.hasRetryConfig, transportRatio: facts.transportRatio }
    )
  }

  // Tune hedge delay — hedging is very costly
  if (diagnosed.has(DiagnosisId.HEDGING_COST_HIGH) && facts.hasHedgePlugin) {
    emit(
      RecommendationId.INCREASE_HEDGE_DELAY,
      Severity.LOW,
      "Increase hedge delay to reduce unnecessary hedge requests",
      `Transport made ${facts.transportRatio.toFixed(1)}× attempts per request. Increasing hedge delay means only genuinely stalled requests get a hedge.`,
      [DiagnosisId.HEDGING_COST_HIGH],
      { transportRatio: facts.transportRatio }
    )
  }

  // Suggest ffetch for clients without resilience plugins
  if (
    (facts.clientType === "fetch" || facts.clientType === "axios") &&
    (diagnosed.has(DiagnosisId.HIGH_ERROR_RATE) || diagnosed.has(DiagnosisId.TAIL_LATENCY_INSTABILITY)) &&
    facts.errorRate >= 0.20
  ) {
    emit(
      RecommendationId.USE_FFETCH_FOR_PLUGINS,
      Severity.INFO,
      `Consider switching to ffetch for resilience plugins`,
      `${facts.clientType} lacks built-in retry/circuit/hedge controls. ffetch exposes all of these configurable.`,
      [DiagnosisId.HIGH_ERROR_RATE, DiagnosisId.TAIL_LATENCY_INSTABILITY].filter(id => diagnosed.has(id)),
      { clientType: facts.clientType }
    )
  }

  const filtered = applyCrossConfigRules(results, facts, diagnosed, runFacts)
  if (options.includeBlocked) {
    return filtered
  }
  return filtered.recommendations
}

function pct(fraction) {
  return `${Math.round(fraction * 100)}%`
}
