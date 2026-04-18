import { describe, it, expect } from "vitest"
import { recommendForClient } from "../../src/takeaways/recommendations.js"
import { DiagnosisId, RecommendationId, Severity } from "../../src/takeaways/types.js"

const BASE_RUN_FACTS = {
  hasRateLimitChaos: false,
  hasRetryAfterChaos: false,
  hasLatencyChaos: false,
  hasFailRandomlyChaos: false,
  chaosFailRate: 0
}

function makeFacts(overrides = {}) {
  return {
    clientName: "test",
    clientType: "ffetch",
    total: 100,
    successCount: 80,
    failureCount: 20,
    successRate: 0.8,
    errorRate: 0.2,
    reliabilityScore: 75,
    http429Share: 0,
    http5xxShare: 0.2,
    timeoutShare: 0,
    circuitShare: 0,
    networkErrorShare: 0,
    p50: 120,
    p95: 340,
    p99: 700,
    tailRatio: 2.0,
    spreadRatio: 2.8,
    throughputRps: 5,
    retryIncidence: 0.2,
    avgRetriesPerRequest: 0.3,
    retryMaxSaturation: 0.1,
    failAfterRetryRate: 0.25,
    dedupeRate: 0,
    transportRatio: 1.3,
    retryTransportRatio: 0.3,
    hedgeTransportRatio: 0,
    hasDedupePlugin: false,
    hasCircuitPlugin: false,
    hasHedgePlugin: false,
    hasRetryConfig: true,
    configuredRetryLimit: 2,
    retryDelayMode: "fixed",
    hasRetryAfterConfig: false,
    has429InRetryStatusCodes: true,
    configuredTimeoutMs: 3000,
    insufficientSampleFlag: 0,
    ...overrides
  }
}

function diag(id, severity = Severity.MEDIUM) {
  return { id, severity, clientName: "test", summary: "", evidence: {}, confidence: 0.8 }
}

describe("recommendForClient", () => {
  describe("ADD_RETRY", () => {
    it("emits for ky client with no retry and high error rate", () => {
      const facts = makeFacts({ clientType: "ky", hasRetryConfig: false, configuredRetryLimit: 0, errorRate: 0.25 })
      const recs = recommendForClient([diag(DiagnosisId.CLIENT_NO_RETRY)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ADD_RETRY)).toBeDefined()
    })

    it("does NOT emit for fetch client (no retry capability)", () => {
      const facts = makeFacts({ clientType: "fetch", hasRetryConfig: false, configuredRetryLimit: 0, errorRate: 0.25 })
      const recs = recommendForClient([diag(DiagnosisId.CLIENT_NO_RETRY)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ADD_RETRY)).toBeUndefined()
    })

    it("does NOT emit without CLIENT_NO_RETRY diagnosis", () => {
      const facts = makeFacts({ clientType: "ky", hasRetryConfig: false, configuredRetryLimit: 0, errorRate: 0.25 })
      const recs = recommendForClient([], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ADD_RETRY)).toBeUndefined()
    })

    it("does NOT emit when hedging is enabled and transport amplification is already high", () => {
      const facts = makeFacts({
        clientType: "ffetch",
        hasRetryConfig: false,
        configuredRetryLimit: 0,
        hasHedgePlugin: true,
        transportRatio: 1.8,
        hedgeTransportRatio: 1.8,
        retryTransportRatio: 0.5,
        errorRate: 0.25
      })
      const recs = recommendForClient([diag(DiagnosisId.CLIENT_NO_RETRY)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ADD_RETRY)).toBeUndefined()
    })

    it("emits conservative retry advice when hedging is enabled but amplification is controlled", () => {
      const facts = makeFacts({
        clientType: "ffetch",
        hasRetryConfig: false,
        configuredRetryLimit: 0,
        hasHedgePlugin: true,
        transportRatio: 1.2,
        errorRate: 0.25
      })
      const recs = recommendForClient([diag(DiagnosisId.CLIENT_NO_RETRY)], facts, BASE_RUN_FACTS)
      const rec = recs.find(r => r.id === RecommendationId.ADD_RETRY)
      expect(rec).toBeDefined()
      expect(rec?.description).toContain("start conservatively with 1 retry")
    })
  })

  describe("INCREASE_RETRY_LIMIT", () => {
    it("emits when retry is exhausting AND ineffective and limit is below 5", () => {
      const facts = makeFacts({ hasRetryConfig: true, configuredRetryLimit: 2, retryMaxSaturation: 0.40, failAfterRetryRate: 0.50 })
      const recs = recommendForClient(
        [diag(DiagnosisId.RETRY_EXHAUSTING), diag(DiagnosisId.RETRY_INEFFECTIVE)],
        facts,
        BASE_RUN_FACTS
      )
      expect(recs.find(r => r.id === RecommendationId.INCREASE_RETRY_LIMIT)).toBeDefined()
    })

    it("does NOT emit when limit is already at 5", () => {
      const facts = makeFacts({ hasRetryConfig: true, configuredRetryLimit: 5 })
      const recs = recommendForClient(
        [diag(DiagnosisId.RETRY_EXHAUSTING), diag(DiagnosisId.RETRY_INEFFECTIVE)],
        facts,
        BASE_RUN_FACTS
      )
      expect(recs.find(r => r.id === RecommendationId.INCREASE_RETRY_LIMIT)).toBeUndefined()
    })
  })

  describe("REDUCE_RETRY_LIMIT", () => {
    it("emits when retry ineffective and limit >= 3 and fail-after high", () => {
      const facts = makeFacts({ hasRetryConfig: true, configuredRetryLimit: 3, failAfterRetryRate: 0.70 })
      const recs = recommendForClient([diag(DiagnosisId.RETRY_INEFFECTIVE)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.REDUCE_RETRY_LIMIT)).toBeDefined()
    })

    it("does NOT emit when RETRY_EXHAUSTING is also present (conflicting advice)", () => {
      const facts = makeFacts({ hasRetryConfig: true, configuredRetryLimit: 3, failAfterRetryRate: 0.70 })
      const recs = recommendForClient(
        [diag(DiagnosisId.RETRY_INEFFECTIVE), diag(DiagnosisId.RETRY_EXHAUSTING)],
        facts,
        BASE_RUN_FACTS
      )
      // INCREASE_RETRY_LIMIT and REDUCE_RETRY_LIMIT should not coexist
      const ids = recs.map(r => r.id)
      const both = ids.includes(RecommendationId.INCREASE_RETRY_LIMIT) && ids.includes(RecommendationId.REDUCE_RETRY_LIMIT)
      expect(both).toBe(false)
    })
  })

  describe("ENABLE_RETRY_AFTER", () => {
    it("emits for ky when Retry-After chaos is present and client missing config", () => {
      const facts = makeFacts({ clientType: "ky", hasRetryAfterConfig: false, http429Share: 0.20 })
      const recs = recommendForClient([diag(DiagnosisId.RETRY_AFTER_UNHONORABLE)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ENABLE_RETRY_AFTER)).toBeDefined()
    })

    it("does NOT emit for axios (can't configure retryAfterStatusCodes)", () => {
      const facts = makeFacts({ clientType: "axios", hasRetryAfterConfig: false, http429Share: 0.20 })
      const recs = recommendForClient([diag(DiagnosisId.RETRY_AFTER_UNHONORABLE)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ENABLE_RETRY_AFTER)).toBeUndefined()
    })

    it("does NOT emit when client already has retryAfterStatusCodes configured", () => {
      const facts = makeFacts({ clientType: "ffetch", hasRetryAfterConfig: true, http429Share: 0.20 })
      const recs = recommendForClient([diag(DiagnosisId.RETRY_AFTER_UNHONORABLE)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ENABLE_RETRY_AFTER)).toBeUndefined()
    })
  })

  describe("ADD_RATE_LIMIT_STATUS_CODE", () => {
    it("emits when 429 is dominant and not in retryStatusCodes", () => {
      const facts = makeFacts({ has429InRetryStatusCodes: false, http429Share: 0.20, hasRetryConfig: true })
      const recs = recommendForClient([diag(DiagnosisId.RATE_LIMIT_DOMINANT)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ADD_RATE_LIMIT_STATUS_CODE)).toBeDefined()
    })

    it("does NOT emit when 429 is already in retryStatusCodes", () => {
      const facts = makeFacts({ has429InRetryStatusCodes: true, http429Share: 0.20, hasRetryConfig: true })
      const recs = recommendForClient([diag(DiagnosisId.RATE_LIMIT_DOMINANT)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ADD_RATE_LIMIT_STATUS_CODE)).toBeUndefined()
    })
  })

  describe("SWITCH_EXPO_JITTER", () => {
    it("emits for ffetch when retry mode is fixed and server errors are dominant", () => {
      const facts = makeFacts({ clientType: "ffetch", retryDelayMode: "fixed", hasRetryConfig: true })
      const recs = recommendForClient([diag(DiagnosisId.SERVER_ERROR_DOMINANT)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.SWITCH_EXPO_JITTER)).toBeDefined()
    })

    it("does NOT emit when retry mode is already expo-jitter", () => {
      const facts = makeFacts({ clientType: "ffetch", retryDelayMode: "expo-jitter", hasRetryConfig: true })
      const recs = recommendForClient([diag(DiagnosisId.SERVER_ERROR_DOMINANT)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.SWITCH_EXPO_JITTER)).toBeUndefined()
    })
  })

  describe("REDUCE_CONCURRENCY", () => {
    it("emits when rate limiting is dominant and transport ratio is high", () => {
      const facts = makeFacts({ http429Share: 0.20, transportRatio: 1.5 })
      const recs = recommendForClient([diag(DiagnosisId.RATE_LIMIT_DOMINANT)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.REDUCE_CONCURRENCY)).toBeDefined()
    })

    it("does NOT emit when transport ratio is low", () => {
      const facts = makeFacts({ http429Share: 0.20, transportRatio: 1.1 })
      const recs = recommendForClient([diag(DiagnosisId.RATE_LIMIT_DOMINANT)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.REDUCE_CONCURRENCY)).toBeUndefined()
    })
  })

  describe("INCREASE_TIMEOUT", () => {
    it("emits when timeout tight and timeouts are occurring", () => {
      const facts = makeFacts({ configuredTimeoutMs: 350, p95: 310 })
      const recs = recommendForClient([diag(DiagnosisId.CLIENT_TIMEOUT_TIGHT)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.INCREASE_TIMEOUT)).toBeDefined()
    })

    it("evidence includes suggested timeout", () => {
      const facts = makeFacts({ configuredTimeoutMs: 350, p95: 310 })
      const recs = recommendForClient([diag(DiagnosisId.CLIENT_TIMEOUT_TIGHT)], facts, BASE_RUN_FACTS)
      const r = recs.find(r => r.id === RecommendationId.INCREASE_TIMEOUT)
      expect(r?.evidence?.suggested).toBe(465) // 1.5 * p95
    })
  })

  describe("ENABLE_CIRCUIT", () => {
    it("emits for ffetch with high error rate and no circuit plugin", () => {
      const facts = makeFacts({ clientType: "ffetch", hasCircuitPlugin: false, errorRate: 0.30, http5xxShare: 0.30 })
      const recs = recommendForClient(
        [diag(DiagnosisId.SERVER_ERROR_DOMINANT), diag(DiagnosisId.HIGH_ERROR_RATE)],
        facts,
        BASE_RUN_FACTS
      )
      expect(recs.find(r => r.id === RecommendationId.ENABLE_CIRCUIT)).toBeDefined()
    })

    it("does NOT emit for ky (no circuit plugin support)", () => {
      const facts = makeFacts({ clientType: "ky", hasCircuitPlugin: false, errorRate: 0.30 })
      const recs = recommendForClient([diag(DiagnosisId.SERVER_ERROR_DOMINANT)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ENABLE_CIRCUIT)).toBeUndefined()
    })
  })

  describe("ENABLE_HEDGING", () => {
    it("emits for ffetch with tail latency instability and no hedge", () => {
      const facts = makeFacts({ clientType: "ffetch", hasHedgePlugin: false, tailRatio: 3.0, http5xxShare: 0.05 })
      const recs = recommendForClient([diag(DiagnosisId.TAIL_LATENCY_INSTABILITY)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ENABLE_HEDGING)).toBeDefined()
    })

    it("does NOT emit when 5xx share is high (server broken, hedging won't help)", () => {
      const facts = makeFacts({ clientType: "ffetch", hasHedgePlugin: false, tailRatio: 3.0, http5xxShare: 0.25 })
      const recs = recommendForClient([diag(DiagnosisId.TAIL_LATENCY_INSTABILITY)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ENABLE_HEDGING)).toBeUndefined()
    })

    it("does NOT emit when hedge already enabled", () => {
      const facts = makeFacts({ clientType: "ffetch", hasHedgePlugin: true, tailRatio: 3.0, http5xxShare: 0.05 })
      const recs = recommendForClient([diag(DiagnosisId.TAIL_LATENCY_INSTABILITY)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ENABLE_HEDGING)).toBeUndefined()
    })

    it("does NOT emit when retries already cause high transport amplification", () => {
      const facts = makeFacts({
        clientType: "ffetch",
        hasHedgePlugin: false,
        hasRetryConfig: true,
        tailRatio: 3.0,
        http5xxShare: 0.05,
        transportRatio: 1.8,
        retryTransportRatio: 1.8
      })
      const recs = recommendForClient([diag(DiagnosisId.TAIL_LATENCY_INSTABILITY)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.ENABLE_HEDGING)).toBeUndefined()
    })

    it("emits cautious wording when retries exist but amplification is controlled", () => {
      const facts = makeFacts({
        clientType: "ffetch",
        hasHedgePlugin: false,
        hasRetryConfig: true,
        tailRatio: 3.0,
        http5xxShare: 0.05,
        transportRatio: 1.2
      })
      const recs = recommendForClient([diag(DiagnosisId.TAIL_LATENCY_INSTABILITY)], facts, BASE_RUN_FACTS)
      const rec = recs.find(r => r.id === RecommendationId.ENABLE_HEDGING)
      expect(rec).toBeDefined()
      expect(rec?.description).toContain("low retries")
    })
  })

  describe("USE_FFETCH_FOR_PLUGINS", () => {
    it("emits for fetch with high error rate", () => {
      const facts = makeFacts({ clientType: "fetch", errorRate: 0.25 })
      const recs = recommendForClient([diag(DiagnosisId.HIGH_ERROR_RATE)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.USE_FFETCH_FOR_PLUGINS)).toBeDefined()
    })

    it("does NOT emit for ffetch client", () => {
      const facts = makeFacts({ clientType: "ffetch", errorRate: 0.25 })
      const recs = recommendForClient([diag(DiagnosisId.HIGH_ERROR_RATE)], facts, BASE_RUN_FACTS)
      expect(recs.find(r => r.id === RecommendationId.USE_FFETCH_FOR_PLUGINS)).toBeUndefined()
    })
  })

  describe("no diagnoses → no recommendations", () => {
    it("returns empty when there are no active diagnoses", () => {
      const recs = recommendForClient([], makeFacts(), BASE_RUN_FACTS)
      expect(recs).toHaveLength(0)
    })
  })

  describe("includeBlocked mode", () => {
    it("returns blocked details when cross-config guards suppress a recommendation", () => {
      const facts = makeFacts({
        clientType: "ffetch",
        hasRetryConfig: true,
        configuredRetryLimit: 2,
        retryMaxSaturation: 0.40,
        failAfterRetryRate: 0.50,
        configuredTimeoutMs: 350,
        p95: 310
      })
      const result = recommendForClient(
        [
          diag(DiagnosisId.RETRY_EXHAUSTING),
          diag(DiagnosisId.RETRY_INEFFECTIVE),
          diag(DiagnosisId.CLIENT_TIMEOUT_TIGHT)
        ],
        facts,
        BASE_RUN_FACTS,
        { includeBlocked: true }
      )

      expect(result.recommendations.find(r => r.id === RecommendationId.INCREASE_RETRY_LIMIT)).toBeUndefined()
      expect(result.blocked.length).toBeGreaterThan(0)
      expect(result.blocked.find(b => b.recommendationId === RecommendationId.INCREASE_RETRY_LIMIT)).toBeDefined()
      expect(result.blocked[0]).toHaveProperty("id")
      expect(result.blocked[0]).toHaveProperty("reason")
    })
  })
})
