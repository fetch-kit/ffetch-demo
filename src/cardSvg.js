// Colours matching the app theme
const BG = "#0f1722"
const BG1 = "#16263a"
const BG2 = "#22364d"
const INK0 = "#eef4ff"
const INK1 = "#b8c8df"
const INK2 = "#8ea2c0"
const ACCENT_A = "#00d1b2"
const ACCENT_B = "#ff7a18"
const DANGER = "#ff4f64"
const OK = "#53e087"
const WARN = "#ffb627"
const LINE = "rgba(180,204,235,0.25)"

const CHUNK_COLORS = {
  ok: OK,
  deduped: "#2f9e63",
  TimeoutError: WARN,
  CircuitOpenError: "#3eb9ff",
  "HTTP_429": "#a78bfa",
  "HTTP_500": DANGER,
  "HTTP_503": DANGER,
  other: INK2
}

const OUTCOME_ORDER = ["ok", "deduped", "TimeoutError", "CircuitOpenError", "HTTP_429", "HTTP_500", "HTTP_503", "other"]

const OUTCOME_LABELS = {
  ok: "OK",
  deduped: "Deduped",
  TimeoutError: "Timeout",
  CircuitOpenError: "Circuit Open",
  HTTP_429: "HTTP 429",
  HTTP_500: "HTTP 500",
  HTTP_503: "HTTP 503",
  other: "Other"
}

function chunkColor(key) {
  return CHUNK_COLORS[key] || CHUNK_COLORS.other
}

function fmt(n, unit = "ms") {
  return `${Math.round(n)}${unit}`
}

function reliabilityColor(score) {
  if (score >= 80) return OK
  if (score >= 50) return WARN
  return DANGER
}

function normalizeOutcomeCounts(bucket) {
  const map = bucket?.summary?.errorCounts || {}
  const total = Math.max(1, Number(bucket?.summary?.total) || 1)
  const deduped = (bucket?.rows || []).reduce((count, row) => count + (row?.deduped ? 1 : 0), 0)
  const known = {
    ok: Math.max(0, (map.ok || 0) - deduped),
    deduped,
    TimeoutError: map.TimeoutError || 0,
    CircuitOpenError: map.CircuitOpenError || 0,
    HTTP_429: map.HTTP_429 || 0,
    HTTP_500: map.HTTP_500 || 0,
    HTTP_503: map.HTTP_503 || 0
  }
  const used = known.ok + known.deduped + known.TimeoutError + known.CircuitOpenError + known.HTTP_429 + known.HTTP_500 + known.HTTP_503
  const other = Math.max(0, total - used)
  return {
    total,
    counts: { ...known, other }
  }
}

function collectLegendKeys(run) {
  const used = new Set()
  for (const bucket of run.clients || []) {
    const { counts } = normalizeOutcomeCounts(bucket)
    for (const key of OUTCOME_ORDER) {
      if ((counts[key] || 0) > 0) used.add(key)
    }
  }
  return OUTCOME_ORDER.filter((key) => used.has(key))
}

function renderLegend(x, y, width, legendKeys) {
  if (!legendKeys.length) return ""

  const cols = Math.min(4, legendKeys.length)
  const rowH = 18
  const labelOffset = 15
  const swatchSize = 9
  const contentTop = 18
  const itemW = width / cols

  const items = legendKeys
    .map((key, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const ix = col * itemW
      const iy = contentTop + row * rowH
      const color = chunkColor(key)
      const label = OUTCOME_LABELS[key] || key
      return `
        <rect x="${ix}" y="${iy}" width="${swatchSize}" height="${swatchSize}" rx="2" fill="${color}" />
        <text x="${ix + labelOffset}" y="${iy + 8}" font-size="10" fill="${INK1}">${label}</text>
      `
    })
    .join("")

  return `
    <g transform="translate(${x}, ${y})">
      <text x="0" y="10" font-size="10" fill="${INK2}">Legend</text>
      ${items}
    </g>
  `
}

// Draw one client block. Returns { svg: string, height: number }
function renderClient(bucket, x, y, colW) {
  const { client, summary } = bucket
  const { p50, p95, p99, errorRate, reliabilityScore, throughputRps, success } = summary

  const pad = 16
  const innerW = colW - pad * 2
  const relColor = reliabilityColor(reliabilityScore)

  // Outcome mix bar
  const mixBarW = innerW
  const mixBarH = 10
  const { total, counts } = normalizeOutcomeCounts(bucket)
  let mixX = 0
  const mixChunks = OUTCOME_ORDER
    .filter((key) => (counts[key] || 0) > 0)
    .map((key) => {
      const count = counts[key]
    const w = (count / total) * mixBarW
    const chunk = `<rect x="${mixX.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${mixBarH}" fill="${chunkColor(key)}" />`
    mixX += w
    return chunk
  })
    .join("")

  // Metric row helper
  function metricCell(label, value, color = INK0, cx = 0, cw = 0) {
    return `
      <rect x="${cx}" y="0" width="${cw}" height="46" rx="6" fill="${BG}" opacity="0.55" />
      <text x="${cx + cw / 2}" y="16" text-anchor="middle" font-size="10" fill="${INK2}">${label}</text>
      <text x="${cx + cw / 2}" y="36" text-anchor="middle" font-size="15" font-weight="700" fill="${color}">${value}</text>
    `
  }

  const thirds = innerW / 3
  const halves = innerW / 2

  const metricsRow1 = `
    <g transform="translate(0, 0)">
      ${metricCell("p50", fmt(p50), INK0, 0, thirds - 4)}
      ${metricCell("p95", fmt(p95), INK1, thirds, thirds - 4)}
      ${metricCell("p99", fmt(p99), INK2, thirds * 2, thirds - 4)}
    </g>
  `

  const metricsRow2 = `
    <g transform="translate(0, 54)">
      ${metricCell("error rate", `${errorRate.toFixed(1)}%`, errorRate > 10 ? DANGER : INK0, 0, halves - 4)}
      ${metricCell("throughput", `${throughputRps} rps`, INK0, halves, halves - 4)}
    </g>
  `

  const blockH = 190
  const svgBlock = `
    <g transform="translate(${x},${y})">
      <rect width="${colW}" height="${blockH}" rx="10" fill="${BG1}" opacity="0.9" />

      <!-- header -->
      <text x="${pad}" y="22" font-size="13" font-weight="700" fill="${INK0}">${client}</text>
      <text x="${colW - pad}" y="22" font-size="13" font-weight="700" fill="${relColor}" text-anchor="end">${reliabilityScore.toFixed(0)}<tspan font-size="10" font-weight="400" fill="${INK2}"> score</tspan></text>

      <!-- mix bar -->
      <g transform="translate(${pad}, 32)">
        <rect width="${mixBarW}" height="${mixBarH}" rx="5" fill="${BG2}" />
        <clipPath id="mix-clip-${client.replace(/\W/g, '')}">
          <rect width="${mixBarW}" height="${mixBarH}" rx="5" />
        </clipPath>
        <g clip-path="url(#mix-clip-${client.replace(/\W/g, '')})">
          ${mixChunks}
        </g>
      </g>

      <!-- success label -->
      <text x="${pad}" y="56" font-size="9" fill="${INK2}">${success}/${total} OK</text>

      <!-- metric cells -->
      <g transform="translate(${pad}, 64)">
        ${metricsRow1}
        ${metricsRow2}
      </g>
    </g>
  `

  return { svg: svgBlock, height: blockH }
}

export function generateRunCardSvg(run) {
  if (!run || !Array.isArray(run.clients) || !run.clients.length) return null

  const COLS = Math.min(run.clients.length, 3)
  const GAP = 12
  const TOTAL_W = 860
  const COL_W = (TOTAL_W - 32 - GAP * (COLS - 1)) / COLS
  const PAD = 16
  const HEADER_H = 52
  const CLIENT_H = 190
  const legendKeys = collectLegendKeys(run)
  const legendRows = Math.max(1, Math.ceil(legendKeys.length / 4))
  const LEGEND_H = 28 + legendRows * 18
  const ROWS = Math.ceil(run.clients.length / COLS)
  const gridBottom = HEADER_H + (CLIENT_H + GAP) * ROWS
  const legendY = gridBottom + 4
  const TOTAL_H = gridBottom + LEGEND_H + PAD

  let clientSvgs = ""
  run.clients.forEach((bucket, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const x = PAD + col * (COL_W + GAP)
    const y = HEADER_H + row * (CLIENT_H + GAP)
    const { svg } = renderClient(bucket, x, y, COL_W)
    clientSvgs += svg
  })

  const timestamp = run.endedAt ? new Date(run.endedAt).toLocaleString() : ""
  const legend = renderLegend(PAD, legendY, TOTAL_W - PAD * 2, legendKeys)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TOTAL_W}" height="${TOTAL_H}" viewBox="0 0 ${TOTAL_W} ${TOTAL_H}">
  <defs>
    <style>
      text { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }
    </style>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a121e" />
      <stop offset="100%" stop-color="${BG2}" />
    </linearGradient>
  </defs>

  <!-- background -->
  <rect width="${TOTAL_W}" height="${TOTAL_H}" rx="18" fill="url(#bg-grad)" />
  <rect width="${TOTAL_W}" height="${TOTAL_H}" rx="18" fill="none" stroke="${LINE}" stroke-width="1" />

  <!-- header -->
  <text x="${PAD}" y="28" font-size="16" font-weight="700" fill="${INK0}">Fetch Reliability Arena</text>
  <text x="${PAD}" y="44" font-size="10" fill="${INK2}">${timestamp}</text>
  <text x="${TOTAL_W - PAD}" y="28" font-size="10" fill="${ACCENT_A}" text-anchor="end">ffetch-demo</text>

  ${clientSvgs}
  ${legend}
</svg>`

  return svg
}

export function downloadCardSvg(run) {
  const svg = generateRunCardSvg(run)
  if (!svg) return

  const blob = new Blob([svg], { type: "image/svg+xml" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `arena-card-${Date.now()}.svg`
  a.click()
  URL.revokeObjectURL(url)
}
