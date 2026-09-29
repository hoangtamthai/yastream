import { setKvs } from "../db/queries.js";
import { EKVInsert } from "../db/schema/kv.js";
import { ENV } from "./env.js";
import { handleError } from "./error.js";
import { Logger } from "./logger.js";

type CacheValue = {
  value: any;
  size: number;
  expiresAt: number;
};

export const TTL_SECS = {
  content: 24 * 60 * 60,
  provider: 4 * 60 * 60,
  stream: 0.5 * 60 * 60,
};
export const TTL_MS = {
  content: TTL_SECS.content * 1000,
  provider: TTL_SECS.provider * 1000,
  stream: TTL_SECS.stream * 1000,
};


const logger = new Logger("CACHE");
class GlobalCache {
  private cache = new Map<string, CacheValue>();
  private MAX_BYTES = ENV.CACHE_SIZE_MB * 1024 * 1024;
  private currentByteSize = 0;

  /**
   * @param key Unique identifier (e.g., episode ID)
   * @param value The decrypted subtitle string
   * @param ttlMs Time to live in miliseconds (default 2 hour)
   */
  set(key: string, value: any, ttlMs: number = 2 * 60 * 60 * 1000): void {
    // 1. Calculate size of the new value (approx 2 bytes per char for UTF-16)
    const newSize = JSON.stringify(value).length * 2;

    // 2. Clear old entry if it exists
    this.delete(key);

    // 3. EVICTION LOGIC: If adding this exceeds the limit, delete the oldest
    while (
      this.currentByteSize + newSize > this.MAX_BYTES &&
      this.cache.size > 0
    ) {
      const oldestKey = this.cache.keys().next().value || ""; // Maps iterate in insertion order
      logger.log(`Memory Limit. Evicting oldest | ${oldestKey}`);
      this.delete(oldestKey);
    }
    const expiresAt = Date.now() + ttlMs;

    // 4. Set the new item
    logger.trace(`Set ${ttlMs}ms | ${key}`);
    this.cache.set(key, { value, size: newSize, expiresAt });
    this.currentByteSize += newSize;
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      logger.log(`Expired | ${key}`);
      this.delete(key);
      return null;
    }
    return entry.value;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentByteSize -= entry.size;
      this.cache.delete(key);
    }
  }

  getCacheStats() {
    const entries = this.cache.entries();
    Array.from(entries).map(([key, entry]) => ({
      key,
      value: entry.value,
    }));
    return {
      itemCount: this.cache.size,
      memoryUsed: (this.currentByteSize / (1024 * 1024)).toFixed(2),
      maxLimit: (this.MAX_BYTES / (1024 * 1024)).toFixed(2),
      usagePercent: ((this.currentByteSize / this.MAX_BYTES) * 100).toFixed(1),
    };
  }

  clearAll() {
    this.cache.clear();
    this.currentByteSize = 0;
  }

  persistDb() {
    logger.log(`Persisting cache...`);
    try {
      const entries = this.cache.entries();
      const kvCache: EKVInsert[] = entries
        .map(([key, entry]) => ({
          key: key as string,
          createdAt: Date.now(),
          value: JSON.stringify(entry.value),
          size: entry.size as number,
          expiresAt: entry.expiresAt as number,
        }))
        .toArray();
      // Fire-and-forget; we don't block shutdown on DB writes
      setKvs(kvCache).catch((e) => {
        handleError(e, logger, `Failed to persist cache to DB`);
      });
    } catch (e) {
      handleError(e, logger, `Failed to persist cache to DB`);
    }
  }
}

export const cache = new GlobalCache();
