import { extractClientFacts, extractRunFacts } from "./facts.js"
import { diagnoseClient } from "./diagnosis.js"
import { recommendForClient } from "./recommendations.js"
import { rank } from "./ranking.js"

/**
 * Run the full takaways pipeline over a completed run + arena state.
 *
 * @param {{ clients: Array<{ client: string, summary: object, runtime: object, rows: object[] }> }} run
 * @param {object} state - full arena state (for chaos rules and client instance configs)
 * @returns {import('./types.js').TakeawaysResult}
 */
export function analyzeTakeaways(run, state) {
  if (!run || !Array.isArray(run.clients) || run.clients.length === 0) {
    return { diagnoses: [], recommendations: [], blocked: [] }
  }

  const instances = state?.clientInstances || []
  const runFacts = extractRunFacts(state)

  const allDiagnoses = []
  const allRecommendations = []
  const allBlocked = []

  for (const bucket of run.clients) {
    // match the state client instance for capability/config guards
    const instance = instances.find(i => i.label === bucket.client || i.id === bucket.client)
      ?? { type: "fetch", config: {} }

    const facts = extractClientFacts(bucket, instance)

    // skip degenerate or tiny samples from producing noisy output
    if (facts.total < 5) continue

    const diagnoses = diagnoseClient(facts, runFacts)
    const recommendationResult = recommendForClient(diagnoses, facts, runFacts, { includeBlocked: true })
    const recommendations = recommendationResult.recommendations || []
    const blocked = recommendationResult.blocked || []

    allDiagnoses.push(...diagnoses)
    allRecommendations.push(...recommendations)
    allBlocked.push(
      ...blocked.map((b) => ({
        clientName: facts.clientName,
        recommendationId: b.recommendationId,
        ruleId: b.id,
        reason: b.reason
      }))
    )
  }

  const ranked = rank(allDiagnoses, allRecommendations)
  return {
    ...ranked,
    blocked: allBlocked
  }
}
