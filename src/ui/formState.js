import { RULE_FIELDS } from "./templates"

function csvToNumbers(value) {
  return value
    .split(",")
    .map((token) => Number(token.trim()))
    .filter((num) => Number.isFinite(num))
}

function csvToStrings(value) {
  return value
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

function parseRuleNode(node) {
  const type = node.querySelector(".rule-type")?.value || "latencyRange"
  const rule = { type }
  const fields = RULE_FIELDS[type] || []
  for (const field of fields) {
    const input = node.querySelector(`[data-key="${field.key}"]`)
    if (!input) continue
    if (field.type === "number") rule[field.key] = Number(input.value)
    else rule[field.key] = input.value
  }
  return rule
}

export function readInputs(app, state) {
  state.scenarioPreset = app.querySelector("#preset").value
  state.targetUrl = app.querySelector("#target-url").value.trim()
  state.requestCount = Number(app.querySelector("#request-count").value)
  state.concurrency = Number(app.querySelector("#concurrency").value)

  state.chaosGlobal = [...app.querySelectorAll(".global-rule")].map(parseRuleNode)

  state.clients.fetch.enabled = app.querySelector("#fetch-enabled").checked

  state.clients.ky.enabled = app.querySelector("#ky-enabled").checked
  state.clients.ky.throwHttpErrors = app.querySelector("#ky-throw").checked
  state.clients.ky.timeoutMs = Number(app.querySelector("#ky-timeout").value)
  state.clients.ky.retryLimit = Number(app.querySelector("#ky-retry").value)
  state.clients.ky.backoffBaseMs = Number(app.querySelector("#ky-backoff-base").value)
  state.clients.ky.backoffMaxMs = Number(app.querySelector("#ky-backoff-max").value)
  state.clients.ky.retryStatusCodes = csvToNumbers(app.querySelector("#ky-status-codes").value)
  state.clients.ky.retryAfterStatusCodes = csvToNumbers(app.querySelector("#ky-after-codes").value)

  state.clients.ffetch.enabled = app.querySelector("#ffetch-enabled").checked
  state.clients.ffetch.throwOnHttpError = app.querySelector("#ffetch-throw").checked
  state.clients.ffetch.timeoutMs = Number(app.querySelector("#ffetch-timeout").value)
  state.clients.ffetch.retries = Number(app.querySelector("#ffetch-retries").value)
  state.clients.ffetch.retryDelayMode = app.querySelector("#ffetch-delay-mode").value
  state.clients.ffetch.retryDelayMs = Number(app.querySelector("#ffetch-delay-ms").value)
  state.clients.ffetch.useDedupePlugin = app.querySelector("#ffetch-dedupe").checked
  state.clients.ffetch.useCircuitPlugin = app.querySelector("#ffetch-circuit").checked
  state.clients.ffetch.dedupeTtlMs = Number(app.querySelector("#ffetch-dedupe-ttl").value)
  state.clients.ffetch.dedupeSweepIntervalMs = Number(app.querySelector("#ffetch-dedupe-sweep").value)
  state.clients.ffetch.circuitThreshold = Number(app.querySelector("#ffetch-circuit-threshold").value)
  state.clients.ffetch.circuitResetMs = Number(app.querySelector("#ffetch-circuit-reset").value)

  state.clients.axios.enabled = app.querySelector("#axios-enabled").checked
  state.clients.axios.timeoutMs = Number(app.querySelector("#axios-timeout").value)
}
