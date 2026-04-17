# ffetch-demo

Frontend-only arena demo to benchmark and compare reliability of HTTP clients under identical chaos conditions:

- native `fetch`
- `axios`
- `ky`
- `ffetch`

The app wraps requests with chaos rules (latency, random failures, rate limiting) and runs a repeatable workload against a test endpoint, measuring reliability scores, latency, and error patterns side-by-side.

## Run

1. Install dependencies
   ```
   npm install
   ```
2. Start dev server
   ```
   npm run dev
   ```
3. Open `index.html` in your browser (served at http://localhost:5173 by default)

## Features

- **Responsive UI** with preset scenarios and real-time progress
- **Chaos controls**: latency range, random failures, rate limiting, throttling
- **Client configuration**: independent timeout, retry, and plugin settings per client
  - **ffetch plugins**: dedupe (collapse in-flight requests), circuit (fail-fast protection), hedge (race backup requests for tail-latency reduction)
- **Run comparison**: side-by-side reliability score, error distribution, and latency metrics
- **Exportable results**: download full run snapshots as JSON (schema v2)

## What's Measured

- **Reliability Score**: weighted metric accounting for success rate, timeouts, and tail latency
- **Error Distribution**: breakdown by status code and error type
- **Latency Percentiles**: p50, p95, and p99 response times
- **Latency Samples**: count of latency measurements used for percentile calculation
- **Error Rate**: percentage of requests that failed (non-2xx, timeouts, thrown errors)
- **Throughput**: requests per second
- **Attempt Tracking**: total transport attempts (including retries and hedge attempts)

## Notes

- Requested concurrency is a target, but browsers apply their own connection pooling limits (~6 per origin)
- Chaos is applied at the transport layer, before client libraries handle retries
- Each run is fully isolated—transport stats are per-client and don't carry over
