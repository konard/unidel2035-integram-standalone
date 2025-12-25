import logger from '../../utils/logger.js';

/**
 * IP Filtering Middleware
 * Issue #77: IP whitelist and blacklist management
 *
 * Features:
 * - IP whitelist (trusted IPs bypass rate limiting)
 * - IP blacklist (blocked IPs)
 * - CIDR range support
 * - In-memory IP list management (Redis removed)
 */

logger.info('IP filtering using in-memory store (Redis removed)');

/**
 * In-memory storage for IP lists
 */
const memoryStore = {
  whitelist: new Set(),
  blacklist: new Set(),
  blacklistReasons: new Map(), // Store reasons for blacklisted IPs
};

/**
 * Load static IP lists from environment variables
 */
function loadStaticIPLists() {
  // Load whitelisted IPs
  if (process.env.IP_WHITELIST) {
    const whitelistIPs = process.env.IP_WHITELIST.split(',').map((ip) => ip.trim());
    whitelistIPs.forEach((ip) => memoryStore.whitelist.add(ip));
    logger.info(`Loaded ${whitelistIPs.length} whitelisted IPs from environment`);
  }

  // Load blacklisted IPs
  if (process.env.IP_BLACKLIST) {
    const blacklistIPs = process.env.IP_BLACKLIST.split(',').map((ip) => ip.trim());
    blacklistIPs.forEach((ip) => memoryStore.blacklist.add(ip));
    logger.info(`Loaded ${blacklistIPs.length} blacklisted IPs from environment`);
  }
}

// Load static lists on startup
loadStaticIPLists();

/**
 * Check if IP matches a CIDR range
 */
function ipMatchesCIDR(ip, cidr) {
  if (!cidr.includes('/')) {
    // Not a CIDR range, exact match
    return ip === cidr;
  }

  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);

  const ipInt = ipToInt(ip);
  const rangeInt = ipToInt(range);

  return (ipInt & mask) === (rangeInt & mask);
}

/**
 * Convert IP address to integer
 */
function ipToInt(ip) {
  return ip.split('.').reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Check if IP is in whitelist
 */
async function isIPWhitelisted(ip) {
  // Check memory store for exact match
  if (memoryStore.whitelist.has(ip)) {
    return true;
  }

  // Check for CIDR ranges in memory
  for (const cidr of memoryStore.whitelist) {
    if (ipMatchesCIDR(ip, cidr)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if IP is in blacklist
 */
async function isIPBlacklisted(ip) {
  // Check memory store for exact match
  if (memoryStore.blacklist.has(ip)) {
    return true;
  }

  // Check for CIDR ranges in memory
  for (const cidr of memoryStore.blacklist) {
    if (ipMatchesCIDR(ip, cidr)) {
      return true;
    }
  }

  return false;
}

/**
 * Add IP to whitelist
 */
export async function addToWhitelist(ip, isCIDR = false) {
  logger.info(`Adding IP to whitelist: ${ip}`);
  memoryStore.whitelist.add(ip);
}

/**
 * Remove IP from whitelist
 */
export async function removeFromWhitelist(ip) {
  logger.info(`Removing IP from whitelist: ${ip}`);
  memoryStore.whitelist.delete(ip);
}

/**
 * Add IP to blacklist
 */
export async function addToBlacklist(ip, reason, isCIDR = false) {
  logger.warn(`Adding IP to blacklist: ${ip} (${reason})`);
  memoryStore.blacklist.add(ip);
  if (reason) {
    memoryStore.blacklistReasons.set(ip, reason);
  }
}

/**
 * Remove IP from blacklist
 */
export async function removeFromBlacklist(ip) {
  logger.info(`Removing IP from blacklist: ${ip}`);
  memoryStore.blacklist.delete(ip);
  memoryStore.blacklistReasons.delete(ip);
}

/**
 * Get all whitelisted IPs
 */
export async function getWhitelistedIPs() {
  return Array.from(memoryStore.whitelist);
}

/**
 * Get all blacklisted IPs
 */
export async function getBlacklistedIPs() {
  return Array.from(memoryStore.blacklist);
}

/**
 * Get blacklist reason for IP
 */
export async function getBlacklistReason(ip) {
  return memoryStore.blacklistReasons.get(ip) || null;
}

/**
 * Middleware: Block blacklisted IPs
 */
export const blockBlacklistedIPs = async (req, res, next) => {
  const ip = req.ip;

  const blacklisted = await isIPBlacklisted(ip);
  if (blacklisted) {
    const reason = await getBlacklistReason(ip);
    logger.warn(`Blocked blacklisted IP: ${ip} (${reason || 'No reason specified'})`);

    return res.status(403).json({
      success: false,
      error: 'Доступ запрещен',
      code: 'IP_BLACKLISTED',
    });
  }

  next();
};

/**
 * Middleware: Mark whitelisted IPs (bypass rate limiting)
 */
export const markWhitelistedIPs = async (req, res, next) => {
  const ip = req.ip;

  const whitelisted = await isIPWhitelisted(ip);
  if (whitelisted) {
    req.isWhitelisted = true;
    logger.debug(`Whitelisted IP: ${ip}`);
  }

  next();
};

/**
 * Middleware: Skip rate limiting for whitelisted IPs
 */
export const skipRateLimitForWhitelisted = (limiter) => {
  return async (req, res, next) => {
    // Check if IP is whitelisted
    const whitelisted = await isIPWhitelisted(req.ip);

    if (whitelisted) {
      // Skip rate limiting
      return next();
    }

    // Apply rate limiting
    return limiter(req, res, next);
  };
};

/**
 * Cleanup function (no-op since we're using in-memory store)
 */
export function closeIPFilterRedis() {
  // No Redis to close - using in-memory store
  logger.info('IP filter cleanup (in-memory store, no connection to close)');
}

export default {
  blockBlacklistedIPs,
  markWhitelistedIPs,
  skipRateLimitForWhitelisted,
  addToWhitelist,
  removeFromWhitelist,
  addToBlacklist,
  removeFromBlacklist,
  getWhitelistedIPs,
  getBlacklistedIPs,
  getBlacklistReason,
  isIPWhitelisted,
  isIPBlacklisted,
  closeIPFilterRedis,
};
