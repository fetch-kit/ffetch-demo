import "./styles.css"
import { createState, applyPreset, createClientInstance } from "./state"
import { runExperiment } from "./runner"
import { readInputs } from "./ui/formState"
import { createHelpOverlay } from "./ui/helpOverlay"
import { createProgressOverlay } from "./ui/progressOverlay"
import { newRule, renderApp } from "./ui/templates"

const state = createState()
const app = document.querySelector("#app")
const helpOverlay = createHelpOverlay(document)
const progressOverlay = createProgressOverlay(document)

let lastRun = null

function clone(value) {
  return structuredClone(value)
}

function ensureRuntimeMetrics(run, requestedConcurrency) {
  if (!run || !Array.isArray(run.clients)) return run

  const safeRequested = Math.max(1, Number(requestedConcurrency) || 1)
  run.clients = run.clients.map((bucket) => {
    const runtime = bucket.runtime || {}
    const transportPeak = Math.max(0, Number(runtime.transportPeakInFlight ?? runtime.networkPeakInFlight) || 0)
    const transportAvg = Number((runtime.transportAvgInFlight ?? runtime.networkAvgInFlight) || 0)
    const transportAttempts = Math.max(0, Number(runtime.transportAttempts ?? runtime.networkAttempts) || 0)
    const upstreamFetchPeak = Math.max(0, Number(runtime.upstreamFetchPeakInFlight) || 0)
    const upstreamFetchCalls = Math.max(0, Number(runtime.upstreamFetchCalls) || 0)
    const shortCircuitedCalls = Math.max(0, Number(runtime.shortCircuitedCalls) || 0)
    return {
      ...bucket,
      runtime: {
        requestedConcurrency: Math.max(1, Number(runtime.requestedConcurrency) || safeRequested),
        logicalPeakInFlight: Math.max(0, Number(runtime.logicalPeakInFlight) || 0),
        logicalAvgInFlight: Number(runtime.logicalAvgInFlight || 0),
        transportPeakInFlight: transportPeak,
        transportAvgInFlight: transportAvg,
        transportAttempts,
        transportPeakVsRequestedPct: Number(runtime.transportPeakVsRequestedPct || ((transportPeak / safeRequested) * 100).toFixed(1)),
        upstreamFetchPeakInFlight: upstreamFetchPeak,
        upstreamFetchCalls,
        shortCircuitedCalls,
        upstreamFetchPeakVsRequestedPct: Number(runtime.upstreamFetchPeakVsRequestedPct || ((upstreamFetchPeak / safeRequested) * 100).toFixed(1))
      }
    }
  })

  return run
}

function exportSnapshot() {
  if (!lastRun) return
  const run = ensureRuntimeMetrics(clone(lastRun), state.concurrency)
  const snapshot = {
    createdAt: new Date().toISOString(),
    schemaVersion: 2,
    includes: {
      runtimeConcurrency: true
    },
    state: clone(state),
    run
  }
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `arena-snapshot-${Date.now()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function paint() {
  app.innerHTML = renderApp(state, lastRun)
  wireEvents()
}

function setRuleType(index, type) {
  state.chaosGlobal[index] = newRule(type)
}

function moveClientInstance(instances, sourceId, targetId, placeBefore = true) {
  const list = [...instances]
  const fromIndex = list.findIndex((instance) => instance.id === sourceId)
  if (fromIndex < 0) return list

  const [moved] = list.splice(fromIndex, 1)

  if (!targetId) {
    list.push(moved)
    return list
  }

  const targetIndex = list.findIndex((instance) => instance.id === targetId)
  if (targetIndex < 0) {
    list.push(moved)
    return list
  }

  const insertAt = placeBefore ? targetIndex : targetIndex + 1
  list.splice(insertAt, 0, moved)
  return list
}

function wireClientDragAndDrop() {
  const container = app.querySelector(".client-cards")
  const cards = [...app.querySelectorAll(".client-card[data-client-instance-id]")]
  const handles = [...app.querySelectorAll("[data-drag-handle='true']")]
  let dragSourceId = null

  function clearDropState() {
    cards.forEach((card) => {
      card.classList.remove("is-drop-target", "drop-before", "drop-after", "is-dragging")
    })
  }

  handles.forEach((handle) => {
    handle.addEventListener("dragstart", (event) => {
      const card = event.currentTarget.closest(".client-card[data-client-instance-id]")
      if (!card) {
        event.preventDefault()
        return
      }

      dragSourceId = card.getAttribute("data-client-instance-id")
      card.classList.add("is-dragging")
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", dragSourceId)
      }
    })

    handle.addEventListener("dragend", () => {
      dragSourceId = null
      clearDropState()
    })
  })

  cards.forEach((card) => {
    card.addEventListener("dragover", (event) => {
      if (!dragSourceId) return
      const targetId = card.getAttribute("data-client-instance-id")
      if (!targetId || targetId === dragSourceId) return

      event.preventDefault()
      const rect = card.getBoundingClientRect()
      const placeBefore = event.clientY < rect.top + rect.height / 2

      card.classList.add("is-drop-target")
      card.classList.toggle("drop-before", placeBefore)
      card.classList.toggle("drop-after", !placeBefore)
    })

    card.addEventListener("dragleave", (event) => {
      if (!card.contains(event.relatedTarget)) {
        card.classList.remove("is-drop-target", "drop-before", "drop-after")
      }
    })

    card.addEventListener("drop", (event) => {
      if (!dragSourceId) return
      event.preventDefault()

      const targetId = card.getAttribute("data-client-instance-id")
      if (!targetId || targetId === dragSourceId) {
        clearDropState()
        dragSourceId = null
        return
      }

      const placeBefore = card.classList.contains("drop-before")
      readInputs(app, state)
      state.clientInstances = moveClientInstance(state.clientInstances || [], dragSourceId, targetId, placeBefore)
      dragSourceId = null
      paint()
    })
  })

  container?.addEventListener("dragover", (event) => {
    if (!dragSourceId) return
    event.preventDefault()
  })

  container?.addEventListener("drop", (event) => {
    if (!dragSourceId) return
    if (event.target.closest(".client-card[data-client-instance-id]")) return

    event.preventDefault()
    readInputs(app, state)
    state.clientInstances = moveClientInstance(state.clientInstances || [], dragSourceId)
    dragSourceId = null
    paint()
  })
}

function wireEvents() {
  app.querySelector("#what-is-this-btn")?.addEventListener("click", () => {
    helpOverlay.open()
  })

  app.querySelector("#toggle-chaos-btn")?.addEventListener("click", () => {
    readInputs(app, state)
    state.chaosRulesExpanded = !state.chaosRulesExpanded
    paint()
  })

  app.querySelector("#preset-btn")?.addEventListener("click", () => {
    readInputs(app, state)
    applyPreset(state, state.scenarioPreset)
    paint()
  })

  app.querySelector("#export-btn")?.addEventListener("click", () => {
    exportSnapshot()
  })

  app.querySelector("#run-btn")?.addEventListener("click", async () => {
    const btn = app.querySelector("#run-btn")
    btn.disabled = true
    btn.textContent = "Running..."
    try {
      readInputs(app, state)
      lastRun = await runExperiment(state, {
        onProgress: progressOverlay.handleProgress
      })
      progressOverlay.hideAndReset()
      paint()
    } catch (error) {
      console.error(error)
      alert(`Run failed: ${error instanceof Error ? error.message : String(error)}`)
      progressOverlay.hideAndReset()
      btn.disabled = false
      btn.textContent = "Run Arena"
    }
  })

  app.querySelectorAll(".rule-type").forEach((select) => {
    select.addEventListener("change", (event) => {
      readInputs(app, state)
      const target = event.currentTarget
      const index = Number(target.dataset.ruleIndex ?? target.dataset.index)
      setRuleType(index, target.value)
      paint()
    })
  })

  app.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault()
      readInputs(app, state)
      const action = event.currentTarget.dataset.action
      const index = Number(event.currentTarget.dataset.index)
      const clientId = event.currentTarget.dataset.clientId

      if (action === "add-global-rule") state.chaosGlobal.push(newRule("latencyRange"))
      if (action === "remove-global-rule") state.chaosGlobal.splice(index, 1)
      if (action === "add-client") {
        const type = app.querySelector("#client-type-select")?.value || "fetch"
        state.clientInstances.push(createClientInstance(type))
      }
      if (action === "remove-client" && clientId) {
        state.clientInstances = state.clientInstances.filter((instance) => instance.id !== clientId)
      }

      paint()
    })
  })

  app.querySelectorAll("[data-plugin-toggle='true']").forEach((toggle) => {
    toggle.addEventListener("change", () => {
      readInputs(app, state)
      paint()
    })
  })

  wireClientDragAndDrop()
}

paint()
helpOverlay.ensure()
progressOverlay.ensure()
