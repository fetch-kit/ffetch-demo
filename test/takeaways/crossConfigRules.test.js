import { describe, it, expect } from "vitest"
import { applyCrossConfigRules, CROSS_CONFIG_RULES } from "../../src/takeaways/crossConfigRules.js"
import { DiagnosisId, RecommendationId, Severity } from "../../src/takeaways/types.js"

function rec(id) {
  return {
    id,
    clientName: "test",
    severity: Severity.MEDIUM,
    title: id,
    description: "",
    basedOn: [],
    evidence: {},
    conflicts: []
  }
}

function facts(overrides = {}) {
  return {
    clientType: "ffetch",
    hasRetryConfig: true,
    retryDelayMode: "fixed",
    hasHedgePlugin: false,
    hasDedupePlugin: false,
    dedupeRate: 0,
    transportRatio: 1.0,
    retryTransportRatio: 0,
    hedgeTransportRatio: 0,
    http5xxShare: 0.05,
    ...overrides
  }
}

const runFacts = {}

describe("CROSS_CONFIG_RULES", () => {
  it("contains a non-empty ruleset", () => {
    expect(Array.isArray(CROSS_CONFIG_RULES)).toBe(true)
    expect(CROSS_CONFIG_RULES.length).toBeGreaterThan(0)
  })

  it("each rule has id, when, and block list", () => {
    for (const rule of CROSS_CONFIG_RULES) {
      expect(typeof rule.id).toBe("string")
      expect(typeof rule.when).toBe("function")
      expect(Array.isArray(rule.block)).toBe(true)
    }
  })
})

describe("applyCrossConfigRules", () => {
  it("blocks retry growth when timeout is tight", () => {
    const diagnosed = new Set([DiagnosisId.CLIENT_TIMEOUT_TIGHT])
    const input = [rec(RecommendationId.ADD_RETRY), rec(RecommendationId.INCREASE_RETRY_LIMIT)]
    const out = applyCrossConfigRules(input, facts(), diagnosed, runFacts)

    expect(out.recommendations.find(r => r.id === RecommendationId.ADD_RETRY)).toBeUndefined()
    expect(out.recommendations.find(r => r.id === RecommendationId.INCREASE_RETRY_LIMIT)).toBeUndefined()
    expect(out.blocked.length).toBeGreaterThan(0)
  })

  it("blocks retry growth when rate-limit pressure is dominant", () => {
    const diagnosed = new Set([DiagnosisId.RATE_LIMIT_DOMINANT])
    const input = [rec(RecommendationId.ADD_RETRY), rec(RecommendationId.INCREASE_RETRY_LIMIT), rec(RecommendationId.REDUCE_CONCURRENCY)]
    const out = applyCrossConfigRules(input, facts({ transportRatio: 1.6 }), diagnosed, runFacts)

    expect(out.recommendations.find(r => r.id === RecommendationId.ADD_RETRY)).toBeUndefined()
    expect(out.recommendations.find(r => r.id === RecommendationId.INCREASE_RETRY_LIMIT)).toBeUndefined()
    expect(out.recommendations.find(r => r.id === RecommendationId.REDUCE_CONCURRENCY)).toBeDefined()
  })

  it("blocks retry growth when hedging is already amplifying load", () => {
    const diagnosed = new Set([DiagnosisId.CLIENT_NO_RETRY])
    const input = [rec(RecommendationId.ADD_RETRY)]
    const out = applyCrossConfigRules(input, facts({ hasHedgePlugin: true, hedgeTransportRatio: 1.8 }), diagnosed, runFacts)

    expect(out.recommendations.find(r => r.id === RecommendationId.ADD_RETRY)).toBeUndefined()
  })

  it("blocks hedging enablement when retries already amplify load", () => {
    const diagnosed = new Set([DiagnosisId.TAIL_LATENCY_INSTABILITY])
    const input = [rec(RecommendationId.ENABLE_HEDGING)]
    const out = applyCrossConfigRules(input, facts({ hasHedgePlugin: false, hasRetryConfig: true, retryTransportRatio: 1.8 }), diagnosed, runFacts)

    expect(out.recommendations.find(r => r.id === RecommendationId.ENABLE_HEDGING)).toBeUndefined()
  })

  it("blocks hedging enablement under dominant server failures", () => {
    const diagnosed = new Set([DiagnosisId.SERVER_ERROR_DOMINANT])
    const input = [rec(RecommendationId.ENABLE_HEDGING)]
    const out = applyCrossConfigRules(input, facts({ http5xxShare: 0.25 }), diagnosed, runFacts)

    expect(out.recommendations.find(r => r.id === RecommendationId.ENABLE_HEDGING)).toBeUndefined()
  })

  it("blocks retry-limit increase until expo-jitter is adopted for server instability", () => {
    const diagnosed = new Set([DiagnosisId.SERVER_ERROR_DOMINANT])
    const input = [rec(RecommendationId.INCREASE_RETRY_LIMIT), rec(RecommendationId.SWITCH_EXPO_JITTER)]
    const out = applyCrossConfigRules(input, facts({ retryDelayMode: "fixed" }), diagnosed, runFacts)

    expect(out.recommendations.find(r => r.id === RecommendationId.INCREASE_RETRY_LIMIT)).toBeUndefined()
    expect(out.recommendations.find(r => r.id === RecommendationId.SWITCH_EXPO_JITTER)).toBeDefined()
  })

  it("keeps recommendations when no cross-rule condition is met", () => {
    const diagnosed = new Set([DiagnosisId.TAIL_LATENCY_INSTABILITY])
    const input = [rec(RecommendationId.ENABLE_HEDGING), rec(RecommendationId.INCREASE_TIMEOUT)]
    const out = applyCrossConfigRules(input, facts({ transportRatio: 1.1, http5xxShare: 0.05 }), diagnosed, runFacts)

    expect(out.recommendations).toHaveLength(2)
  })
})
