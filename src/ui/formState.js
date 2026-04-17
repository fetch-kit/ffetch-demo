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

function parseClientFieldValue(input) {
  if (!input) return undefined
  if (input.type === "checkbox") return input.checked
  if (input.type === "number") return Number(input.value)
  return input.value
}

function parseClientInstances(app, state) {
  const cards = [...app.querySelectorAll("[data-client-instance-id]")]
  state.clientInstances = cards.map((card) => {
    const id = card.getAttribute("data-client-instance-id")
    const type = card.querySelector("h3")?.textContent?.trim() || "fetch"
    const current = (state.clientInstances || []).find((instance) => instance.id === id)
    const config = { ...(current?.config || {}) }
    let label = current?.label || type

    for (const input of card.querySelectorAll("[data-field]")) {
      const key = input.getAttribute("data-field")
      const value = parseClientFieldValue(input)
      if (key === "label") {
        label = String(value || type)
      } else if (key === "retryStatusCodes" || key === "retryAfterStatusCodes") {
        config[key] = csvToNumbers(String(value || ""))
      } else {
        config[key] = value
      }
    }

    return {
      id,
      type,
      label,
      config
    }
  })
}

export function readInputs(app, state) {
  state.scenarioPreset = app.querySelector("#preset").value
  state.targetUrl = app.querySelector("#target-url").value.trim()
  state.requestCount = Number(app.querySelector("#request-count").value)
  state.concurrency = Number(app.querySelector("#concurrency").value)

  state.chaosGlobal = [...app.querySelectorAll(".global-rule")].map(parseRuleNode)
  parseClientInstances(app, state)
}
