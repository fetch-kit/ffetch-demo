import { DiagnosisId, RecommendationId } from "./types.js"

/**
 * Cross-config blocking rules.
 *
 * Each rule can suppress recommendations that would be unsafe or counterproductive
 * when other knobs are already active.
 */
const CROSS_CONFIG_RULES = [
  {
    id: "timeout-tight-before-more-retries",
    when: ({ diagnosed }) => diagnosed.has(DiagnosisId.CLIENT_TIMEOUT_TIGHT),
    block: [RecommendationId.ADD_RETRY, RecommendationId.INCREASE_RETRY_LIMIT],
    reason: "Timeout budget is already too tight; increasing retries first can worsen tail latency."
  },
  {
    id: "rate-limit-pressure-before-more-retries",
    when: ({ diagnosed, facts }) =>
      diagnosed.has(DiagnosisId.RATE_LIMIT_DOMINANT) && facts.transportRatio >= 1.4,
    block: [RecommendationId.ADD_RETRY, RecommendationId.INCREASE_RETRY_LIMIT],
    reason: "Rate-limit pressure is dominant; extra retries increase request burst pressure."
  },
  {
    id: "circuit-frequent-no-more-retries",
    when: ({ diagnosed }) => diagnosed.has(DiagnosisId.CIRCUIT_FREQUENT),
    block: [RecommendationId.ADD_RETRY, RecommendationId.INCREASE_RETRY_LIMIT],
    reason: "Circuit is opening frequently; adding retries can intensify breaker churn."
  },
  {
    id: "hedge-amplification-no-retry-growth",
    when: ({ facts }) => facts.hedgeTransportRatio >= 1.5,
    block: [RecommendationId.ADD_RETRY, RecommendationId.INCREASE_RETRY_LIMIT],
    reason: "Hedging already amplifies transport calls; adding retries compounds amplification."
  },
  {
    id: "retry-amplification-no-hedge-enable",
    when: ({ facts }) => facts.retryTransportRatio >= 1.5,
    block: [RecommendationId.ENABLE_HEDGING],
    reason: "Retries already amplify transport calls; enabling hedging now would stack amplification."
  },
  {
    id: "server-broken-no-hedge",
    when: ({ diagnosed, facts }) =>
      (diagnosed.has(DiagnosisId.SERVER_ERROR_DOMINANT) && facts.http5xxShare >= 0.15) ||
      facts.circuitShare >= 0.3,
    block: [RecommendationId.ENABLE_HEDGING],
    reason: "Dominant server errors or frequent circuit opens indicate a failure mode, not latency tail; hedging is unlikely to help."
  },
  {
    id: "expo-first-before-retry-growth",
    when: ({ diagnosed, facts }) =>
      diagnosed.has(DiagnosisId.SERVER_ERROR_DOMINANT) &&
      facts.clientType === "ffetch" &&
      facts.hasRetryConfig &&
      facts.retryDelayMode !== "expo-jitter",
    block: [RecommendationId.INCREASE_RETRY_LIMIT],
    reason: "Adopt expo-jitter retry delay before increasing retry limit under server instability."
  },
  {
    id: "dedupe-high-avoid-hedge-expansion",
    when: ({ facts }) => facts.hasDedupePlugin && facts.dedupeRate >= 0.25,
    block: [RecommendationId.ENABLE_HEDGING],
    reason: "High dedupe hit-rate already collapses concurrent demand; hedging expansion may add unnecessary calls."
  },
  {
    id: "timeout-tight-no-circuit",
    when: ({ diagnosed }) => diagnosed.has(DiagnosisId.CLIENT_TIMEOUT_TIGHT),
    block: [RecommendationId.ENABLE_CIRCUIT],
    reason: "Timeout is misconfigured; circuit breaker won't help when the timeout itself is causing failures."
  },
  {
    id: "rate-limit-no-circuit",
    when: ({ diagnosed }) => diagnosed.has(DiagnosisId.RATE_LIMIT_DOMINANT),
    block: [RecommendationId.ENABLE_CIRCUIT],
    reason: "Rate limiting is a client config gap (missing 429 handling), not a load problem a circuit breaker can solve."
  }
]

/**
 * Apply cross-config rule table to recommendation list.
 *
 * @param {import('./types.js').Recommendation[]} recommendations
 * @param {import('./types.js').ClientFacts} facts
 * @param {Set<string>} diagnosed
 * @param {import('./types.js').RunFacts} runFacts
 * @returns {{ recommendations: import('./types.js').Recommendation[], blocked: Array<{id:string, recommendationId:string, reason:string}> }}
 */
export function applyCrossConfigRules(recommendations, facts, diagnosed, runFacts) {
  const blocked = []
  const blockedIds = new Set()

  for (const rule of CROSS_CONFIG_RULES) {
    if (!rule.when({ facts, diagnosed, runFacts, recommendations })) continue

    for (const recId of rule.block) {
      if (recommendations.some((r) => r.id === recId)) {
        blockedIds.add(recId)
        blocked.push({ id: rule.id, recommendationId: recId, reason: rule.reason })
      }
    }
  }

  return {
    recommendations: recommendations.filter((r) => !blockedIds.has(r.id)),
    blocked
  }
}

export { CROSS_CONFIG_RULES }
