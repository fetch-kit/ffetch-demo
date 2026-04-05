import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createChaosRuntime, createChaosTransport, resetChaosRuntime } from "../src/chaosConfig"

describe("chaos runtime", () => {
  let originalWindow

  beforeEach(() => {
    originalWindow = globalThis.window
  })

  afterEach(() => {
    if (typeof originalWindow === "undefined") {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  })

  it("resets runtime maps", () => {
    const runtime = createChaosRuntime()
    const marker = {}
    runtime.rateLimitDb.set("k", { count: 2, reset: Date.now() + 1000 })
    runtime.failNthCounters.set(marker, 1)

    resetChaosRuntime(runtime)

    expect(runtime.rateLimitDb.size).toBe(0)
    expect(runtime.failNthCounters.get(marker)).toBeUndefined()
  })

  it("passes through when no chaos rules are configured", async () => {
    const baseFetch = vi.fn(async () => new Response("ok", { status: 200 }))

    const transport = await createChaosTransport({ chaosGlobal: [] }, baseFetch, createChaosRuntime())
    const response = await transport("https://example.test")

    expect(baseFetch).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
  })

  it("rate limit state is isolated by runtime reset", async () => {
    globalThis.window = {}

    const runtime = createChaosRuntime()
    const baseFetch = async () => new Response("ok", { status: 200 })
    const state = {
      chaosGlobal: [{ type: "rateLimit", limit: 1, windowMs: 1000 }]
    }

    const transport = await createChaosTransport(state, baseFetch, runtime)

    const first = await transport("https://example.test", { headers: { "x-demo-user": "arena" } })
    const second = await transport("https://example.test", { headers: { "x-demo-user": "arena" } })

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)

    resetChaosRuntime(runtime)

    const afterReset = await transport("https://example.test", { headers: { "x-demo-user": "arena" } })
    expect(afterReset.status).toBe(200)
  })

  it("reports upstream vs short-circuit runtime stats", async () => {
    globalThis.window = {}

    const runtime = createChaosRuntime()
    const baseFetch = vi.fn(async () => new Response("ok", { status: 200 }))
    const state = {
      chaosGlobal: [{ type: "failRandomly", rate: 1, status: 503, body: "boom" }]
    }

    const transport = await createChaosTransport(state, baseFetch, runtime)
    await transport("https://example.test", { headers: { "x-demo-user": "arena" } })

    const stats = transport.getRuntimeStats?.()
    expect(stats).toMatchObject({
      totalTransportCalls: 1,
      shortCircuitedCalls: 1
    })
    expect(baseFetch).toHaveBeenCalledTimes(0)
  })
})
