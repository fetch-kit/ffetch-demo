import { describe, it, expect } from "vitest"
import { extractClientFacts, extractRunFacts } from "../../src/takeaways/facts.js"

function makeBucket(overrides = {}) {
  return {
    client: "test-client",
    summary: {
      total: 100,
      success: 80,
      thrown: 0,
      timeoutCount: 3,
      circuitCount: 0,
      status5xx: 12,
      throughputRps: 5,
      p50: 100,
      p95: 300,
      p99: 600,
      latencyN: 100,
      errorRate: 20,
      reliabilityScore: 75,
      errorCounts: { ok: 80, HTTP_503: 12, TimeoutError: 3, HTTP_429: 5 }
    },
    runtime: { transportAttempts: 130 },
    rows: [
      ...Array(80).fill(null).map((_, i) => ({ requestId: i + 1, ok: true, status: 200, retries: 0, deduped: false, errorName: "" })),
      ...Array(12).fill(null).map((_, i) => ({ requestId: 81 + i, ok: false, status: 503, retries: 1, deduped: false, errorName: "" })),
      ...Array(3).fill(null).map((_, i) => ({ requestId: 93 + i, ok: false, status: 0, retries: 0, deduped: false, errorName: "TimeoutError" })),
      ...Array(5).fill(null).map((_, i) => ({ requestId: 96 + i, ok: false, status: 429, retries: 2, deduped: false, errorName: "" })),
    ],
    ...overrides
  }
}

function makeInstance(type = "ffetch", configOverrides = {}) {
  return {
    type,
    config: {
      retries: 2,
      retryDelayMode: "fixed",
      retryDelayMs: 200,
      retryStatusCodes: [429, 500, 503],
      retryAfterStatusCodes: [429],
      useDedupePlugin: false,
      useCircuitPlugin: false,
      useHedgePlugin: false,
      timeoutMs: 3000,
      ...configOverrides
    }
  }
}

describe("extractClientFacts", () => {
  it("computes success/failure rates correctly", () => {
    const facts = extractClientFacts(makeBucket(), makeInstance())
    expect(facts.successRate).toBeCloseTo(0.8)
    expect(facts.errorRate).toBeCloseTo(0.2)
    expect(facts.total).toBe(100)
  })

  it("computes 429 and 5xx shares", () => {
    const facts = extractClientFacts(makeBucket(), makeInstance())
    expect(facts.http429Share).toBeCloseTo(0.05)
    expect(facts.http5xxShare).toBeCloseTo(0.12)
  })

  it("computes timeout share from error counts", () => {
    const facts = extractClientFacts(makeBucket(), makeInstance())
    expect(facts.timeoutShare).toBeCloseTo(0.03)
  })

  it("computes tail ratios", () => {
    const facts = extractClientFacts(makeBucket(), makeInstance())
    expect(facts.tailRatio).toBeCloseTo(600 / 300) // p99/p95
    expect(facts.spreadRatio).toBeCloseTo(300 / 100) // p95/p50
  })

  it("computes retry incidence and fail-after-retry rate", () => {
    const facts = extractClientFacts(makeBucket(), makeInstance())
    // 17 rows have retries > 0 (12 with retries=1, 5 with retries=2)
    expect(facts.retryIncidence).toBeCloseTo(17 / 100)
    // of those 17, the failing ones are: 12 + 5 = 17? wait — ok=false rows with retries
    // 12 (503) + 5 (429) = 17 have retries but all failed
    expect(facts.failAfterRetryRate).toBe(1.0)
  })

  it("computes transport ratio", () => {
    const facts = extractClientFacts(makeBucket(), makeInstance())
    expect(facts.transportRatio).toBeCloseTo(130 / 100)
    // 12 rows retries=1, 5 rows retries=2 → totalRetries = 12 + 10 = 22
    expect(facts.retryTransportRatio).toBeCloseTo(22 / 100)
    // hedgeTransportRatio = max(0, 1.3 - 1 - 0.22) = 0.08
    expect(facts.hedgeTransportRatio).toBeCloseTo(0.08, 1)
  })

  it("detects capability flags from config", () => {
    const facts = extractClientFacts(
      makeBucket(),
      makeInstance("ffetch", { useDedupePlugin: true, useCircuitPlugin: true, useHedgePlugin: true })
    )
    expect(facts.hasDedupePlugin).toBe(true)
    expect(facts.hasCircuitPlugin).toBe(true)
    expect(facts.hasHedgePlugin).toBe(true)
  })

  it("detects retryAfterStatusCodes presence", () => {
    const with429 = extractClientFacts(makeBucket(), makeInstance("ffetch", { retryAfterStatusCodes: [429] }))
    const without = extractClientFacts(makeBucket(), makeInstance("ffetch", { retryAfterStatusCodes: [] }))
    expect(with429.hasRetryAfterConfig).toBe(true)
    expect(without.hasRetryAfterConfig).toBe(false)
  })

  it("detects 429 in retryStatusCodes", () => {
    const has429 = extractClientFacts(makeBucket(), makeInstance("ffetch", { retryStatusCodes: [429, 503] }))
    const no429 = extractClientFacts(makeBucket(), makeInstance("ffetch", { retryStatusCodes: [503] }))
    expect(has429.has429InRetryStatusCodes).toBe(true)
    expect(no429.has429InRetryStatusCodes).toBe(false)
  })

  it("flags insufficient sample size", () => {
    const small = makeBucket()
    small.summary.total = 8
    small.summary.latencyN = 8
    small.rows = Array(8).fill({ requestId: 1, ok: false, status: 503, retries: 0, deduped: false, errorName: "" })
    const facts = extractClientFacts(small, makeInstance())
    expect(facts.insufficientSampleFlag).toBe(2)
  })

  it("computes retry max saturation (requests hitting limit)", () => {
    const bucket = makeBucket()
    // 5 rows with retries === configuredRetryLimit (2)
    const facts = extractClientFacts(bucket, makeInstance("ffetch", { retries: 2 }))
    expect(facts.retryMaxSaturation).toBeCloseTo(5 / 100)
  })

  it("computes dedupeRate", () => {
    const bucket = makeBucket()
    // add 10 deduped rows
    bucket.rows = [
      ...Array(90).fill({ requestId: 1, ok: true, status: 200, retries: 0, deduped: false, errorName: "" }),
      ...Array(10).fill({ requestId: 2, ok: true, status: 200, retries: 0, deduped: true, errorName: "" })
    ]
    bucket.summary.total = 100
    const facts = extractClientFacts(bucket, makeInstance())
    expect(facts.dedupeRate).toBeCloseTo(0.10)
  })

  it("handles no-retry client (fetch type)", () => {
    const facts = extractClientFacts(makeBucket(), { type: "fetch", config: { enabled: true } })
    expect(facts.hasRetryConfig).toBe(false)
    expect(facts.configuredRetryLimit).toBe(0)
  })

  it("handles ky retryLimit alias", () => {
    const facts = extractClientFacts(makeBucket(), makeInstance("ky", { retryLimit: 3, retries: undefined }))
    expect(facts.configuredRetryLimit).toBe(3)
    expect(facts.hasRetryConfig).toBe(true)
  })
})

describe("extractRunFacts", () => {
  it("detects rateLimit chaos", () => {
    const state = { chaosGlobal: [{ type: "rateLimit", limit: 10, windowMs: 1000, retryAfterMs: 0 }] }
    const facts = extractRunFacts(state)
    expect(facts.hasRateLimitChaos).toBe(true)
    expect(facts.hasRetryAfterChaos).toBe(false)
  })

  it("detects rateLimit chaos with Retry-After", () => {
    const state = { chaosGlobal: [{ type: "rateLimit", limit: 10, windowMs: 1000, retryAfterMs: 1000 }] }
    const facts = extractRunFacts(state)
    expect(facts.hasRateLimitChaos).toBe(true)
    expect(facts.hasRetryAfterChaos).toBe(true)
  })

  it("detects latency chaos", () => {
    const state = { chaosGlobal: [{ type: "latencyRange", minMs: 50, maxMs: 300 }] }
    const facts = extractRunFacts(state)
    expect(facts.hasLatencyChaos).toBe(true)
  })

  it("detects failRandomly and its rate", () => {
    const state = { chaosGlobal: [{ type: "failRandomly", rate: 0.3, status: 503 }] }
    const facts = extractRunFacts(state)
    expect(facts.hasFailRandomlyChaos).toBe(true)
    expect(facts.chaosFailRate).toBeCloseTo(0.3)
  })

  it("returns zero/false when no chaos rules", () => {
    const facts = extractRunFacts({ chaosGlobal: [] })
    expect(facts.hasRateLimitChaos).toBe(false)
    expect(facts.hasRetryAfterChaos).toBe(false)
    expect(facts.hasLatencyChaos).toBe(false)
    expect(facts.hasFailRandomlyChaos).toBe(false)
    expect(facts.chaosFailRate).toBe(0)
  })
})
