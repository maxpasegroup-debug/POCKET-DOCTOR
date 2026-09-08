export function validateApiBase(value: string, production = false) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('The API address is not configured correctly.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !/^\/api\/v1\/?$/.test(url.pathname) || (url.protocol !== 'https:' && !(!production && loopback && url.protocol === 'http:')))
    throw new Error('The API address must use HTTPS, except for local development.');
  return url.href.replace(/\/$/, '');
}

export class ApiClient {
  private token = "";
  private generation = 0;
  constructor(
    private base: string,
    private expired: () => void,
    private transport: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}
  setToken(token: string) {
    this.generation++;
    this.token = token;
  }
  clear() {
    this.generation++;
    this.token = "";
  }
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const generation = this.generation;
    let response: Response;
    try {
      response = await this.transport(this.base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new Error(
        "We could not connect. Check your connection and try again.",
      );
    }
    if (generation !== this.generation)
      throw new Error("Your session has changed. Please sign in again.");
    if (response.status === 401) {
      this.clear();
      this.expired();
      throw new Error("Your session has ended. Please sign in again.");
    }
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "A verified, assigned doctor account is required."
          : response.status === 409
            ? "This action is not available now. Refresh and try again."
            : response.status === 429
              ? "Please wait a moment before trying again."
              : "We could not complete that request. Please try again.",
      );
    let payload: { data: T };
    try {
      payload = (await response.json()) as { data: T };
    } catch {
      throw new Error("We could not read the response. Please try again.");
    }
    if (generation !== this.generation)
      throw new Error("Your session has changed. Please sign in again.");
    return payload.data;
  }
}
