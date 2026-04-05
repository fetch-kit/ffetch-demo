import { renderHelpOverlayContent } from "./templates"

export function createHelpOverlay(doc = document) {
  function ensure() {
    let overlay = doc.querySelector("#help-overlay")
    if (overlay) return overlay

    overlay = doc.createElement("div")
    overlay.id = "help-overlay"
    overlay.className = "help-overlay hidden"
    overlay.innerHTML = `
      <div class="help-overlay-card" role="dialog" aria-modal="true" aria-label="What is this?">
        <div class="help-head">
          <h2>What is this?</h2>
          <button id="help-close-btn" class="secondary">Close</button>
        </div>
        ${renderHelpOverlayContent()}
      </div>
    `

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close()
    })

    overlay.querySelector("#help-close-btn")?.addEventListener("click", () => {
      close()
    })

    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overlay.classList.contains("hidden")) {
        close()
      }
    })

    doc.body.appendChild(overlay)
    return overlay
  }

  function open() {
    ensure().classList.remove("hidden")
  }

  function close() {
    ensure().classList.add("hidden")
  }

  return {
    ensure,
    open,
    close
  }
}
