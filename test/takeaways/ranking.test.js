import { describe, it, expect } from "vitest"
import { rank } from "../../src/takeaways/ranking.js"
import { Severity, DiagnosisId, RecommendationId } from "../../src/takeaways/types.js"

function diag(id, severity, clientName = "test") {
  return { id, severity, clientName, summary: "", evidence: {}, confidence: severity === Severity.HIGH ? 0.9 : 0.6 }
}

function rec(id, severity, clientName = "test", conflicts = []) {
  return { id, severity, clientName, title: id, description: "", basedOn: [], evidence: {}, conflicts }
}

describe("rank", () => {
  describe("diagnoses ordering", () => {
    it("places HIGH severity before MEDIUM before LOW", () => {
      const { diagnoses } = rank([
        diag(DiagnosisId.RETRY_INEFFECTIVE, Severity.LOW),
        diag(DiagnosisId.HIGH_ERROR_RATE, Severity.HIGH),
        diag(DiagnosisId.RATE_LIMIT_DOMINANT, Severity.MEDIUM)
      ], [])
      expect(diagnoses[0].severity).toBe(Severity.HIGH)
      expect(diagnoses[1].severity).toBe(Severity.MEDIUM)
      expect(diagnoses[2].severity).toBe(Severity.LOW)
    })

    it("is stable for identical severity (sorted by clientName then id)", () => {
      const { diagnoses } = rank([
        diag(DiagnosisId.RATE_LIMIT_DOMINANT, Severity.MEDIUM, "client-b"),
        diag(DiagnosisId.HIGH_ERROR_RATE, Severity.MEDIUM, "client-a"),
        diag(DiagnosisId.RETRY_INEFFECTIVE, Severity.MEDIUM, "client-a")
      ], [])
      expect(diagnoses[0].clientName).toBe("client-a")
      expect(diagnoses[2].clientName).toBe("client-b")
    })

    it("returns all passed diagnoses, never drops based on count", () => {
      const input = Array.from({ length: 10 }, (_, i) =>
        diag(`DIAG_${i}`, Severity.LOW)
      )
      const { diagnoses } = rank(input, [])
      expect(diagnoses).toHaveLength(10)
    })
  })

  describe("recommendations ordering", () => {
    it("places HIGH severity recommendations first", () => {
      const { recommendations } = rank([], [
        rec(RecommendationId.ENABLE_HEDGING, Severity.LOW),
        rec(RecommendationId.ADD_RETRY, Severity.HIGH),
        rec(RecommendationId.ENABLE_CIRCUIT, Severity.MEDIUM)
      ])
      expect(recommendations[0].id).toBe(RecommendationId.ADD_RETRY)
      expect(recommendations[2].id).toBe(RecommendationId.ENABLE_HEDGING)
    })

    it("is stable for tied severity (sorted id + clientName)", () => {
      const { recommendations } = rank([], [
        rec(RecommendationId.REDUCE_CONCURRENCY, Severity.MEDIUM),
        rec(RecommendationId.ADD_RETRY, Severity.MEDIUM)
      ])
      expect(recommendations[0].id).toBe(RecommendationId.ADD_RETRY)
      expect(recommendations[1].id).toBe(RecommendationId.REDUCE_CONCURRENCY)
    })
  })

  describe("conflict resolution", () => {
    it("removes lower-severity conflicting recommendation", () => {
      const { recommendations } = rank([], [
        rec(RecommendationId.INCREASE_RETRY_LIMIT, Severity.HIGH, "test", [RecommendationId.REDUCE_RETRY_LIMIT]),
        rec(RecommendationId.REDUCE_RETRY_LIMIT, Severity.LOW, "test", [RecommendationId.INCREASE_RETRY_LIMIT])
      ])
      const ids = recommendations.map(r => r.id)
      expect(ids).toContain(RecommendationId.INCREASE_RETRY_LIMIT)
      expect(ids).not.toContain(RecommendationId.REDUCE_RETRY_LIMIT)
    })

    it("keeps higher-severity one when conflict is declared", () => {
      const { recommendations } = rank([], [
        rec(RecommendationId.REDUCE_RETRY_LIMIT, Severity.HIGH, "test", [RecommendationId.ADD_RETRY]),
        rec(RecommendationId.ADD_RETRY, Severity.LOW, "test", [RecommendationId.REDUCE_RETRY_LIMIT])
      ])
      const ids = recommendations.map(r => r.id)
      expect(ids).toContain(RecommendationId.REDUCE_RETRY_LIMIT)
      expect(ids).not.toContain(RecommendationId.ADD_RETRY)
    })

    it("conflict resolution is scoped per clientName — different clients don't affect each other", () => {
      const { recommendations } = rank([], [
        rec(RecommendationId.INCREASE_RETRY_LIMIT, Severity.HIGH, "client-a", [RecommendationId.REDUCE_RETRY_LIMIT]),
        rec(RecommendationId.REDUCE_RETRY_LIMIT, Severity.LOW, "client-a", [RecommendationId.INCREASE_RETRY_LIMIT]),
        rec(RecommendationId.REDUCE_RETRY_LIMIT, Severity.HIGH, "client-b", [RecommendationId.INCREASE_RETRY_LIMIT])
      ])
      const clientA = recommendations.filter(r => r.clientName === "client-a").map(r => r.id)
      const clientB = recommendations.filter(r => r.clientName === "client-b").map(r => r.id)
      expect(clientA).toContain(RecommendationId.INCREASE_RETRY_LIMIT)
      expect(clientA).not.toContain(RecommendationId.REDUCE_RETRY_LIMIT)
      expect(clientB).toContain(RecommendationId.REDUCE_RETRY_LIMIT)
    })
  })

  describe("empty inputs", () => {
    it("handles empty arrays without error", () => {
      const result = rank([], [])
      expect(result.diagnoses).toHaveLength(0)
      expect(result.recommendations).toHaveLength(0)
    })
  })

  describe("determinism", () => {
    it("produces identical output for identical input on repeated calls", () => {
      const diagnoses = [
        diag(DiagnosisId.RATE_LIMIT_DOMINANT, Severity.HIGH),
        diag(DiagnosisId.RETRY_INEFFECTIVE, Severity.MEDIUM),
        diag(DiagnosisId.TAIL_LATENCY_INSTABILITY, Severity.LOW)
      ]
      const recs = [
        rec(RecommendationId.ADD_RETRY, Severity.HIGH),
        rec(RecommendationId.ENABLE_CIRCUIT, Severity.MEDIUM),
        rec(RecommendationId.ENABLE_HEDGING, Severity.LOW)
      ]
      const r1 = rank([...diagnoses], [...recs])
      const r2 = rank([...diagnoses], [...recs])
      expect(r1.diagnoses.map(d => d.id)).toEqual(r2.diagnoses.map(d => d.id))
      expect(r1.recommendations.map(r => r.id)).toEqual(r2.recommendations.map(r => r.id))
    })
  })
})
