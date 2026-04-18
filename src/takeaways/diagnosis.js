import { Severity, DiagnosisId, SEVERITY_RANK } from "./types.js"

// ─── Thresholds (mirrored from facts.js, intentionally separate) ───────────────
const T = {
  DOMINANT_429_SHARE: 0.12,
  DOMINANT_5XX_SHARE: 0.15,
  DOMINANT_TIMEOUT_SHARE: 0.10,
  DOMINANT_CIRCUIT_SHARE: 0.08,
  HIGH_ERROR_RATE: 0.20,
  TAIL_RATIO_HIGH: 2.0,
  SPREAD_RATIO_HIGH: 3.0,
  TAIL_ABS_GAP_MIN_MS: 150,   // p99 must exceed p95 by at least this much for spread-only trigger
  TAIL_GAP_P95_FRACTION: 0.12, // or by at least 12% of p95
  RETRY_INCIDENCE_HIGH: 0.25,
  FAIL_AFTER_RETRY_HIGH: 0.30,
  RETRY_MAX_SATURATION_HIGH: 0.35,
  TRANSPORT_RATIO_HIGH: 1.6,
  HEDGE_TRANSPORT_RATIO_HIGH: 1.8,
  CIRCUIT_SHARE_FREQUENT: 0.08,
  TIMEOUT_TO_P95_RATIO: 1.3,
}

/**
 * Run all diagnosis rules for a single client.
 * Returns all active diagnoses with severity and evidence.
 *
 * @param {import('./types.js').ClientFacts} facts
 * @param {import('./types.js').RunFacts} runFacts
 * @returns {import('./types.js').Diagnosis[]}
 */
export function diagnoseClient(facts, runFacts) {
  const results = []

  function emit(id, severity, summary, evidence, confidence = 1) {
    results.push({ id, severity, clientName: facts.clientName, summary, evidence, confidence })
  }

  // ── 1. High overall error rate ──────────────────────────────────────────────
  if (facts.errorRate >= T.HIGH_ERROR_RATE) {
    const severity = facts.errorRate >= 0.40 ? Severity.HIGH
      : facts.errorRate >= 0.25 ? Severity.MEDIUM
      : Severity.LOW
    emit(
      DiagnosisId.HIGH_ERROR_RATE, severity,
      `${pct(facts.errorRate)} of requests failed`,
      { errorRate: facts.errorRate, total: facts.total, failed: facts.failureCount },
      confidence(facts.errorRate, T.HIGH_ERROR_RATE, 0.6)
    )
  }

  // ── 2. Rate limit dominant ──────────────────────────────────────────────────
  if (facts.http429Share >= T.DOMINANT_429_SHARE) {
    const severity = facts.http429Share >= 0.30 ? Severity.HIGH
      : facts.http429Share >= 0.18 ? Severity.MEDIUM
      : Severity.LOW
    emit(
      DiagnosisId.RATE_LIMIT_DOMINANT, severity,
      `Rate limiting accounts for ${pct(facts.http429Share)} of all requests`,
      { http429Share: facts.http429Share, hasRetryAfterChaos: runFacts.hasRetryAfterChaos,
        hasRetryConfig: facts.hasRetryConfig, has429InRetryStatusCodes: facts.has429InRetryStatusCodes },
      confidence(facts.http429Share, T.DOMINANT_429_SHARE, 0.5)
    )
  }

  // ── 3. Server error dominant ───────────────────────────────────────────────
  if (facts.http5xxShare >= T.DOMINANT_5XX_SHARE) {
    const severity = facts.http5xxShare >= 0.35 ? Severity.HIGH
      : facts.http5xxShare >= 0.22 ? Severity.MEDIUM
      : Severity.LOW
    emit(
      DiagnosisId.SERVER_ERROR_DOMINANT, severity,
      `Server errors (5xx) account for ${pct(facts.http5xxShare)} of all requests`,
      { http5xxShare: facts.http5xxShare, total: facts.total },
      confidence(facts.http5xxShare, T.DOMINANT_5XX_SHARE, 0.5)
    )
  }

  // ── 4. Timeout dominant ─────────────────────────────────────────────────────
  if (facts.timeoutShare >= T.DOMINANT_TIMEOUT_SHARE) {
    const severity = facts.timeoutShare >= 0.25 ? Severity.HIGH
      : facts.timeoutShare >= 0.15 ? Severity.MEDIUM
      : Severity.LOW
    emit(
      DiagnosisId.TIMEOUT_DOMINANT, severity,
      `Timeouts account for ${pct(facts.timeoutShare)} of all requests`,
      { timeoutShare: facts.timeoutShare, configuredTimeoutMs: facts.configuredTimeoutMs, p95: facts.p95 },
      confidence(facts.timeoutShare, T.DOMINANT_TIMEOUT_SHARE, 0.4)
    )
  }

  // ── 5. Tail latency instability ─────────────────────────────────────────────
    const tailGapMs = Math.max(0, facts.p99 - facts.p95)
    const tailGapNeeded = Math.max(T.TAIL_ABS_GAP_MIN_MS, facts.p95 * T.TAIL_GAP_P95_FRACTION)
    const hasTailRatioSignal = facts.tailRatio >= T.TAIL_RATIO_HIGH && facts.circuitShare < 0.3
    // Suppress spread-only signal when error rate is very low: wide p95/p50 spread when
    // success rate is near-perfect is likely from intentional retry/backoff delays, not instability.
    // Also suppress when circuit share is high: fast circuit-open returns at 0ms distort the distribution.
    const hasSpreadSignal = facts.spreadRatio >= T.SPREAD_RATIO_HIGH && tailGapMs >= tailGapNeeded && facts.errorRate >= 0.03 && facts.circuitShare < 0.3

    if (hasTailRatioSignal || hasSpreadSignal) {
    const severity = (facts.tailRatio >= 3.5 || facts.spreadRatio >= 5) ? Severity.HIGH
      : (facts.tailRatio >= 2.5 || facts.spreadRatio >= 3.5) ? Severity.MEDIUM
      : Severity.LOW
    emit(
      DiagnosisId.TAIL_LATENCY_INSTABILITY, severity,
      `Tail latency is unstable (p99/p95 = ${facts.tailRatio.toFixed(1)}×, p95/p50 = ${facts.spreadRatio.toFixed(1)}×)`,
        { tailRatio: facts.tailRatio, spreadRatio: facts.spreadRatio, p50: facts.p50, p95: facts.p95, p99: facts.p99, tailGapMs },
      confidence(Math.max(facts.tailRatio / T.TAIL_RATIO_HIGH, facts.spreadRatio / T.SPREAD_RATIO_HIGH), 1, 0.4)
    )
  }

  // ── 6. Retry ineffective ────────────────────────────────────────────────────
  if (facts.hasRetryConfig && facts.retryIncidence >= T.RETRY_INCIDENCE_HIGH && facts.failAfterRetryRate >= T.FAIL_AFTER_RETRY_HIGH) {
    const severity = facts.failAfterRetryRate >= 0.7 ? Severity.HIGH
      : facts.failAfterRetryRate >= 0.5 ? Severity.MEDIUM
      : Severity.LOW
    emit(
      DiagnosisId.RETRY_INEFFECTIVE, severity,
      `${pct(facts.failAfterRetryRate)} of retried requests still failed — retries are not rescuing enough`,
      { failAfterRetryRate: facts.failAfterRetryRate, retryIncidence: facts.retryIncidence, configuredRetryLimit: facts.configuredRetryLimit },
      confidence(facts.failAfterRetryRate, T.FAIL_AFTER_RETRY_HIGH, 0.4)
    )
  }

  // ── 7. Retry exhausting (max saturation high AND the client is still failing) ──
  if (facts.hasRetryConfig && facts.retryMaxSaturation >= T.RETRY_MAX_SATURATION_HIGH && facts.errorRate >= 0.05) {
    emit(
      DiagnosisId.RETRY_EXHAUSTING, Severity.MEDIUM,
      `${pct(facts.retryMaxSaturation)} of requests hit the maximum retry limit`,
      { retryMaxSaturation: facts.retryMaxSaturation, configuredRetryLimit: facts.configuredRetryLimit },
      confidence(facts.retryMaxSaturation, T.RETRY_MAX_SATURATION_HIGH, 0.3)
    )
  }

  // ── 8. Client has no retry configured ──────────────────────────────────────
  if (!facts.hasRetryConfig && facts.errorRate >= 0.10) {
    const msg = facts.hasHedgePlugin
      ? `Client has no retry configured but ${pct(facts.errorRate)} of requests failed — hedging handles latency, not error responses`
      : `Client has no retry configured but ${pct(facts.errorRate)} of requests failed`
    emit(
      DiagnosisId.CLIENT_NO_RETRY, Severity.MEDIUM,
      msg,
      { errorRate: facts.errorRate, hasRetryConfig: false },
      0.9
    )
  }

  // ── 9. Concurrency transport pressure (retry-driven, not hedge-driven) ──────
  if (facts.retryTransportRatio >= T.TRANSPORT_RATIO_HIGH) {
    emit(
      DiagnosisId.CONCURRENCY_PRESSURE, Severity.LOW,
      `Transport made ${facts.transportRatio.toFixed(1)}× more attempts than logical requests (retries inflating pressure)`,
      { transportRatio: facts.transportRatio },
      confidence(facts.transportRatio, T.TRANSPORT_RATIO_HIGH, 0.4)
    )
  }

  // ── 10. Circuit breaker firing frequently ──────────────────────────────────
  if (facts.circuitShare >= T.CIRCUIT_SHARE_FREQUENT) {
    emit(
      DiagnosisId.CIRCUIT_FREQUENT, Severity.MEDIUM,
      `Circuit breaker opened on ${pct(facts.circuitShare)} of requests`,
      { circuitShare: facts.circuitShare, hasCircuitPlugin: facts.hasCircuitPlugin },
      confidence(facts.circuitShare, T.CIRCUIT_SHARE_FREQUENT, 0.4)
    )
  }

  // ── 11. Dedupe plugin enabled but barely firing ────────────────────────────
  if (facts.hasDedupePlugin && facts.dedupeRate < 0.05 && facts.total >= 20) {
    emit(
      DiagnosisId.DEDUPE_UNDERUTILIZED, Severity.INFO,
      `Dedupe plugin is enabled but only ${pct(facts.dedupeRate)} of requests were served from cache`,
      { dedupeRate: facts.dedupeRate, hasDedupePlugin: true },
      0.7
    )
  }

  // ── 12. Hedging transport overhead without clear benefit ──────────────────
  if (facts.hasHedgePlugin && facts.hedgeTransportRatio >= T.HEDGE_TRANSPORT_RATIO_HIGH) {
    emit(
      DiagnosisId.HEDGING_COST_HIGH,
        Severity.LOW,
      `Hedge plugin is making ${facts.transportRatio.toFixed(1)}× transport attempts per request`,
      { transportRatio: facts.transportRatio, hasHedgePlugin: true, tailRatio: facts.tailRatio },
      confidence(facts.transportRatio, T.HEDGE_TRANSPORT_RATIO_HIGH, 0.3)
    )
  }

  // ── 13. Timeout very tight relative to observed p95 ───────────────────────
  if (facts.configuredTimeoutMs > 0 && facts.p95 > 0) {
    const ratio = facts.configuredTimeoutMs / facts.p95
    if (ratio <= T.TIMEOUT_TO_P95_RATIO) {
      emit(
        DiagnosisId.CLIENT_TIMEOUT_TIGHT, Severity.MEDIUM,
        `Timeout (${facts.configuredTimeoutMs}ms) is only ${ratio.toFixed(1)}× p95 (${facts.p95}ms), causing likely timeout failures`,
        { configuredTimeoutMs: facts.configuredTimeoutMs, p95: facts.p95, ratio },
        confidence(1 / ratio, 1 / T.TIMEOUT_TO_P95_RATIO, 0.3)
      )
    }
  }

  // ── 14. Rate-limit chaos present but client can't honor Retry-After ────────
  if (runFacts.hasRetryAfterChaos && facts.http429Share >= T.DOMINANT_429_SHARE && !facts.hasRetryAfterConfig) {
    emit(
      DiagnosisId.RETRY_AFTER_UNHONORABLE, Severity.MEDIUM,
      `Rate-limit chaos sends Retry-After headers but client has no retryAfterStatusCodes configured`,
      { hasRetryAfterChaos: true, hasRetryAfterConfig: false, http429Share: facts.http429Share },
      0.9
    )
  }

  // ── 15. Mixed error modes (multiple dominant error types coexist) ──────────
  const dominantModes = [
    facts.http429Share >= T.DOMINANT_429_SHARE,
    facts.http5xxShare >= T.DOMINANT_5XX_SHARE,
    facts.timeoutShare >= T.DOMINANT_TIMEOUT_SHARE,
    facts.circuitShare >= T.CIRCUIT_SHARE_FREQUENT
  ].filter(Boolean).length

  if (dominantModes >= 2) {
    emit(
      DiagnosisId.MIXED_ERROR_MODES, Severity.MEDIUM,
      `Multiple failure modes are dominant simultaneously (${dominantModes} active)`,
      { http429Share: facts.http429Share, http5xxShare: facts.http5xxShare, timeoutShare: facts.timeoutShare, circuitShare: facts.circuitShare },
      0.8
    )
  }

  return results
}

/**
 * Scale a confidence value linearly from [threshold..ceiling] to [minConf..1].
 */
function confidence(actual, threshold, minConf) {
  const ratio = Math.min(actual / threshold, 2)
  return Math.min(1, minConf + (1 - minConf) * (ratio - 1))
}

function pct(fraction) {
  return `${Math.round(fraction * 100)}%`
}
