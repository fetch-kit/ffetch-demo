import { SEVERITY_RANK } from "./types.js"

/**
 * Remove conflicting recommendations.
 * For each recommendation keep only the highest-severity one from each conflict group.
 *
 * @param {import('./types.js').Recommendation[]} recommendations
 * @returns {import('./types.js').Recommendation[]}
 */
function resolveConflicts(recommendations) {
  const removed = new Set()

  for (const rec of recommendations) {
    if (removed.has(rec.id + rec.clientName)) continue
    for (const conflictId of rec.conflicts || []) {
      const conflicting = recommendations.find(
        r => r.id === conflictId && r.clientName === rec.clientName && !removed.has(r.id + r.clientName)
      )
      if (!conflicting) continue
      // Keep higher severity; on tie, keep the first encountered (already ranked)
      const keepCurrent = SEVERITY_RANK[rec.severity] >= SEVERITY_RANK[conflicting.severity]
      if (keepCurrent) {
        removed.add(conflictId + rec.clientName)
      } else {
        removed.add(rec.id + rec.clientName)
      }
    }
  }

  return recommendations.filter(r => !removed.has(r.id + r.clientName))
}

/**
 * Deterministically sort and de-duplicate diagnoses and recommendations.
 * All dominant items above threshold are kept (no artificial top-N cap).
 *
 * @param {import('./types.js').Diagnosis[]} diagnoses
 * @param {import('./types.js').Recommendation[]} recommendations
 * @returns {{ diagnoses: import('./types.js').Diagnosis[], recommendations: import('./types.js').Recommendation[] }}
 */
export function rank(diagnoses, recommendations) {
  const sortedDiagnoses = [...diagnoses].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    if (severityDiff !== 0) return severityDiff
    const confDiff = b.confidence - a.confidence
    if (Math.abs(confDiff) > 0.05) return confDiff
    // stable tie-break: client name then id
    if (a.clientName < b.clientName) return -1
    if (a.clientName > b.clientName) return 1
    return a.id.localeCompare(b.id)
  })

  const resolved = resolveConflicts(recommendations)

  const sortedRecs = resolved.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    if (severityDiff !== 0) return severityDiff
    // stable tie-break: client name then id
    if (a.clientName < b.clientName) return -1
    if (a.clientName > b.clientName) return 1
    return a.id.localeCompare(b.id)
  })

  return { diagnoses: sortedDiagnoses, recommendations: sortedRecs }
}
