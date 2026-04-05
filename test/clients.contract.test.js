import { describe, expect, it } from "vitest"
import { createAxiosAdapter, createFetchAdapter } from "../src/clients"

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
})
