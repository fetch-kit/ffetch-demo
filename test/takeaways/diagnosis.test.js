import { describe, it, expect } from "vitest"
import { diagnoseClient } from "../../src/takeaways/diagnosis.js"
import { DiagnosisId, Severity } from "../../src/takeaways/types.js"

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
    tailRatio: 700 / 340,
    spreadRatio: 340 / 120,
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
    hasRetryAfterConfig: false,
    has429InRetryStatusCodes: false,
    configuredTimeoutMs: 3000,
    insufficientSampleFlag: 0,
    ...overrides
  }
}

describe("diagnoseClient", () => {
  describe("HIGH_ERROR_RATE", () => {
    it("emits when errorRate exceeds 20%", () => {
      const diagnoses = diagnoseClient(makeFacts({ errorRate: 0.25 }), BASE_RUN_FACTS)
      const d = diagnoses.find(d => d.id === DiagnosisId.HIGH_ERROR_RATE)
      expect(d).toBeDefined()
      expect(d.severity).toBe(Severity.MEDIUM)
    })

    it("emits HIGH severity at 40%+ error rate", () => {
      const diagnoses = diagnoseClient(makeFacts({ errorRate: 0.45, failureCount: 45, successCount: 55 }), BASE_RUN_FACTS)
      const d = diagnoses.find(d => d.id === DiagnosisId.HIGH_ERROR_RATE)
      expect(d?.severity).toBe(Severity.HIGH)
    })

    it("does not emit below threshold", () => {
      const diagnoses = diagnoseClient(makeFacts({ errorRate: 0.10, failureCount: 10, successCount: 90 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.HIGH_ERROR_RATE)).toBeUndefined()
    })
  })

  describe("RATE_LIMIT_DOMINANT", () => {
    it("emits when 429 share >= 12%", () => {
      const diagnoses = diagnoseClient(makeFacts({ http429Share: 0.15 }), BASE_RUN_FACTS)
      const d = diagnoses.find(d => d.id === DiagnosisId.RATE_LIMIT_DOMINANT)
      expect(d).toBeDefined()
    })

    it("does not emit below threshold", () => {
      const diagnoses = diagnoseClient(makeFacts({ http429Share: 0.08 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.RATE_LIMIT_DOMINANT)).toBeUndefined()
    })

    it("includes Retry-After evidence in diagnosis", () => {
      const runFacts = { ...BASE_RUN_FACTS, hasRetryAfterChaos: true }
      const diagnoses = diagnoseClient(makeFacts({ http429Share: 0.20 }), runFacts)
      const d = diagnoses.find(d => d.id === DiagnosisId.RATE_LIMIT_DOMINANT)
      expect(d?.evidence?.hasRetryAfterChaos).toBe(true)
    })
  })

  describe("SERVER_ERROR_DOMINANT", () => {
    it("emits when 5xx share >= 15%", () => {
      const diagnoses = diagnoseClient(makeFacts({ http5xxShare: 0.20 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.SERVER_ERROR_DOMINANT)).toBeDefined()
    })

    it("does not emit below threshold", () => {
      const diagnoses = diagnoseClient(makeFacts({ http5xxShare: 0.10 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.SERVER_ERROR_DOMINANT)).toBeUndefined()
    })
  })

  describe("TIMEOUT_DOMINANT", () => {
    it("emits when timeout share >= 10%", () => {
      const diagnoses = diagnoseClient(makeFacts({ timeoutShare: 0.12 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.TIMEOUT_DOMINANT)).toBeDefined()
    })
  })

  describe("TAIL_LATENCY_INSTABILITY", () => {
    it("emits when tailRatio >= 2", () => {
      const diagnoses = diagnoseClient(makeFacts({ tailRatio: 2.5, p95: 300, p99: 750 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.TAIL_LATENCY_INSTABILITY)).toBeDefined()
    })

    it("emits when spreadRatio >= 3", () => {
      const diagnoses = diagnoseClient(makeFacts({ spreadRatio: 4.0, tailRatio: 1.2 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.TAIL_LATENCY_INSTABILITY)).toBeDefined()
    })

    it("does not emit for stable latency", () => {
      const diagnoses = diagnoseClient(makeFacts({ tailRatio: 1.3, spreadRatio: 1.8 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.TAIL_LATENCY_INSTABILITY)).toBeUndefined()
    })

    it("does not emit from spread-only signal when p99-p95 gap is thin", () => {
      const diagnoses = diagnoseClient(
        makeFacts({ spreadRatio: 3.7, tailRatio: 1.05, p95: 2043, p99: 2142 }),
        BASE_RUN_FACTS
      )
      expect(diagnoses.find(d => d.id === DiagnosisId.TAIL_LATENCY_INSTABILITY)).toBeUndefined()
    })
  })

  describe("RETRY_INEFFECTIVE", () => {
    it("emits when retries are common and fail-after-retry is high", () => {
      const diagnoses = diagnoseClient(makeFacts({
        hasRetryConfig: true,
        retryIncidence: 0.30,
        failAfterRetryRate: 0.50
      }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.RETRY_INEFFECTIVE)).toBeDefined()
    })

    it("does not emit when retry incidence is low", () => {
      const diagnoses = diagnoseClient(makeFacts({
        hasRetryConfig: true,
        retryIncidence: 0.10,
        failAfterRetryRate: 0.80
      }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.RETRY_INEFFECTIVE)).toBeUndefined()
    })

    it("does not emit when fail-after-retry rate is low", () => {
      const diagnoses = diagnoseClient(makeFacts({
        hasRetryConfig: true,
        retryIncidence: 0.40,
        failAfterRetryRate: 0.10
      }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.RETRY_INEFFECTIVE)).toBeUndefined()
    })
  })

  describe("RETRY_EXHAUSTING", () => {
    it("emits when many requests hit max retry limit", () => {
      const diagnoses = diagnoseClient(makeFacts({
        hasRetryConfig: true,
        retryMaxSaturation: 0.40
      }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.RETRY_EXHAUSTING)).toBeDefined()
    })
  })

  describe("CLIENT_NO_RETRY", () => {
    it("emits when client has no retry and errorRate is high", () => {
      const diagnoses = diagnoseClient(makeFacts({
        hasRetryConfig: false,
        configuredRetryLimit: 0,
        errorRate: 0.20
      }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.CLIENT_NO_RETRY)).toBeDefined()
    })

    it("does not emit when errorRate is low", () => {
      const diagnoses = diagnoseClient(makeFacts({
        hasRetryConfig: false,
        configuredRetryLimit: 0,
        errorRate: 0.05
      }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.CLIENT_NO_RETRY)).toBeUndefined()
    })
  })

  describe("CIRCUIT_FREQUENT", () => {
    it("emits when circuit share >= 8%", () => {
      const diagnoses = diagnoseClient(makeFacts({ circuitShare: 0.10 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.CIRCUIT_FREQUENT)).toBeDefined()
    })
  })

  describe("DEDUPE_UNDERUTILIZED", () => {
    it("emits when dedupe is on but rate < 5%", () => {
      const diagnoses = diagnoseClient(makeFacts({ hasDedupePlugin: true, dedupeRate: 0.01 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.DEDUPE_UNDERUTILIZED)).toBeDefined()
    })

    it("does not emit when dedupe is off", () => {
      const diagnoses = diagnoseClient(makeFacts({ hasDedupePlugin: false, dedupeRate: 0.01 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.DEDUPE_UNDERUTILIZED)).toBeUndefined()
    })
  })

  describe("HEDGING_COST_HIGH", () => {
    it("emits when hedge is on and transport ratio is high", () => {
      const diagnoses = diagnoseClient(makeFacts({ hasHedgePlugin: true, transportRatio: 2.0, hedgeTransportRatio: 1.8, tailRatio: 3.0 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.HEDGING_COST_HIGH)).toBeDefined()
    })
  })

  describe("CLIENT_TIMEOUT_TIGHT", () => {
    it("emits when timeout <= 1.3x p95", () => {
      const diagnoses = diagnoseClient(makeFacts({ configuredTimeoutMs: 350, p95: 310 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.CLIENT_TIMEOUT_TIGHT)).toBeDefined()
    })

    it("does not emit when timeout is comfortable above p95", () => {
      const diagnoses = diagnoseClient(makeFacts({ configuredTimeoutMs: 3000, p95: 300 }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.CLIENT_TIMEOUT_TIGHT)).toBeUndefined()
    })
  })

  describe("RETRY_AFTER_UNHONORABLE", () => {
    it("emits when Retry-After chaos is active but client has no retryAfterStatusCodes", () => {
      const runFacts = { ...BASE_RUN_FACTS, hasRetryAfterChaos: true }
      const diagnoses = diagnoseClient(makeFacts({ http429Share: 0.20, hasRetryAfterConfig: false }), runFacts)
      expect(diagnoses.find(d => d.id === DiagnosisId.RETRY_AFTER_UNHONORABLE)).toBeDefined()
    })

    it("does not emit when client already has retryAfterStatusCodes configured", () => {
      const runFacts = { ...BASE_RUN_FACTS, hasRetryAfterChaos: true }
      const diagnoses = diagnoseClient(makeFacts({ http429Share: 0.20, hasRetryAfterConfig: true }), runFacts)
      expect(diagnoses.find(d => d.id === DiagnosisId.RETRY_AFTER_UNHONORABLE)).toBeUndefined()
    })

    it("does not emit when 429 share is below threshold", () => {
      const runFacts = { ...BASE_RUN_FACTS, hasRetryAfterChaos: true }
      const diagnoses = diagnoseClient(makeFacts({ http429Share: 0.05, hasRetryAfterConfig: false }), runFacts)
      expect(diagnoses.find(d => d.id === DiagnosisId.RETRY_AFTER_UNHONORABLE)).toBeUndefined()
    })
  })

  describe("MIXED_ERROR_MODES", () => {
    it("emits when two or more dominant failure modes coexist", () => {
      const diagnoses = diagnoseClient(makeFacts({
        http429Share: 0.15,  // dominant
        http5xxShare: 0.18,  // dominant
        timeoutShare: 0.02,
        circuitShare: 0.01
      }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.MIXED_ERROR_MODES)).toBeDefined()
    })

    it("does not emit when only one mode is dominant", () => {
      const diagnoses = diagnoseClient(makeFacts({
        http429Share: 0.02,
        http5xxShare: 0.20,
        timeoutShare: 0.02,
        circuitShare: 0.01
      }), BASE_RUN_FACTS)
      expect(diagnoses.find(d => d.id === DiagnosisId.MIXED_ERROR_MODES)).toBeUndefined()
    })
  })

  describe("evidence and confidence", () => {
    it("includes relevant numbers in evidence", () => {
      const diagnoses = diagnoseClient(makeFacts({ http429Share: 0.20 }), BASE_RUN_FACTS)
      const d = diagnoses.find(d => d.id === DiagnosisId.RATE_LIMIT_DOMINANT)
      expect(d?.evidence).toHaveProperty("http429Share")
    })

    it("confidence is strictly between 0 and 1", () => {
      const diagnoses = diagnoseClient(makeFacts({ http5xxShare: 0.50, errorRate: 0.50 }), BASE_RUN_FACTS)
      for (const d of diagnoses) {
        expect(d.confidence).toBeGreaterThan(0)
        expect(d.confidence).toBeLessThanOrEqual(1)
      }
    })
  })
})
