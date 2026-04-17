const LEGACY_SHARE_PARAM = "s"

const PARAMS = {
  targetUrl: "url",
  requestCount: "count",
  concurrency: "conc",
  scenarioPreset: "preset",
  chaosGlobal: "chaos64",
  clientInstances: "clients64"
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function toBase64Url(value) {
  const json = JSON.stringify(value)
  const bytes = new TextEncoder().encode(json)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  const encoded = btoa(binary)
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function fromBase64Url(value, fallback) {
  if (!value) return fallback

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    const decoded = new TextDecoder().decode(bytes)
    return safeJsonParse(decoded, fallback)
  } catch {
    return fallback
  }
}

function decodeLegacyUriB64(value, fallback) {
  if (!value) return fallback
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    const decoded = decodeURIComponent(atob(padded))
    return safeJsonParse(decoded, fallback)
  } catch {
    return fallback
  }
}

function decodeJsonParam(value, fallback) {
  if (!value) return fallback

  // Current format: URL-safe base64 payload.
  const b64Decoded = fromBase64Url(value, null)
  if (b64Decoded !== null) return b64Decoded

  // Previous format: base64(url-encoded-json) payload.
  const legacyB64Decoded = decodeLegacyUriB64(value, null)
  if (legacyB64Decoded !== null) return legacyB64Decoded

  // New format writes URI-encoded JSON to avoid raw []{} in query strings.
  const decoded = safeJsonParse(decodeURIComponent(value), null)
  if (decoded !== null) return decoded

  // Backward compatibility: previously we wrote raw JSON directly.
  return safeJsonParse(value, fallback)
}

function toNumberOr(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function decodeLegacyPayload(encoded) {
  const json = decodeURIComponent(atob(encoded))
  return safeJsonParse(json, null)
}

export function encodeStateToUrl(state) {
  try {
    const url = new URL(window.location.href)
    url.search = ""
    const params = new URLSearchParams()

    params.set(PARAMS.targetUrl, String(state.targetUrl || ""))
    params.set(PARAMS.requestCount, String(state.requestCount || 0))
    params.set(PARAMS.concurrency, String(state.concurrency || 0))
    params.set(PARAMS.scenarioPreset, String(state.scenarioPreset || ""))
    params.set(PARAMS.chaosGlobal, toBase64Url(state.chaosGlobal || []))
    params.set(PARAMS.clientInstances, toBase64Url(state.clientInstances || []))

    // Use hash so payload never reaches the dev server request parser.
    url.hash = params.toString()

    return url.toString()
  } catch {
    return window.location.href
  }
}

export function applyStateFromUrl(state) {
  try {
    const hashValue = (window.location.hash || "").replace(/^#/, "")
    const hashParams = new URLSearchParams(hashValue)
    const searchParams = new URLSearchParams(window.location.search)
    const params = hashParams.size ? hashParams : searchParams
    const hasStructuredParams =
      params.has(PARAMS.targetUrl) ||
      params.has(PARAMS.clientInstances) ||
      params.has("clients") ||
      params.has("chaos")

    if (hasStructuredParams) {
      if (params.has(PARAMS.targetUrl)) state.targetUrl = params.get(PARAMS.targetUrl) || state.targetUrl
      if (params.has(PARAMS.requestCount)) state.requestCount = toNumberOr(params.get(PARAMS.requestCount), state.requestCount)
      if (params.has(PARAMS.concurrency)) state.concurrency = toNumberOr(params.get(PARAMS.concurrency), state.concurrency)
      if (params.has(PARAMS.scenarioPreset)) state.scenarioPreset = params.get(PARAMS.scenarioPreset) || state.scenarioPreset

      // Prefer current keys, but still accept older "chaos"/"clients" params.
      const chaosValue = params.get(PARAMS.chaosGlobal) || params.get("chaos")
      const clientsValue = params.get(PARAMS.clientInstances) || params.get("clients")
      if (chaosValue) state.chaosGlobal = decodeJsonParam(chaosValue, state.chaosGlobal)
      if (clientsValue) state.clientInstances = decodeJsonParam(clientsValue, state.clientInstances)
      return true
    }

    const encoded = params.get(LEGACY_SHARE_PARAM)
    if (!encoded) return false

    const parsed = decodeLegacyPayload(encoded)
    if (!parsed || typeof parsed !== "object") return false

    if ("targetUrl" in parsed) state.targetUrl = parsed.targetUrl
    if ("requestCount" in parsed) state.requestCount = toNumberOr(parsed.requestCount, state.requestCount)
    if ("concurrency" in parsed) state.concurrency = toNumberOr(parsed.concurrency, state.concurrency)
    if ("scenarioPreset" in parsed) state.scenarioPreset = parsed.scenarioPreset
    if ("chaosGlobal" in parsed) state.chaosGlobal = parsed.chaosGlobal
    if ("clientInstances" in parsed) state.clientInstances = parsed.clientInstances
    return true
  } catch {
    return false
  }
}
