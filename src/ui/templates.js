export const RULE_FIELDS = {
  latency: [{ key: "ms", label: "Delay (ms)", type: "number" }],
  latencyRange: [
    { key: "minMs", label: "Min (ms)", type: "number" },
    { key: "maxMs", label: "Max (ms)", type: "number" }
  ],
  fail: [
    { key: "status", label: "Status", type: "number" },
    { key: "body", label: "Body", type: "text" }
  ],
  failRandomly: [
    { key: "rate", label: "Rate 0..1", type: "number", step: "0.01" },
    { key: "status", label: "Status", type: "number" },
    { key: "body", label: "Body", type: "text" }
  ],
  failNth: [
    { key: "n", label: "Every Nth", type: "number" },
    { key: "status", label: "Status", type: "number" },
    { key: "body", label: "Body", type: "text" }
  ],
  rateLimit: [
    { key: "limit", label: "Limit", type: "number" },
    { key: "windowMs", label: "Window ms", type: "number" },
    { key: "retryAfterMs", label: "Retry-After ms (0 = off)", type: "number" }
  ],
  throttle: [
    { key: "rate", label: "Bytes/sec", type: "number" },
    { key: "chunkSize", label: "Chunk bytes", type: "number" }
  ]
}

const RULE_TYPES = Object.keys(RULE_FIELDS)

export function renderHelpOverlayContent() {
  return `
    <div class="help-sections">
      <section>
        <h3>What this app is</h3>
        <p>
          Fetch Reliability Arena is a demo benchmark that runs the same request workload through multiple HTTP clients under identical chaos conditions.
          It is designed to be hosted as a static site on GitHub Pages and live within the fetch-kit organization ecosystem:
          <a href="https://github.com/fetch-kit" target="_blank" rel="noreferrer noopener">https://github.com/fetch-kit</a>.
        </p>
        <p>
          The idea is simple: there are many HTTP clients in the JavaScript ecosystem — native <code>fetch</code>, <code>axios</code>, <code>ky</code>, <code>ffetch</code> — and while they all make HTTP requests, they handle failures, retries, and timeouts very differently.
          Choosing one usually comes down to gut feeling or habit. This arena lets you see the actual differences under controlled stress, so the choice is based on evidence rather than assumption.
        </p>
        <p>
          The chaos layer is powered by <a href="https://github.com/fetch-kit/chaos-fetch" target="_blank" rel="noreferrer noopener">chaos-fetch</a>, a lightweight middleware-style library that wraps fetch and injects latency, failures, and drops without touching your infrastructure.
          If you find the arena useful, consider starring <a href="https://github.com/fetch-kit/ffetch" target="_blank" rel="noreferrer noopener">ffetch</a> and <a href="https://github.com/fetch-kit/chaos-fetch" target="_blank" rel="noreferrer noopener">chaos-fetch</a> on GitHub.
        </p>
      </section>

      <section>
        <h3>Clients in this arena</h3>
        <ul class="help-list">
          <li>
            <b>fetch</b> (browser native):
            <a href="https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API" target="_blank" rel="noreferrer noopener">docs</a>
          </li>
          <li>
            <b>axios</b>:
            <a href="https://www.npmjs.com/package/axios" target="_blank" rel="noreferrer noopener">npm</a>
            <a href="https://github.com/axios/axios" target="_blank" rel="noreferrer noopener">GitHub</a>
          </li>
          <li>
            <b>ky</b>:
            <a href="https://www.npmjs.com/package/ky" target="_blank" rel="noreferrer noopener">npm</a>
            <a href="https://github.com/sindresorhus/ky" target="_blank" rel="noreferrer noopener">GitHub</a>
          </li>
          <li>
            <b>ffetch</b> (<code>@fetchkit/ffetch</code>):
            <a href="https://www.npmjs.com/package/@fetchkit/ffetch" target="_blank" rel="noreferrer noopener">npm</a>
            <a href="https://github.com/fetch-kit/ffetch" target="_blank" rel="noreferrer noopener">GitHub</a>
          </li>
        </ul>
        <p>
          Client cards are fully configurable and reorderable. Use the drag handle on each card header to change execution order.
          Add/remove controls define which clients participate in a run.
        </p>
      </section>

      <section>
        <h3>Sharing and exports</h3>
        <ul class="help-list">
          <li><b>Copy Share URL</b>: Captures the current scenario, chaos rules, and client configurations into a shareable URL hash. Opening that link restores the same setup.</li>
          <li><b>Download Card</b>: Exports a deterministic SVG card from the latest completed run. This export is data-frozen and does not rerun requests.</li>
          <li><b>Legend behavior</b>: The exported card legend is intelligent and only includes outcome types that appear in that run.</li>
        </ul>
      </section>

      <section>
        <h3>Chaos simulation engine</h3>
        <p>
          Chaos behavior is driven by <code>@fetchkit/chaos-fetch</code>:
          <a href="https://www.npmjs.com/package/@fetchkit/chaos-fetch" target="_blank" rel="noreferrer noopener">npm</a>
          <a href="https://github.com/fetch-kit/chaos-fetch" target="_blank" rel="noreferrer noopener">GitHub</a>.
        </p>
      </section>

      <section>
        <h3>Chaos rules and settings</h3>
        <ul class="help-list">
          <li><b>latency</b>: fixed delay for every request. Setting: <code>ms</code>.</li>
          <li><b>latencyRange</b>: random delay between bounds. Settings: <code>minMs</code>, <code>maxMs</code>.</li>
          <li><b>fail</b>: force every request to short-circuit with a fixed response. Settings: <code>status</code>, <code>body</code>.</li>
          <li><b>failRandomly</b>: probabilistic short-circuit. Settings: <code>rate</code> (0..1), <code>status</code>, <code>body</code>.</li>
          <li><b>failNth</b>: fail every Nth request in sequence. Settings: <code>n</code>, <code>status</code>, <code>body</code>.</li>
          <li><b>rateLimit</b>: limit requests per key in a sliding window. Key is always <code>x-demo-user</code>. Settings: <code>limit</code>, <code>windowMs</code>, <code>retryAfterMs</code> (when &gt; 0, the 429 response includes a <code>Retry-After</code> header so clients like ky and ffetch back off for exactly that duration).</li>
          <li><b>throttle</b>: bandwidth shaping for response transfer. Settings: <code>rate</code> (bytes/sec), <code>chunkSize</code>.</li>
        </ul>
      </section>

      <section>
        <h3>ffetch plugins</h3>
        <ul class="help-list">
          <li><b>dedupe</b>: Collapses simultaneous requests for the same URL into a single outbound call, serving the response to all pending callers. Controlled by TTL and sweep interval.</li>
          <li><b>circuit</b>: Stops making requests when consecutive failures exceed a threshold, returning errors immediately until a reset window expires. Protects against cascading failures.</li>
          <li><b>hedge</b>: Races backup requests against the primary after a configurable delay. You can set both delay and max hedges (tries). Returns the first successful response, canceling losers. Reduces tail latency under rare slow-response scenarios.</li>
        </ul>
      </section>

      <section>
        <h3>Metrics explained</h3>
        <ul class="help-list">
          <li><b>p50, p95, p99 latency</b>: 50th, 95th, and 99th percentile response times (ms). Track median, high-percentile, and tail latency separately.</li>
          <li><b>latency samples</b>: Count of latency measurements included in percentile calculations. Higher = more statistically stable.</li>
          <li><b>error rate</b>: Percentage of requests that did not succeed (non-2xx, timeouts, thrown errors). Complements success count with a rate view.</li>
          <li><b>requests/sec</b>: Throughput (total requests divided by elapsed time).</li>
        </ul>
      </section>

      <section>
        <h3>How reliability score is calculated</h3>
        <p>
          The score is in the <code>0..100</code> range and favors successful responses while penalizing timeouts,
          thrown failures, and slow tail latency.
        </p>
        <ul class="help-list">
          <li><b>success rate</b>: <code>(success / total) * 100</code></li>
          <li><b>timeout penalty</b>: <code>(timeoutCount / total) * 25</code></li>
          <li><b>fatal penalty</b>: <code>(thrown / total) * 30</code></li>
          <li><b>tail penalty</b>: <code>min(p95 / 1000, 1) * 10</code></li>
          <li><b>final score</b>: <code>clamp(0, 100, successRate - timeoutPenalty - fatalPenalty - tailPenalty)</code></li>
        </ul>
        <p>
          In practice: higher success with fewer hard failures and lower <code>p95</code> gives a better score.
          HTTP 4xx/5xx responses reduce success rate, while thrown exceptions are penalized more heavily.
        </p>
      </section>

      <section>
        <h3>Outcome Mix colours</h3>
        <ul class="help-list">
          <li><span class="legend-swatch swatch-ok"></span> <b>ok</b> — successful responses (2xx)</li>
          <li><span class="legend-swatch swatch-deduped"></span> <b>deduped ok</b> — successful responses served from an in-flight dedupe request</li>
          <li><span class="legend-swatch swatch-timeout"></span> <b>TimeoutError</b> — request exceeded the client timeout</li>
          <li><span class="legend-swatch swatch-circuit"></span> <b>CircuitOpenError</b> — ffetch circuit breaker was open</li>
          <li><span class="legend-swatch swatch-429"></span> <b>HTTP 429</b> — rate-limited by the chaos engine</li>
          <li><span class="legend-swatch swatch-error"></span> <b>HTTP 500 / 503</b> — server error responses</li>
          <li><span class="legend-swatch swatch-other"></span> <b>other</b> — any remaining outcome not in the above categories</li>
        </ul>
        <p>Segments with 0% share are invisible in the bar.</p>
      </section>

      <section>
        <h3>Concurrency</h3>
        <p>
          The requested concurrency setting is a target, but browsers apply their own networking limits. 
          Actual concurrent connections may be capped by the browser's connection pooling behavior.
        </p>
      </section>
    </div>
  `
}

function numbersToCsv(items) {
  return (items || []).join(",")
}

function stringsToCsv(items) {
  return (items || []).join(",")
}

export function newRule(type = "latencyRange") {
  const fields = RULE_FIELDS[type]
  const rule = { type }
  for (const field of fields) {
    if (field.type === "number") rule[field.key] = 0
    else rule[field.key] = ""
  }
  if (type === "latency") rule.ms = 120
  if (type === "latencyRange") {
    rule.minMs = 30
    rule.maxMs = 250
  }
  if (type === "failRandomly") {
    rule.rate = 0.2
    rule.status = 503
    rule.body = "Chaos random failure"
  }
  if (type === "fail") {
    rule.status = 500
    rule.body = "Failure"
  }
  if (type === "failNth") {
    rule.n = 3
    rule.status = 500
    rule.body = "Failed nth"
  }
  if (type === "rateLimit") {
    rule.limit = 20
    rule.windowMs = 1000
    rule.retryAfterMs = 0
  }
  if (type === "throttle") {
    rule.rate = 1024
    rule.chunkSize = 16384
  }
  return rule
}

function ruleTypeSelect(type, attrs) {
  return `<select class="rule-type" ${attrs}>${RULE_TYPES.map((name) => `<option value="${name}" ${name === type ? "selected" : ""}>${name}</option>`).join("")}</select>`
}

function renderRuleFields(rule, attrs) {
  const fields = RULE_FIELDS[rule.type] || []
  return fields
    .map((field) => {
      const value = rule[field.key] ?? ""
      const step = field.step ? `step="${field.step}"` : ""
      const inputType = field.type === "number" ? "number" : "text"
      return `<div class="field"><label>${field.label}</label><input type="${inputType}" data-key="${field.key}" value="${String(value)}" ${step} ${attrs} /></div>`
    })
    .join("")
}

function renderGlobalRules(state) {
  if (!state.chaosGlobal.length) {
    return `<p class="footer-note">No chaos rules configured.</p>`
  }

  return `<div class="rule-list">${state.chaosGlobal
    .map((rule, index) => {
      return `<article class="rule-card global-rule" data-index="${index}">
        <div class="rule-head">
          ${ruleTypeSelect(rule.type, `data-scope=\"global\" data-index=\"${index}\"`)}
          <button class="secondary tiny" data-action="remove-global-rule" data-index="${index}">Remove</button>
        </div>
        <div class="grid-two">${renderRuleFields(rule, `data-scope=\"global\" data-index=\"${index}\"`)}</div>
      </article>`
    })
    .join("")}</div>`
}

function renderSummaryCards(summary, runtime) {
  return `
    <div class="metrics">
      <article class="metric"><b>${summary.total}</b><span>requests</span></article>
      <article class="metric"><b>${summary.success}</b><span>success</span></article>
      <article class="metric"><b>${summary.reliabilityScore}</b><span>reliability score</span></article>
    </div>
    <div class="metrics" style="margin-top: 0.6rem;">
      <article class="metric"><b>${summary.p50} ms</b><span>p50 latency</span></article>
      <article class="metric"><b>${summary.p95} ms</b><span>p95 latency</span></article>
      <article class="metric"><b>${summary.p99} ms</b><span>p99 latency</span></article>
    </div>
    <div class="metrics" style="margin-top: 0.6rem;">
      <article class="metric"><b>${summary.latencyN}</b><span>latency samples</span></article>
      <article class="metric"><b>${summary.errorRate}%</b><span>error rate</span></article>
      <article class="metric"><b>${summary.throughputRps}</b><span>requests/sec</span></article>
    </div>
  `
}

function renderRows(rows) {
  return rows
    .map((row) => {
      const css = row.ok ? "status-ok" : "status-err"
      const status = row.status || row.errorName || "ERR"
      const dedupe = row.dedupeRole === "origin" ? "origin" : row.dedupeRole === "deduped" ? "deduped" : "none"
      return `<tr>
        <td>${row.requestId}</td>
        <td class="${css}">${status}</td>
        <td>${row.networkId || "-"}</td>
        <td>${dedupe}</td>
        <td>${row.retries ?? 0}</td>
        <td>${Math.round(row.elapsedMs)} ms</td>
        <td>${row.errorMessage || "-"}</td>
      </tr>`
    })
    .join("")
}

function renderScoreChart(results) {
  if (!results.length) return ""
  return `<section class="panel"><h2>Reliability Score Chart</h2>
    <div class="chart-stack">
      ${results
        .map((bucket) => {
          const width = bucket.summary.reliabilityScore
          return `<div class="bar-row"><span>${bucket.client}</span><div class="bar-track"><i style="width: ${width}%;"></i></div><b>${bucket.summary.reliabilityScore}</b></div>`
        })
        .join("")}
    </div>
  </section>`
}

function renderErrorChart(results) {
  if (!results.length) return ""
  const keys = ["ok", "deduped", "TimeoutError", "CircuitOpenError", "HTTP_429", "HTTP_500", "HTTP_503", "other"]
  return `<section class="panel"><h2>Outcome Mix</h2>
    <div class="chart-stack">
      ${results
        .map((bucket) => {
          const map = bucket.summary.errorCounts || {}
          const total = bucket.summary.total || 1
          const deduped = (bucket.rows || []).reduce((count, row) => count + (row?.deduped ? 1 : 0), 0)
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
          const values = { ...known, other }
          const successCount = known.ok + known.deduped
          const chunks = keys
            .map((key) => {
              const pct = Math.round((values[key] / total) * 100)
              return `<i class="chunk chunk-${key.toLowerCase()}" style="width:${pct}%;"></i>`
            })
            .join("")
          return `<div class="mix-row"><span>${bucket.client}</span><div class="mix-track">${chunks}</div><b>${successCount}/${total}</b></div>`
        })
        .join("")}
    </div>
  </section>`
}

function renderResults(lastRun) {
  if (!lastRun || !lastRun.clients.length) {
    return `<p class="footer-note">No run yet. Configure chaos and click Run Arena.</p>`
  }

  const top = [...lastRun.clients].sort((a, b) => b.summary.reliabilityScore - a.summary.reliabilityScore)[0]

  return `
    <section class="panel">
      <div class="actions">
        <button id="download-card-btn" class="secondary">Download Card</button>
      </div>
    </section>
    ${renderScoreChart(lastRun.clients)}
    ${renderErrorChart(lastRun.clients)}
    ${lastRun.clients
      .map((bucket) => {
        const crown = bucket.client === top.client ? '<span class="badge">current winner</span>' : ""
        return `<section class="panel">
          <h2>${bucket.client.toUpperCase()} ${crown}</h2>
          ${renderSummaryCards(bucket.summary, bucket.runtime)}
          <div class="table-wrap scroll-y" style="margin-top: 0.6rem;">
            <table>
              <thead><tr><th>#</th><th>Status</th><th>Net ID</th><th>Dedupe</th><th>Retries</th><th>Latency</th><th>Error</th></tr></thead>
              <tbody>${renderRows(bucket.rows)}</tbody>
            </table>
          </div>
        </section>`
      })
      .join("")}
  `
}

function inputField(instanceId, key, label, value, type = "number", extra = "") {
  return `<div class="field"><label>${label}</label><input data-client-id="${instanceId}" data-field="${key}" type="${type}" value="${value}" ${extra} /></div>`
}

function checkboxField(instanceId, key, label, checked, extra = "") {
  return `<div class="field"><label><input data-client-id="${instanceId}" data-field="${key}" type="checkbox" ${checked ? "checked" : ""} ${extra} /> ${label}</label></div>`
}

function selectField(instanceId, key, label, options, selected, extra = "") {
  return `<div class="field"><label>${label}</label><select data-client-id="${instanceId}" data-field="${key}" ${extra}>${options
    .map((option) => `<option value="${option}" ${option === selected ? "selected" : ""}>${option}</option>`)
    .join("")}</select></div>`
}

function renderClientInstanceCard(instance) {
  const cfg = instance.config || {}
  const id = instance.id
  const type = instance.type

  let body = `
    ${inputField(id, "label", "label", instance.label || type, "text")}
  `

  if (type === "fetch") {
    body += `<p class="footer-note">No built-in timeout/retry controls.</p>`
  }

  if (type === "axios") {
    body += `<div class="grid-two">${inputField(id, "timeoutMs", "timeout (ms)", cfg.timeoutMs ?? 3000, "number", 'min="0"')}</div>`
  }

  if (type === "ky") {
    body += `
      <div class="grid-two">${checkboxField(id, "throwHttpErrors", "throw http errors", Boolean(cfg.throwHttpErrors))}</div>
      <div class="grid-two">
        ${inputField(id, "timeoutMs", "timeout (ms)", cfg.timeoutMs ?? 3000, "number", 'min="0"')}
        ${inputField(id, "retryLimit", "retry limit", cfg.retryLimit ?? 2, "number", 'min="0" max="10"')}
      </div>
      <div class="grid-two">
        ${inputField(id, "backoffBaseMs", "backoff base (ms)", cfg.backoffBaseMs ?? 0, "number", 'min="0"')}
        ${inputField(id, "backoffMaxMs", "backoff max (ms)", cfg.backoffMaxMs ?? 0, "number", 'min="0"')}
      </div>
      ${inputField(id, "retryStatusCodes", "retry status codes csv", numbersToCsv(cfg.retryStatusCodes || []), "text")}
      ${inputField(id, "retryAfterStatusCodes", "retry-after status codes csv", numbersToCsv(cfg.retryAfterStatusCodes || []), "text")}
    `
  }

  if (type === "ffetch") {
    const retryMode = cfg.retryDelayMode || "fixed"
    body += `
      <div class="grid-two">${checkboxField(id, "throwOnHttpError", "throw http errors", Boolean(cfg.throwOnHttpError))}</div>
      <div class="grid-two">
        ${inputField(id, "timeoutMs", "timeout (ms)", cfg.timeoutMs ?? 3000, "number", 'min="0"')}
        ${inputField(id, "retries", "retries", cfg.retries ?? 2, "number", 'min="0" max="10"')}
      </div>
      <div class="grid-two">
        ${selectField(id, "retryDelayMode", "retry mode", ["expo-jitter", "fixed"], retryMode, 'data-retry-mode-toggle="true"')}
        ${inputField(id, "retryDelayMs", retryMode === "expo-jitter" ? "retry base delay ms" : "retry delay ms", cfg.retryDelayMs ?? 200, "number", 'min="0"')}
      </div>
      ${retryMode === "expo-jitter" ? `<div class="grid-two">${inputField(id, "retryJitterMs", "retry jitter ms", cfg.retryJitterMs ?? 100, "number", 'min="0"')}</div>` : ""}
      ${inputField(id, "retryStatusCodes", "retry status codes csv", numbersToCsv(cfg.retryStatusCodes || [429, 500, 502, 503, 504]), "text")}
      ${inputField(id, "retryAfterStatusCodes", "retry-after status codes csv", numbersToCsv(cfg.retryAfterStatusCodes || [413, 429, 503]), "text")}
      <div class="plugin-block">
        ${checkboxField(id, "useDedupePlugin", "dedupe plugin", Boolean(cfg.useDedupePlugin), 'data-plugin-toggle="true"')}
        ${cfg.useDedupePlugin
          ? `<div class="grid-two">
              ${inputField(id, "dedupeTtlMs", "dedupe ttl ms", cfg.dedupeTtlMs ?? 30000, "number", 'min="0"')}
              ${inputField(id, "dedupeSweepIntervalMs", "dedupe sweep ms", cfg.dedupeSweepIntervalMs ?? 5000, "number", 'min="100"')}
            </div>`
          : ""}
      </div>
      <div class="plugin-block">
        ${checkboxField(id, "useCircuitPlugin", "circuit plugin", Boolean(cfg.useCircuitPlugin), 'data-plugin-toggle="true"')}
        ${cfg.useCircuitPlugin
          ? `<div class="grid-two">
              ${inputField(id, "circuitThreshold", "circuit threshold", cfg.circuitThreshold ?? 5, "number", 'min="1"')}
              ${inputField(id, "circuitResetMs", "circuit reset ms", cfg.circuitResetMs ?? 10000, "number", 'min="1"')}
            </div>`
          : ""}
      </div>
      <div class="plugin-block">
        ${checkboxField(id, "useHedgePlugin", "hedge plugin", Boolean(cfg.useHedgePlugin), 'data-plugin-toggle="true"')}
        ${cfg.useHedgePlugin
          ? `<div class="grid-two">
              ${inputField(id, "hedgeDelayMs", "hedge delay ms", cfg.hedgeDelayMs ?? 50, "number", 'min="1"')}
              ${inputField(id, "hedgeMaxHedges", "max hedges (tries)", cfg.hedgeMaxHedges ?? 1, "number", 'min="0" max="10"')}
            </div>`
          : ""}
      </div>
    `
  }

  return `<article class="client-card" data-client-instance-id="${id}">
    <div class="client-head">
      <div class="client-title-row">
        <button
          class="drag-handle"
          type="button"
          data-drag-handle="true"
          draggable="true"
          aria-label="Drag to reorder client"
          title="Drag to reorder"
        >
          ≡
        </button>
        <h3>${type}</h3>
      </div>
      <button class="secondary tiny" type="button" data-action="remove-client" data-client-id="${id}">Remove</button>
    </div>
    <div class="client-body">${body}</div>
  </article>`
}

function renderClientInstances(state) {
  const instances = state.clientInstances || []
  if (!instances.length) {
    return `<p class="footer-note">No clients configured. Add one to start.</p>`
  }
  return instances.map((instance) => renderClientInstanceCard(instance)).join("")
}

export function renderApp(state, lastRun) {
  return `
    <main class="shell">
      <section class="hero">
        <div class="hero-head">
          <h1>Fetch Reliability Arena</h1>
          <button id="what-is-this-btn" class="secondary">What is this?</button>
        </div>
        <p>Same chaos. Same workload. Compare native fetch, axios, ky, and ffetch with real controls.</p>
        <p class="hero-built-with">Built with <a href="https://github.com/fetch-kit/ffetch" target="_blank" rel="noreferrer noopener">ffetch</a> (production-ready fetch wrapper) and <a href="https://github.com/fetch-kit/chaos-fetch" target="_blank" rel="noreferrer noopener">chaos-fetch</a> (chaos injection for fetch) — give them a ⭐ if you find this useful.</p>
      </section>

      <section class="layout">
        <div class="left-col">
          <section class="panel">
            <h2>Actions</h2>
            <div class="actions">
              <button id="run-btn">Run Arena</button>
              <button id="export-btn" class="secondary" ${lastRun ? "" : "disabled"}>Export Snapshot</button>
              <button id="copy-link-btn" class="secondary">Copy Share URL</button>
            </div>
            <p class="footer-note">${lastRun ? `Last run: ${lastRun.startedAt}` : "No run yet"}</p>
          </section>

          <section class="panel">
            <h2>Scenario</h2>
            <div class="field">
              <label>Target URL (GET only)</label>
              <input id="target-url" type="text" value="${state.targetUrl}" />
            </div>
            <div class="grid-two">
              <div class="field"><label>Request count</label><input id="request-count" type="number" min="1" max="500" value="${state.requestCount}" /></div>
              <div class="field"><label>Concurrency</label><input id="concurrency" type="number" min="1" max="100" value="${state.concurrency}" /></div>
            </div>
            <div class="field" style="margin-top: 1.5rem;">
              <label>Preset</label>
              <div class="inline-controls">
                <select id="preset">
                  <option value="zero-config" ${state.scenarioPreset === "zero-config" ? "selected" : ""}>Zero-config baseline (no chaos)</option>
                  <option value="light" ${state.scenarioPreset === "light" ? "selected" : ""}>Light turbulence</option>
                  <option value="api-instability" ${state.scenarioPreset === "api-instability" ? "selected" : ""}>API instability</option>
                  <option value="meltdown-recovery" ${state.scenarioPreset === "meltdown-recovery" ? "selected" : ""}>Meltdown and recovery</option>
                  <option value="rate-limited" ${state.scenarioPreset === "rate-limited" ? "selected" : ""}>Rate limited API</option>
                  <option value="slow-network" ${state.scenarioPreset === "slow-network" ? "selected" : ""}>Slow network</option>
                  <option value="burst-traffic" ${state.scenarioPreset === "burst-traffic" ? "selected" : ""}>Burst traffic</option>
                  <option value="brownout" ${state.scenarioPreset === "brownout" ? "selected" : ""}>Service brownout</option>
                  <option value="strict-rate-limit" ${state.scenarioPreset === "strict-rate-limit" ? "selected" : ""}>Strict rate limit</option>
                  <option value="degraded-backend" ${state.scenarioPreset === "degraded-backend" ? "selected" : ""}>Degraded backend</option>
                </select>
              </div>
              <button id="preset-btn" class="secondary" style="margin-top: 0.45rem; width: max-content;">Apply Preset</button>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2 style="margin-bottom: 0;">Chaos Rules</h2>
              <button id="toggle-chaos-btn" class="secondary tiny" type="button">${state.chaosRulesExpanded ? "Hide" : "Show"}</button>
            </div>
            <div class="chaos-body ${state.chaosRulesExpanded ? "" : "is-collapsed"}">
              <div class="actions" style="margin-bottom: 0.6rem;"><button class="secondary" data-action="add-global-rule">Add Rule</button></div>
              ${renderGlobalRules(state)}
            </div>
          </section>
        </div>

        <div class="mid-col">
          <section class="panel">
            <h2>Clients</h2>
            <div class="client-actions">
              <select id="client-type-select">
                <option value="fetch">fetch</option>
                <option value="axios">axios</option>
                <option value="ky">ky</option>
                <option value="ffetch">ffetch</option>
              </select>
              <button type="button" class="secondary" data-action="add-client">Add Client</button>
            </div>
            <div class="client-cards">${renderClientInstances(state)}</div>
          </section>
        </div>

        <div class="right-col">${renderResults(lastRun)}</div>
      </section>
    </main>
  `
}
