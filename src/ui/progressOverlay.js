function createDefaultProgress() {
  return {
    active: false,
    totalRequests: 0,
    completedRequests: 0,
    currentClient: "",
    clientCompleted: 0,
    clientTotal: 0,
    statusText: ""
  }
}

export function createProgressOverlay(doc = document) {
  let runProgress = createDefaultProgress()

  function ensure() {
    let overlay = doc.querySelector("#run-overlay")
    if (overlay) return overlay

    overlay = doc.createElement("div")
    overlay.id = "run-overlay"
    overlay.className = "run-overlay hidden"
    overlay.innerHTML = `
    <div class="run-overlay-card">
      <h3>Arena is running</h3>
      <p id="overlay-client">Preparing requests...</p>
      <p id="overlay-status" class="footer-note">Initializing...</p>
      <div class="overlay-progress-track"><i id="overlay-progress-fill" style="width: 0%;"></i></div>
      <p id="overlay-count" class="footer-note">0 / 0</p>
    </div>
  `
    doc.body.appendChild(overlay)
    return overlay
  }

  function setVisible(visible) {
    const overlay = ensure()
    overlay.classList.toggle("hidden", !visible)
  }

  function update() {
    const overlay = ensure()
    const ratio = runProgress.totalRequests
      ? runProgress.completedRequests / runProgress.totalRequests
      : 0
    const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)))

    overlay.querySelector("#overlay-client").textContent = runProgress.currentClient
      ? `Client: ${runProgress.currentClient} (${runProgress.clientCompleted}/${runProgress.clientTotal})`
      : "Preparing requests..."
    overlay.querySelector("#overlay-status").textContent = runProgress.statusText || "Working..."
    overlay.querySelector("#overlay-progress-fill").style.width = `${percent}%`
    overlay.querySelector("#overlay-count").textContent = `${runProgress.completedRequests} / ${runProgress.totalRequests}`
  }

  function handleProgress(event) {
    if (!event || !event.type) return
    if (event.type === "run-start") {
      runProgress = {
        active: true,
        totalRequests: event.totalRequests,
        completedRequests: 0,
        currentClient: "",
        clientCompleted: 0,
        clientTotal: event.requestsPerClient,
        statusText: "Starting run..."
      }
      if (!event.totalRequests) {
        runProgress.statusText = "Nothing to run. Enable at least one client and set request count above 0."
      }
      setVisible(true)
      update()
      return
    }

    if (event.type === "client-start") {
      runProgress.currentClient = event.client
      runProgress.clientCompleted = 0
      runProgress.clientTotal = event.requestsPerClient
      runProgress.statusText = `Running ${event.client} (${event.clientIndex}/${event.totalClients})`
      update()
      return
    }

    if (event.type === "request-complete") {
      runProgress.completedRequests = Number(event.totalCompleted ?? runProgress.completedRequests + 1)
      runProgress.totalRequests = Number(event.totalRequests ?? runProgress.totalRequests)
      runProgress.clientCompleted = event.clientCompleted
      runProgress.clientTotal = event.clientTotal
      const suffix = event.ok ? `HTTP ${event.status}` : event.errorName || "error"
      runProgress.statusText = `Last request #${event.requestId}: ${suffix}`
      update()
      return
    }

    if (event.type === "run-end") {
      runProgress.statusText = "Finalizing results..."
      update()
    }
  }

  function hideAndReset() {
    runProgress.active = false
    setVisible(false)
  }

  return {
    ensure,
    handleProgress,
    hideAndReset,
    setVisible
  }
}
