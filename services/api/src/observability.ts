export class ApiMetrics {
  private readonly rows = new Map<string, { requests: number; failures: number; totalMs: number; maxMs: number }>();
  record(method: string, route: string, status: number, elapsedMs: number) {
    const key = `${method} ${route}`;
    if (!this.rows.has(key) && this.rows.size >= 500) return;
    const row = this.rows.get(key) ?? { requests: 0, failures: 0, totalMs: 0, maxMs: 0 };
    row.requests++; if (status >= 500) row.failures++; row.totalMs += elapsedMs; row.maxMs = Math.max(row.maxMs, elapsedMs); this.rows.set(key, row);
  }
  snapshot() { return [...this.rows].map(([route, row]) => ({ route, requests: row.requests, failures: row.failures,
    averageMs: Math.round(row.totalMs / row.requests), maxMs: Math.round(row.maxMs) })); }
}
