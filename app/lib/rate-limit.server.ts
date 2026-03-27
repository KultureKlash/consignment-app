/**
 * Simple in-memory sliding-window rate limiter.
 * For single-process deployments (dev + small prod). Swap to Redis for multi-process.
 */

type RateLimitEntry = { count: number; resetAt: number };

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key);
    }
  }
}, 5 * 60 * 1000);

type RateLimitConfig = {
  /** Name for this limiter (e.g. "login", "api") */
  name: string;
  /** Max requests per window */
  max: number;
  /** Window size in seconds */
  windowSec: number;
};

/**
 * Check rate limit for a given key (usually IP address).
 * Returns null if allowed, or a Response if rate limited.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Response | null {
  const store = getStore(config.name);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + config.windowSec * 1000 });
    return null;
  }

  entry.count++;
  if (entry.count > config.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  return null;
}

/** Extract client IP from request (works behind proxies). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  // Fallback — won't have a real IP in dev
  return "127.0.0.1";
}

// ── Pre-configured limiters ──

/** Login: 10 attempts per 15 minutes */
export function loginRateLimit(request: Request): Response | null {
  return checkRateLimit(getClientIp(request), {
    name: "login",
    max: 10,
    windowSec: 15 * 60,
  });
}

/** Portal API: 60 requests per minute */
export function portalApiRateLimit(request: Request): Response | null {
  return checkRateLimit(getClientIp(request), {
    name: "portal-api",
    max: 60,
    windowSec: 60,
  });
}

/** Portal form submissions: 20 per minute */
export function portalFormRateLimit(request: Request): Response | null {
  return checkRateLimit(getClientIp(request), {
    name: "portal-form",
    max: 20,
    windowSec: 60,
  });
}
