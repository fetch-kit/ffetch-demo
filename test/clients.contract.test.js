import { describe, expect, it } from "vitest"
import { createAxiosAdapter, createFetchAdapter, createFFetchAdapter } from "../src/clients"

describe("adapter contract", () => {
  it("fetch adapter returns response for HTTP failures", async () => {
    const adapter = createFetchAdapter(async () => new Response("fail", { status: 503 }))

    const result = await adapter.request("https://example.test", { method: "GET" }, { traceId: "trace-1" })

    expect(result.response.status).toBe(503)
    expect(result.attempts).toBe(1)
  })

  it("fetch adapter annotates thrown errors with attempt count", async () => {
    const adapter = createFetchAdapter(async () => {
      throw new Error("transport exploded")
    })

    await expect(
      adapter.request("https://example.test", { method: "GET" }, { traceId: "trace-2" })
    ).rejects.toMatchObject({
      message: "transport exploded",
      __arenaAttempts: 1
    })
  })

  it("axios adapter returns response for HTTP failures", async () => {
    const adapter = createAxiosAdapter(
      {
        clients: {
          axios: {
            timeoutMs: 1000
          }
        }
      },
      async () => new Response("fail", { status: 503 })
    )

    const result = await adapter.request(
      "https://example.test",
      {
        method: "GET",
        headers: {
          "x-demo-user": "arena"
        }
      },
      { traceId: "trace-3" }
    )

    expect(result.response.status).toBe(503)
    expect(result.attempts).toBe(1)
  })

  it("ffetch adapter constructs successfully with hedging disabled", async () => {
    const state = {
      clients: {
        ffetch: {
          timeoutMs: 1000,
          retries: 1,
          retryDelayMode: "fixed",
          retryDelayMs: 0,
          throwOnHttpError: false,
          useDedupePlugin: false,
          useCircuitPlugin: false,
          useHedgePlugin: false,
          dedupeTtlMs: 30000,
          dedupeSweepIntervalMs: 5000,
          circuitThreshold: 5,
          circuitResetMs: 10000,
          circuitOrder: 20,
          dedupeOrder: 10,
          hedgeDelayMs: 50,
          hedgeMaxHedges: 1,
          hedgeOrder: 15
        }
      }
    }

    const adapter = createFFetchAdapter(state, async () => new Response("ok", { status: 200 }))

    const result = await adapter.request("https://example.test", { method: "GET" }, { traceId: "trace-4" })

    expect(result.response.status).toBe(200)
    expect(result.attempts).toBeGreaterThanOrEqual(1)
  })

  it("ffetch adapter constructs successfully with hedging enabled", async () => {
    const state = {
      clients: {
        ffetch: {
          timeoutMs: 1000,
          retries: 1,
          retryDelayMode: "fixed",
          retryDelayMs: 0,
          throwOnHttpError: false,
          useDedupePlugin: false,
          useCircuitPlugin: false,
          useHedgePlugin: true,
          dedupeTtlMs: 30000,
          dedupeSweepIntervalMs: 5000,
          circuitThreshold: 5,
          circuitResetMs: 10000,
          circuitOrder: 20,
          dedupeOrder: 10,
          hedgeDelayMs: 50,
          hedgeMaxHedges: 1,
          hedgeOrder: 15
        }
      }
    }

    const adapter = createFFetchAdapter(state, async () => new Response("ok", { status: 200 }))

    const result = await adapter.request("https://example.test", { method: "GET" }, { traceId: "trace-5" })

    expect(result.response.status).toBe(200)
    expect(result.attempts).toBeGreaterThanOrEqual(1)
  })
})
