/**
 * Shared utilities for GHL MCP integration.
 * Rate limiting, caching, retries, and structured logging.
 */

/**
 * Token-bucket rate limiter.
 * @param {object} opts
 * @param {number} [opts.maxPerWindow=100] - Max requests per window
 * @param {number} [opts.windowMs=10000] - Window size in ms
 * @param {number} [opts.maxPerDay=200000] - Max requests per day
 * @returns {object} { acquire, stats }
 */
function createRateLimiter(opts = {}) {
  const {
    maxPerWindow = 100,
    windowMs = 10_000,
    maxPerDay = 200_000,
  } = opts;

  let windowStart = Date.now();
  let windowCount = 0;
  let dayStart = Date.now();
  let dayCount = 0;

  function resetWindowIfNeeded() {
    const now = Date.now();
    if (now - windowStart >= windowMs) {
      windowStart = now;
      windowCount = 0;
    }
  }

  function resetDayIfNeeded() {
    const now = Date.now();
    if (now - dayStart >= 86_400_000) {
      dayStart = now;
      dayCount = 0;
    }
  }

  /**
   * Acquire a slot. Resolves when a request can proceed.
   * @returns {Promise<void>}
   */
  async function acquire() {
    resetDayIfNeeded();
    if (dayCount >= maxPerDay) {
      throw new Error(`Daily rate limit reached (${maxPerDay})`);
    }

    resetWindowIfNeeded();
    if (windowCount >= maxPerWindow) {
      const waitMs = windowMs - (Date.now() - windowStart) + 50;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      resetWindowIfNeeded();
    }

    windowCount++;
    dayCount++;
  }

  function stats() {
    resetWindowIfNeeded();
    resetDayIfNeeded();
    return {
      windowRemaining: maxPerWindow - windowCount,
      dayRemaining: maxPerDay - dayCount,
      dayCount,
    };
  }

  return { acquire, stats };
}

/**
 * Simple TTL cache for MCP responses (e.g., tools/list).
 * @param {number} [ttlMs=3600000] - Cache TTL in ms (default 1 hour)
 * @returns {object} { get, set, invalidate, clear }
 */
function createToolCache(ttlMs = 3_600_000) {
  const store = new Map();

  function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > ttlMs) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key, value) {
    store.set(key, { value, ts: Date.now() });
  }

  function invalidate(key) {
    store.delete(key);
  }

  function clear() {
    store.clear();
  }

  return { get, set, invalidate, clear };
}

/**
 * Retry wrapper with exponential backoff + jitter.
 * @param {Function} fn - Async function to retry
 * @param {object} opts
 * @param {number} [opts.maxRetries=3]
 * @param {number} [opts.baseDelayMs=1000]
 * @param {Function} [opts.shouldRetry] - Predicate, receives error, returns boolean
 * @returns {Promise<*>}
 */
async function withRetry(fn, opts = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    shouldRetry = (err) => {
      // Retry on network errors and 429/5xx
      if (err.message?.includes('fetch failed')) return true;
      const status = parseInt(err.message?.match(/HTTP (\d+)/)?.[1]);
      return status === 429 || (status >= 500 && status < 600);
    },
  } = opts;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries || !shouldRetry(err)) throw err;

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs;
      log('warn', `Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`, {
        error: err.message,
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Structured JSON logger to stderr.
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} msg
 * @param {object} [data]
 */
function log(level, msg, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...data,
  };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

/**
 * Resolve a config value that may reference an env var.
 * Format: "ENV:VAR_NAME" → process.env.VAR_NAME
 * @param {string} value
 * @returns {string}
 */
function resolveEnvValue(value) {
  if (typeof value === 'string' && value.startsWith('ENV:')) {
    const envKey = value.slice(4);
    const envVal = process.env[envKey];
    if (!envVal) throw new Error(`Environment variable ${envKey} not set`);
    return envVal;
  }
  return value;
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "3 days ago").
 * @param {string|Date} date
 * @returns {string}
 */
function timeAgo(date) {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export {
  createRateLimiter,
  createToolCache,
  withRetry,
  log,
  resolveEnvValue,
  timeAgo,
};
