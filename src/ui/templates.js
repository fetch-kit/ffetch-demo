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
      <article class="metric"><b>${summary.reliabilityScore}</b><span>reliability score (see What is this?)</span></article>
    </div>
    <div class="metrics" style="margin-top: 0.6rem;">
      <article class="metric"><b>${summary.p50} ms</b><span>p50 latency</span></article>
      <article class="metric"><b>${summary.p95} ms</b><span>p95 latency</span></article>
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

function renderClientPanel(name, panelKey, expanded, enabledInput, body) {
  return `<article class="client-card">
    <div class="client-head">
      <div class="client-title-row">
        <label class="client-enabled">${enabledInput}</label>
        <h3>${name}</h3>
      </div>
      <button class="secondary tiny" type="button" data-action="toggle-client-panel" data-client="${panelKey}">${expanded ? "Hide" : "Show"}</button>
    </div>
    <div class="client-body ${expanded ? "" : "is-collapsed"}">${body}</div>
  </article>`
}

function clientCardFetch(state) {
  return renderClientPanel(
    "Native fetch",
    "fetch",
    Boolean(state.clientPanels?.fetch),
    `<input id="fetch-enabled" type="checkbox" ${state.clients.fetch.enabled ? "checked" : ""} />`,
    `
    <p class="footer-note">No built-in timeout/retry controls.</p>
  `
  )
}

function clientCardKy(state) {
  const cfg = state.clients.ky
  return renderClientPanel(
    "ky",
    "ky",
    Boolean(state.clientPanels?.ky),
    `<input id="ky-enabled" type="checkbox" ${cfg.enabled ? "checked" : ""} />`,
    `
    <div class="grid-two">
      <div class="field"><label><input id="ky-throw" type="checkbox" ${cfg.throwHttpErrors ? "checked" : ""} /> throw http errors</label></div>
    </div>
    <div class="grid-two">
      <div class="field"><label>timeout (ms)</label><input id="ky-timeout" type="number" min="0" value="${cfg.timeoutMs}" /></div>
      <div class="field"><label>retry limit</label><input id="ky-retry" type="number" min="0" max="10" value="${cfg.retryLimit}" /></div>
    </div>
    <div class="grid-two">
      <div class="field"><label>backoff base (ms)</label><input id="ky-backoff-base" type="number" min="1" value="${cfg.backoffBaseMs}" /></div>
      <div class="field"><label>backoff max (ms)</label><input id="ky-backoff-max" type="number" min="1" value="${cfg.backoffMaxMs}" /></div>
    </div>
    <div class="field"><label>retry status codes csv</label><input id="ky-status-codes" type="text" value="${numbersToCsv(cfg.retryStatusCodes)}" /></div>
    <div class="field"><label>retry-after status codes csv</label><input id="ky-after-codes" type="text" value="${numbersToCsv(cfg.retryAfterStatusCodes)}" /></div>
  `
  )
}

function clientCardFFetch(state) {
  const cfg = state.clients.ffetch
  return renderClientPanel(
    "ffetch",
    "ffetch",
    Boolean(state.clientPanels?.ffetch),
    `<input id="ffetch-enabled" type="checkbox" ${cfg.enabled ? "checked" : ""} />`,
    `
    <div class="grid-two">
      <div class="field"><label><input id="ffetch-throw" type="checkbox" ${cfg.throwOnHttpError ? "checked" : ""} /> throw http errors</label></div>
    </div>
    <div class="grid-two">
      <div class="field"><label>timeout (ms)</label><input id="ffetch-timeout" type="number" min="0" value="${cfg.timeoutMs}" /></div>
      <div class="field"><label>retries</label><input id="ffetch-retries" type="number" min="0" max="10" value="${cfg.retries}" /></div>
    </div>
    <div class="grid-two">
      <div class="field"><label>retry mode</label><select id="ffetch-delay-mode"><option value="expo-jitter" ${cfg.retryDelayMode === "expo-jitter" ? "selected" : ""}>expo-jitter</option><option value="fixed" ${cfg.retryDelayMode === "fixed" ? "selected" : ""}>fixed</option></select></div>
      <div class="field"><label>retry delay ms</label><input id="ffetch-delay-ms" type="number" min="1" value="${cfg.retryDelayMs}" /></div>
    </div>
    <div class="grid-two">
      <div class="field"><label><input id="ffetch-dedupe" type="checkbox" ${cfg.useDedupePlugin ? "checked" : ""} /> dedupe plugin</label></div>
      <div class="field"><label><input id="ffetch-circuit" type="checkbox" ${cfg.useCircuitPlugin ? "checked" : ""} /> circuit plugin</label></div>
    </div>
    <div class="grid-two">
      <div class="field"><label>dedupe ttl ms</label><input id="ffetch-dedupe-ttl" type="number" min="0" value="${cfg.dedupeTtlMs}" /></div>
      <div class="field"><label>dedupe sweep ms</label><input id="ffetch-dedupe-sweep" type="number" min="100" value="${cfg.dedupeSweepIntervalMs}" /></div>
    </div>
    <div class="grid-two">
      <div class="field"><label>circuit threshold</label><input id="ffetch-circuit-threshold" type="number" min="1" value="${cfg.circuitThreshold}" /></div>
      <div class="field"><label>circuit reset ms</label><input id="ffetch-circuit-reset" type="number" min="1" value="${cfg.circuitResetMs}" /></div>
    </div>
  `
  )
}

function clientCardAxios(state) {
  const cfg = state.clients.axios
  return renderClientPanel(
    "axios",
    "axios",
    Boolean(state.clientPanels?.axios),
    `<input id="axios-enabled" type="checkbox" ${cfg.enabled ? "checked" : ""} />`,
    `
    <div class="grid-two">
      <div class="field"><label>timeout (ms)</label><input id="axios-timeout" type="number" min="0" value="${cfg.timeoutMs}" /></div>
    </div>
    <p class="footer-note">No built-in retry controls.</p>
  `
  )
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
          <section class="panel"><h2>Clients</h2><div class="client-cards">${clientCardFetch(state)}${clientCardAxios(state)}${clientCardKy(state)}${clientCardFFetch(state)}</div></section>
        </div>

        <div class="right-col">${renderResults(lastRun)}</div>
      </section>
    </main>
  `
}
