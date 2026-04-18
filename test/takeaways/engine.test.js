import { describe, it, expect } from "vitest"
import { analyzeTakeaways } from "../../src/takeaways/engine.js"
import { DiagnosisId, RecommendationId, Severity } from "../../src/takeaways/types.js"

function makeRun(clientOverrides = {}) {
  return {
    clients: [
      {
        client: "ffetch-test",
        summary: {
          total: 100,
          success: 70,
          thrown: 0,
          timeoutCount: 0,
          circuitCount: 0,
          status5xx: 20,
          throughputRps: 4,
          p50: 120,
          p95: 350,
          p99: 900,
          latencyN: 100,
          errorRate: 30,
          reliabilityScore: 65,
          errorCounts: { ok: 70, HTTP_503: 20, HTTP_429: 10 }
        },
        runtime: { transportAttempts: 140 },
        rows: [
          ...Array(70).fill({ requestId: 1, ok: true, status: 200, retries: 0, deduped: false, errorName: "" }),
          ...Array(20).fill({ requestId: 2, ok: false, status: 503, retries: 2, deduped: false, errorName: "" }),
          ...Array(10).fill({ requestId: 3, ok: false, status: 429, retries: 2, deduped: false, errorName: "" }),
        ],
        ...clientOverrides
      }
    ]
  }
}

function makeState(configOverrides = {}, chaosOverrides = []) {
  return {
    chaosGlobal: chaosOverrides.length > 0 ? chaosOverrides : [
      { type: "latencyRange", minMs: 50, maxMs: 300 },
      { type: "failRandomly", rate: 0.2, status: 503, body: "fail" }
    ],
    clientInstances: [
      {
        id: "instance-1",
        type: "ffetch",
        label: "ffetch-test",
        config: {
          enabled: true,
          timeoutMs: 3000,
          retries: 2,
          retryDelayMode: "fixed",
          retryDelayMs: 200,
          retryStatusCodes: [429, 500, 503],
          retryAfterStatusCodes: [429],
          useDedupePlugin: false,
          useCircuitPlugin: false,
          useHedgePlugin: false,
          ...configOverrides
        }
      }
    ]
  }
}

describe("analyzeTakeaways", () => {
  describe("valid run with dominant failures", () => {
    it("returns non-empty diagnoses and recommendations", () => {
      const result = analyzeTakeaways(makeRun(), makeState())
      expect(result.diagnoses.length).toBeGreaterThan(0)
      expect(result.recommendations.length).toBeGreaterThan(0)
    })

    it("detects at least HIGH_ERROR_RATE or SERVER_ERROR_DOMINANT", () => {
      const result = analyzeTakeaways(makeRun(), makeState())
      const ids = result.diagnoses.map(d => d.id)
      expect(
        ids.includes(DiagnosisId.HIGH_ERROR_RATE) || ids.includes(DiagnosisId.SERVER_ERROR_DOMINANT)
      ).toBe(true)
    })

    it("diagnoses are sorted by severity (highest first)", () => {
      const result = analyzeTakeaways(makeRun(), makeState())
      const severities = result.diagnoses.map(d => d.severity)
      const order = { high: 3, medium: 2, low: 1, info: 0 }
      for (let i = 0; i < severities.length - 1; i++) {
        expect(order[severities[i]] >= order[severities[i + 1]]).toBe(true)
      }
    })

    it("all recommendations reference valid client names", () => {
      const result = analyzeTakeaways(makeRun(), makeState())
      for (const rec of result.recommendations) {
        expect(rec.clientName).toBe("ffetch-test")
      }
    })
  })

  describe("Retry-After guard", () => {
    it("emits RETRY_AFTER_UNHONORABLE when chaos sends Retry-After but client has none configured", () => {
      const state = makeState(
        { retryAfterStatusCodes: [] },  // no client Retry-After config
        [{ type: "rateLimit", limit: 5, windowMs: 1000, retryAfterMs: 1000 }]
      )
      const run = makeRun({
        summary: {
          total: 100, success: 75, thrown: 0, timeoutCount: 0, circuitCount: 0, status5xx: 10,
          throughputRps: 4, p50: 100, p95: 300, p99: 600, latencyN: 100, errorRate: 25,
          reliabilityScore: 70, errorCounts: { ok: 75, HTTP_429: 15, HTTP_503: 10 }
        },
        rows: [
          ...Array(75).fill({ requestId: 1, ok: true, status: 200, retries: 0, deduped: false, errorName: "" }),
          ...Array(15).fill({ requestId: 2, ok: false, status: 429, retries: 0, deduped: false, errorName: "" }),
          ...Array(10).fill({ requestId: 3, ok: false, status: 503, retries: 0, deduped: false, errorName: "" })
        ]
      })
      const result = analyzeTakeaways(run, state)
      expect(result.diagnoses.some(d => d.id === DiagnosisId.RETRY_AFTER_UNHONORABLE)).toBe(true)
    })

    it("does NOT emit RETRY_AFTER_UNHONORABLE when client already has retryAfterStatusCodes", () => {
      const state = makeState(
        { retryAfterStatusCodes: [429, 503] },  // already configured
        [{ type: "rateLimit", limit: 5, windowMs: 1000, retryAfterMs: 1000 }]
      )
      const result = analyzeTakeaways(makeRun(), state)
      expect(result.diagnoses.some(d => d.id === DiagnosisId.RETRY_AFTER_UNHONORABLE)).toBe(false)
    })
  })

  describe("edge cases", () => {
    it("returns empty result when run is null", () => {
      const result = analyzeTakeaways(null, makeState())
      expect(result.diagnoses).toHaveLength(0)
      expect(result.recommendations).toHaveLength(0)
    })

    it("returns empty result when run has no clients", () => {
      const result = analyzeTakeaways({ clients: [] }, makeState())
      expect(result.diagnoses).toHaveLength(0)
    })

    it("skips clients with fewer than 5 requests", () => {
      const run = makeRun()
      run.clients[0].summary.total = 3
      run.clients[0].rows = Array(3).fill({ requestId: 1, ok: false, status: 503, retries: 0, deduped: false, errorName: "" })
      const result = analyzeTakeaways(run, makeState())
      expect(result.diagnoses).toHaveLength(0)
    })

    it("is deterministic — identical input yields identical output on repeated calls", () => {
      const run = makeRun()
      const state = makeState()
      const r1 = analyzeTakeaways(run, state)
      const r2 = analyzeTakeaways(run, state)
      expect(r1.diagnoses.map(d => d.id)).toEqual(r2.diagnoses.map(d => d.id))
      expect(r1.recommendations.map(r => r.id)).toEqual(r2.recommendations.map(r => r.id))
    })
  })

  describe("no-chaos clean run produces minimal output", () => {
    it("produces no high-severity diagnoses for near-perfect run", () => {
      const cleanRun = {
        clients: [{
          client: "ffetch-test",
          summary: {
            total: 100, success: 98, thrown: 0, timeoutCount: 0, circuitCount: 0, status5xx: 0,
            throughputRps: 10, p50: 80, p95: 150, p99: 200, latencyN: 100, errorRate: 2,
            reliabilityScore: 97, errorCounts: { ok: 98, HTTP_503: 2 }
          },
          runtime: { transportAttempts: 100 },
          rows: [
            ...Array(98).fill({ requestId: 1, ok: true, status: 200, retries: 0, deduped: false, errorName: "" }),
            ...Array(2).fill({ requestId: 2, ok: false, status: 503, retries: 0, deduped: false, errorName: "" })
          ]
        }]
      }
      const result = analyzeTakeaways(cleanRun, makeState({},[]))
      const highSeverity = result.diagnoses.filter(d => d.severity === Severity.HIGH)
      expect(highSeverity).toHaveLength(0)
    })
  })
})
