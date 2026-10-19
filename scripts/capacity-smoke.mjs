import { performance } from 'node:perf_hooks'

export const DEFAULT_ROUTES = ['/api/health', '/api/site', '/api/teams', '/api/projects', '/api/resources']

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return fallback
  return parsed
}

function isLoopback(hostname) {
  const normalized = String(hostname || '').toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]'
}

export function capacityConfig(options = {}) {
  const baseUrl = String(options.baseUrl || process.env.CAPACITY_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
  const base = new URL(baseUrl)
  const allowRemote = options.allowRemote ?? process.env.CAPACITY_ALLOW_REMOTE === '1'
  if (!allowRemote && !isLoopback(base.hostname)) throw new Error('容量冒烟默认只允许回环地址；设置 CAPACITY_ALLOW_REMOTE=1 才能访问远端')
  const routes = Array.isArray(options.routes) && options.routes.length ? options.routes : DEFAULT_ROUTES
  if (routes.some(route => typeof route !== 'string' || !route.startsWith('/'))) throw new Error('容量冒烟路由必须是绝对路径')
  return {
    baseUrl: base.toString().replace(/\/$/, ''),
    requests: boundedInteger(options.requests ?? process.env.CAPACITY_REQUESTS, 60, 1, 5000),
    concurrency: boundedInteger(options.concurrency ?? process.env.CAPACITY_CONCURRENCY, 8, 1, 256),
    timeoutMs: boundedInteger(options.timeoutMs ?? process.env.CAPACITY_TIMEOUT_MS, 5000, 100, 120000),
    routes,
  }
}

export function percentile(values, ratio) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
}

export async function runCapacitySmoke(options = {}) {
  const config = capacityConfig(options)
  const results = []
  let next = 0
  async function worker() {
    while (true) {
      const index = next++
      if (index >= config.requests) return
      const route = config.routes[index % config.routes.length]
      const started = performance.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), config.timeoutMs)
      try {
        const response = await fetch(`${config.baseUrl}${route}`, { signal: controller.signal })
        await response.text()
        results[index] = { route, status: response.status, durationMs: performance.now() - started }
      } catch (error) {
        results[index] = { route, status: 0, durationMs: performance.now() - started, error: error.message }
      } finally {
        clearTimeout(timer)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(config.concurrency, config.requests) }, () => worker()))
  const durations = results.map(item => item.durationMs)
  const statusCounts = {}
  for (const item of results) statusCounts[item.status] = (statusCounts[item.status] || 0) + 1
  const failures = results.filter(item => item.status !== 200)
  return {
    pass: failures.length === 0,
    baseUrl: config.baseUrl,
    requests: config.requests,
    concurrency: Math.min(config.concurrency, config.requests),
    routes: config.routes,
    statusCounts,
    latencyMs: {
      p50: Number(percentile(durations, 0.5).toFixed(2)),
      p95: Number(percentile(durations, 0.95).toFixed(2)),
      max: Number(Math.max(...durations).toFixed(2)),
    },
    failures: failures.slice(0, 10),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await runCapacitySmoke()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (!result.pass) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
