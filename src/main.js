import "./styles.css"
import { createState, applyPreset, createClientInstance } from "./state"
import { runExperiment } from "./runner"
import { readInputs } from "./ui/formState"
import { createHelpOverlay } from "./ui/helpOverlay"
import { createProgressOverlay } from "./ui/progressOverlay"
import { newRule, renderApp } from "./ui/templates"
import { encodeStateToUrl, applyStateFromUrl } from "./shareState"
import { downloadCardSvg } from "./cardSvg"

const state = createState()
applyStateFromUrl(state)
const app = document.querySelector("#app")
const helpOverlay = createHelpOverlay(document)
const progressOverlay = createProgressOverlay(document)

let lastRun = null

function syncUrl() {
  const url = encodeStateToUrl(state)
  history.replaceState(null, "", url)
}

function paint() {
  app.innerHTML = renderApp(state, lastRun)
  wireEvents()
  syncUrl()
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

  app.querySelector("#download-card-btn")?.addEventListener("click", () => {
    downloadCardSvg(lastRun)
  })

  app.querySelector("#copy-link-btn")?.addEventListener("click", () => {
    const url = encodeStateToUrl(state)
    navigator.clipboard.writeText(url).then(() => {
      const btn = app.querySelector("#copy-link-btn")
      if (btn) {
        const original = btn.textContent
        btn.textContent = "Share URL Copied"
        setTimeout(() => { btn.textContent = original }, 1800)
      }
    })
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

  app.querySelectorAll("select[data-field='retryDelayMode']").forEach((toggle) => {
    toggle.addEventListener("change", () => {
      readInputs(app, state)
      paint()
    })
  })

  wireClientDragAndDrop()

  app.addEventListener("input", () => {
    readInputs(app, state)
    syncUrl()
  })
}

paint()
helpOverlay.ensure()
progressOverlay.ensure()
