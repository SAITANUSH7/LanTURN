import { config } from './config.js';

const BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const routes = new Map(); // "GET /api/jobs/:id" -> { count, errors, sumMs, buckets[], maxMs }
const startedAt = Date.now();
let inflight = 0;
const statuses = {};

/** Request metrics + one JSON log line per request (skipped in tests). Labels are route patterns, never raw URLs, so cardinality stays bounded. */
export function requestMetrics(req, res, next) {
  const t0 = process.hrtime.bigint();
  inflight += 1;
  res.on('finish', () => {
    inflight -= 1;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const pattern = req.route ? `${req.baseUrl || ''}${req.route.path}` : (req.path.startsWith('/api') ? '/api/(unmatched)' : 'static');
    const key = `${req.method} ${pattern}`;
    let r = routes.get(key);
    if (!r) { r = { count: 0, errors: 0, sumMs: 0, maxMs: 0, buckets: new Array(BUCKETS.length + 1).fill(0) }; routes.set(key, r); }
    r.count += 1; r.sumMs += ms; if (ms > r.maxMs) r.maxMs = ms;
    if (res.statusCode >= 500) r.errors += 1;
    r.buckets[BUCKETS.findIndex((b) => ms <= b) === -1 ? BUCKETS.length : BUCKETS.findIndex((b) => ms <= b)] += 1;
    const cls = `${Math.floor(res.statusCode / 100)}xx`;
    statuses[cls] = (statuses[cls] || 0) + 1;
    if (!config.isTest && req.path.startsWith('/api') && req.path !== '/api/health/live') {
      console.log(JSON.stringify({ t: new Date().toISOString(), id: req.id, m: req.method, r: pattern, s: res.statusCode, ms: Math.round(ms * 10) / 10, u: req.user?.id }));
    }
  });
  next();
}

function quantile(r, q) {
  const target = r.count * q;
  let acc = 0;
  for (let i = 0; i < r.buckets.length; i++) { acc += r.buckets[i]; if (acc >= target) return i < BUCKETS.length ? BUCKETS[i] : Math.round(r.maxMs); }
  return Math.round(r.maxMs);
}

export function snapshot() {
  const mem = process.memoryUsage();
  return {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    inflight, statuses: { ...statuses },
    memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) },
    routes: [...routes.entries()].map(([route, r]) => ({ route, count: r.count, errors: r.errors, avgMs: Math.round((r.sumMs / r.count) * 10) / 10, p50Ms: quantile(r, 0.5), p95Ms: quantile(r, 0.95), maxMs: Math.round(r.maxMs) })).sort((a, b) => b.count - a.count).slice(0, 60),
  };
}

/** Prometheus text exposition, for Grafana/Railway metrics scrapers. */
export function prometheus(extra = {}) {
  const lines = ['# TYPE lanturn_requests_total counter'];
  for (const [route, r] of routes) {
    const [method, ...p] = route.split(' ');
    const lbl = `method="${method}",route="${p.join(' ')}"`;
    lines.push(`lanturn_requests_total{${lbl}} ${r.count}`);
    lines.push(`lanturn_request_errors_total{${lbl}} ${r.errors}`);
    lines.push(`lanturn_request_duration_ms_sum{${lbl}} ${r.sumMs.toFixed(1)}`);
    let acc = 0;
    BUCKETS.forEach((b, i) => { acc += r.buckets[i]; lines.push(`lanturn_request_duration_ms_bucket{${lbl},le="${b}"} ${acc}`); });
    lines.push(`lanturn_request_duration_ms_bucket{${lbl},le="+Inf"} ${r.count}`);
  }
  lines.push(`lanturn_inflight_requests ${inflight}`, `lanturn_uptime_seconds ${Math.round((Date.now() - startedAt) / 1000)}`);
  for (const [k, v] of Object.entries(extra)) lines.push(`lanturn_${k} ${v}`);
  return `${lines.join('\n')}\n`;
}
