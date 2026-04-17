import { describe, expect, it } from "vitest"
import { runExperiment } from "../src/runner"
import { createState } from "../src/state"

describe("runExperiment", () => {
  it("produces summary and rows for enabled adapters", async () => {
    const state = createState()
    state.targetUrl = "data:text/plain,ok"
    state.requestCount = 5
    state.concurrency = 2
    state.chaosGlobal = []

    state.clients.fetch.enabled = true
    state.clients.axios.enabled = false
    state.clients.ky.enabled = false
    state.clients.ffetch.enabled = false

    const result = await runExperiment(state)

    expect(result.clients).toHaveLength(1)
    expect(result.clients[0].client).toBe("fetch")
    expect(result.clients[0].rows).toHaveLength(5)
    expect(result.clients[0].summary.total).toBe(5)
    expect(result.clients[0].summary.success).toBe(5)
  })

  it("captures runtime concurrency metrics", async () => {
    const state = createState()
    state.targetUrl = "data:text/plain,ok"
    state.requestCount = 8
    state.concurrency = 4
    state.chaosGlobal = []

    state.clients.fetch.enabled = true
    state.clients.axios.enabled = false
    state.clients.ky.enabled = false
    state.clients.ffetch.enabled = false

    const result = await runExperiment(state)
    const runtime = result.clients[0].runtime

    expect(runtime.requestedConcurrency).toBe(4)
    expect(runtime.logicalPeakInFlight).toBeGreaterThan(0)
    expect(runtime.transportPeakInFlight).toBeGreaterThan(0)
    expect(runtime.transportAttempts).toBeGreaterThan(0)
  })

  it("keeps upstream runtime counters scoped per client", async () => {
    const state = createState()
    state.targetUrl = "data:text/plain,ok"
    state.requestCount = 5
    state.concurrency = 2
    state.chaosGlobal = []

    state.clients.fetch.enabled = true
    state.clients.axios.enabled = true
    state.clients.ky.enabled = false
    state.clients.ffetch.enabled = false

    const result = await runExperiment(state)
    expect(result.clients).toHaveLength(2)

    for (const bucket of result.clients) {
      expect(bucket.runtime.transportAttempts).toBe(5)
    }
  })

  it("surfaces short-circuit and total transport runtime stats", async () => {
    const state = createState()
    state.targetUrl = "data:text/plain,ok"
    state.requestCount = 4
    state.concurrency = 2
    state.chaosGlobal = [{ type: "failRandomly", rate: 1, status: 503, body: "boom" }]

    state.clients.fetch.enabled = true
    state.clients.axios.enabled = false
    state.clients.ky.enabled = false
    state.clients.ffetch.enabled = false

    const result = await runExperiment(state)
    const runtime = result.clients[0].runtime

    expect(runtime.totalTransportCalls).toBe(4)
    expect(runtime.shortCircuitedCalls).toBe(4)
    expect(runtime.upstreamFetchCalls).toBe(0)
  })

  it("computes standardized metrics: p99, latencyN, errorRate", async () => {
    const state = createState()
    state.targetUrl = "data:text/plain,ok"
    state.requestCount = 10
    state.concurrency = 2
    state.chaosGlobal = []

    state.clients.fetch.enabled = true
    state.clients.axios.enabled = false
    state.clients.ky.enabled = false
    state.clients.ffetch.enabled = false

    const result = await runExperiment(state)
    const summary = result.clients[0].summary

    expect(summary).toHaveProperty("p99")
    expect(summary).toHaveProperty("latencyN")
    expect(summary).toHaveProperty("errorRate")
    expect(typeof summary.p99).toBe("number")
    expect(summary.latencyN).toBe(10)
    expect(summary.errorRate).toBe(0)
  })
})
