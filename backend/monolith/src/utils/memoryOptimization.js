// memoryOptimization.js - Memory management utilities
// Issue #2157: Fix memory leaks in backend/monolith

/**
 * Limit array size by removing oldest entries
 * @param {Array} array - Array to limit
 * @param {number} maxSize - Maximum size allowed
 */
export function limitArraySize(array, maxSize) {
  if (!Array.isArray(array) || array.length <= maxSize) {
    return;
  }
  
  const excessCount = array.length - maxSize;
  if (excessCount > 0) {
    array.splice(0, excessCount);
  }
}

/**
 * BoundedMap - Map with fixed size and automatic eviction
 */
export class BoundedMap {
  constructor(maxSize, protectedKeys = []) {
    this.maxSize = maxSize;
    this.map = new Map();
    this.protectedKeys = new Set(protectedKeys); // Keys that should never be evicted
  }

  set(key, value) {
    if (this.map.size >= this.maxSize && !this.map.has(key)) {
      // Remove oldest entry (but skip protected keys)
      console.error(`[BoundedMap] Map full (${this.map.size}/${this.maxSize}), need to evict. Protected keys:`, Array.from(this.protectedKeys));
      let firstKey = null;
      for (const k of this.map.keys()) {
        if (!this.protectedKeys.has(k)) {
          firstKey = k;
          console.error(`[BoundedMap] Evicting key: ${k}`);
          break;
        } else {
          console.error(`[BoundedMap] Skipping protected key: ${k}`);
        }
      }
      if (firstKey !== null) {
        this.map.delete(firstKey);
      } else {
        console.error(`[BoundedMap] WARNING: No evictable keys found! All keys are protected.`);
      }
    }
    this.map.set(key, value);
  }

  get(key) {
    return this.map.get(key);
  }

  has(key) {
    return this.map.has(key);
  }

  delete(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  size() {
    return this.map.size;
  }

  keys() {
    return this.map.keys();
  }

  values() {
    return this.map.values();
  }

  entries() {
    return this.map.entries();
  }
}

/**
 * LRUCache - Least Recently Used cache
 */
export class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Remove least recently used (first key)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    // Delete and re-add to update order
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    
    const value = this.cache.get(key);
    // Move to end to mark as recently used
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  has(key) {
    return this.cache.has(key);
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  keys() {
    return this.cache.keys();
  }

  values() {
    return this.cache.values();
  }

  entries() {
    return this.cache.entries();
  }
}

/**
 * TTLCache - Time To Live cache
 */
export class TTLCache {
  constructor(ttlMs) {
    this.ttl = ttlMs;
    this.cache = new Map();
  }

  set(key, value) {
    const expiry = Date.now() + this.ttl;
    this.cache.set(key, { value, expiry });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    // Clean up expired entries first
    this.cleanup();
    return this.cache.size;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * MemoryMonitor - Monitor memory usage and provide alerts
 */
export class MemoryMonitor {
  constructor(config = {}) {
    this.checkInterval = config.checkInterval || 60000; // 1 minute
    this.warnThreshold = config.warnThreshold || 0.75;  // 75%
    this.criticalThreshold = config.criticalThreshold || 0.85; // 85%
    this.intervalId = null;
    this.logger = config.logger || console;
  }

  start() {
    this.intervalId = setInterval(() => {
      this.checkMemoryUsage();
    }, this.checkInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;
    
    if (heapUsedPercent >= this.criticalThreshold) {
      this.logger.warn(`CRITICAL: Memory usage above threshold: heapUsed=${this.formatBytes(memUsage.heapUsed)} (${(heapUsedPercent * 100).toFixed(1)}%)`);
      this.forceGarbageCollection();
    } else if (heapUsedPercent >= this.warnThreshold) {
      this.logger.warn(`WARNING: High memory usage: heapUsed=${this.formatBytes(memUsage.heapUsed)} (${(heapUsedPercent * 100).toFixed(1)}%)`);
    } else {
      this.logger.info(`Memory usage check: heapUsed=${this.formatBytes(memUsage.heapUsed)} (${(heapUsedPercent * 100).toFixed(1)}%)`);
    }
  }

  forceGarbageCollection() {
    if (global.gc) {
      this.logger.info('Forcing garbage collection...');
      global.gc();
    } else {
      this.logger.warn('Garbage collection not available (run with --expose-gc)');
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getMemoryStats() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: this.formatBytes(memUsage.heapUsed),
      heapTotal: this.formatBytes(memUsage.heapTotal),
      heapUsedPercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      rss: this.formatBytes(memUsage.rss),
      external: this.formatBytes(memUsage.external),
      arrayBuffers: this.formatBytes(memUsage.arrayBuffers || 0)
    };
  }
}