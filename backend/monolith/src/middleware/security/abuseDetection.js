import logger from '../../utils/logger.js';
import { BoundedMap, TTLCache } from '../../utils/memoryOptimization.js';

/**
 * Abuse Detection Middleware
 * Issue #77: Detect and prevent abusive behavior patterns
 *
 * Features:
 * - Unusual activity detection
 * - Bot detection
 * - Credential stuffing protection
 * - Suspicious behavior patterns
 * - In-memory tracking (Redis removed)
 */

logger.info('Abuse detection using in-memory store (Redis removed)');

/**
 * In-memory storage for abuse tracking
 * Issue #2157: Use BoundedMap to prevent unbounded memory growth
 */
const memoryStore = {
  // Limit to 10,000 failed login attempts in memory
  failedLogins: new BoundedMap(10000),
  // Limit to 5,000 suspicious IPs in memory
  suspiciousIPs: new BoundedMap(5000),
  // Limit to 1,000 blocked IPs in memory
  blockedIPs: new Set(), // We'll manually limit this
  _maxBlockedIPs: 1000,
  // Store security events
  securityEvents: [],
  _maxSecurityEvents: 1000
};

/**
 * Configuration for abuse detection thresholds
 */
const ABUSE_CONFIG = {
  // Failed login attempts
  maxFailedLogins: parseInt(process.env.MAX_FAILED_LOGINS || '10'),
  failedLoginWindow: parseInt(process.env.FAILED_LOGIN_WINDOW || '3600000'), // 1 hour in ms

  // Account lockout
  accountLockoutDuration: parseInt(process.env.ACCOUNT_LOCKOUT_DURATION || '1800000'), // 30 minutes

  // Suspicious activity
  maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '60'),
  suspiciousThreshold: parseInt(process.env.SUSPICIOUS_THRESHOLD || '100'),

  // IP blocking
  autoBlockThreshold: parseInt(process.env.AUTO_BLOCK_THRESHOLD || '20'),
  ipBlockDuration: parseInt(process.env.IP_BLOCK_DURATION || '86400000'), // 24 hours

  // Bot detection
  minRequestInterval: parseInt(process.env.MIN_REQUEST_INTERVAL || '100'), // milliseconds
  botDetectionWindow: parseInt(process.env.BOT_DETECTION_WINDOW || '60000'), // 1 minute
};

/**
 * Check if IP is in blocked list
 */
async function isIPBlocked(ip) {
  return memoryStore.blockedIPs.has(ip);
}

/**
 * Block an IP address
 */
export async function blockIP(ip, reason, duration = ABUSE_CONFIG.ipBlockDuration) {
  logger.warn(`Blocking IP ${ip}: ${reason}`);

  // Issue #2157: Limit blocked IPs set size to prevent memory leak
  if (memoryStore.blockedIPs.size >= memoryStore._maxBlockedIPs) {
    // Remove oldest entry (first item in Set)
    const firstIP = memoryStore.blockedIPs.values().next().value;
    memoryStore.blockedIPs.delete(firstIP);
    logger.debug({ removedIP: firstIP }, 'Evicted oldest blocked IP to stay within limit');
  }
  memoryStore.blockedIPs.add(ip);
  setTimeout(() => memoryStore.blockedIPs.delete(ip), duration);

  // Log to security monitoring
  await logSecurityEvent('ip_blocked', { ip, reason, duration });
}

/**
 * Record failed login attempt
 */
async function recordFailedLogin(ip, username) {
  const key = `abuse:failed_login:${ip}:${username}`;

  const currentCount = memoryStore.failedLogins.get(key) || 0;
  const newCount = currentCount + 1;
  memoryStore.failedLogins.set(key, newCount);

  setTimeout(() => memoryStore.failedLogins.delete(key), ABUSE_CONFIG.failedLoginWindow);

  if (newCount >= ABUSE_CONFIG.maxFailedLogins) {
    await blockIP(ip, `Too many failed login attempts for ${username}`, ABUSE_CONFIG.accountLockoutDuration);
  }

  return newCount;
}

/**
 * Reset failed login count on successful login
 */
async function resetFailedLogins(ip, username) {
  const key = `abuse:failed_login:${ip}:${username}`;
  memoryStore.failedLogins.delete(key);
}

/**
 * Detect bot-like behavior (rapid requests with consistent timing)
 * Note: Simplified in-memory version without Redis
 */
async function detectBotBehavior(ip, req) {
  // Simplified bot detection without Redis
  // In production, consider implementing more sophisticated tracking
  // For now, we rely on user-agent based detection in botDetection middleware
  return false;
}

/**
 * Track suspicious activity
 */
async function trackSuspiciousActivity(ip, activityType, metadata = {}) {
  const key = `abuse:suspicious:${ip}`;

  const currentScore = memoryStore.suspiciousIPs.get(ip) || 0;
  const newScore = currentScore + 1;
  memoryStore.suspiciousIPs.set(ip, newScore);

  setTimeout(() => memoryStore.suspiciousIPs.delete(ip), 3600000);

  if (newScore >= ABUSE_CONFIG.suspiciousThreshold) {
    await blockIP(ip, `Suspicious activity threshold exceeded: ${activityType}`);
  }

  await logSecurityEvent('suspicious_activity', { ip, activityType, score: newScore, ...metadata });
}

/**
 * Log security events for monitoring and alerting
 */
async function logSecurityEvent(eventType, data) {
  const event = {
    type: eventType,
    timestamp: new Date().toISOString(),
    ...data,
  };

  logger.warn('Security event:', event);

  // Store in memory for monitoring dashboard
  memoryStore.securityEvents.unshift(event);

  // Keep only last 1000 events to prevent memory growth
  if (memoryStore.securityEvents.length > memoryStore._maxSecurityEvents) {
    memoryStore.securityEvents = memoryStore.securityEvents.slice(0, memoryStore._maxSecurityEvents);
  }

  // TODO: Integrate with alerting system (email, Slack, etc.)
  // if (eventType === 'ip_blocked' || eventType === 'bot_detected') {
  //   await sendSecurityAlert(event);
  // }
}

/**
 * Middleware: Check if IP is blocked
 */
export const checkIPBlock = async (req, res, next) => {
  const ip = req.ip;

  const blocked = await isIPBlocked(ip);
  if (blocked) {
    logger.warn(`Blocked IP attempted access: ${ip}`);
    return res.status(403).json({
      success: false,
      error: 'Ваш IP-адрес заблокирован из-за подозрительной активности',
      code: 'IP_BLOCKED',
    });
  }

  next();
};

/**
 * Middleware: Detect and prevent bot behavior
 */
export const botDetection = async (req, res, next) => {
  const ip = req.ip;

  // Check User-Agent for common bot patterns
  const userAgent = req.get('user-agent') || '';
  const botPatterns = /bot|crawler|spider|scraper|curl|wget|python|java/i;

  if (botPatterns.test(userAgent)) {
    // Legitimate bots should identify themselves properly
    const legitimateBots = /googlebot|bingbot|slackbot|facebookexternalhit/i;
    if (!legitimateBots.test(userAgent)) {
      await trackSuspiciousActivity(ip, 'suspicious_user_agent', { userAgent });
    }
  }

  // Check for bot-like request patterns
  const isBot = await detectBotBehavior(ip, req);
  if (isBot) {
    await trackSuspiciousActivity(ip, 'bot_behavior', { userAgent });
  }

  next();
};

/**
 * Middleware: Track failed login attempts
 */
export const trackFailedLogin = async (req, res, next) => {
  // Hook into response to detect failed login
  const originalJson = res.json;

  res.json = function (data) {
    if (data && data.success === false && req.path.includes('/login')) {
      const ip = req.ip;
      const username = req.body.username || req.body.email || 'unknown';

      recordFailedLogin(ip, username).catch((err) => {
        logger.error('Failed to record login attempt:', err);
      });
    }

    return originalJson.call(this, data);
  };

  next();
};

/**
 * Middleware: Reset failed logins on successful authentication
 */
export const resetFailedLoginsOnSuccess = (req, res, next) => {
  if (req.user) {
    const ip = req.ip;
    const username = req.user.username || req.user.email;

    resetFailedLogins(ip, username).catch((err) => {
      logger.error('Failed to reset login attempts:', err);
    });
  }

  next();
};

/**
 * Detect credential stuffing attacks
 * (Multiple failed logins with different usernames from same IP)
 */
export const credentialStuffingDetection = async (req, res, next) => {
  if (req.path.includes('/login') && req.method === 'POST') {
    const ip = req.ip;
    const key = `abuse:credential_stuffing:${ip}`;

    const attempts = (memoryStore.suspiciousIPs.get(key) || 0) + 1;
    memoryStore.suspiciousIPs.set(key, attempts);

    setTimeout(() => memoryStore.suspiciousIPs.delete(key), 300000); // 5 minutes

    if (attempts > 20) {
      await blockIP(ip, 'Credential stuffing attack detected');
      return res.status(403).json({
        success: false,
        error: 'Слишком много неудачных попыток входа',
        code: 'CREDENTIAL_STUFFING_DETECTED',
      });
    }
  }

  next();
};

/**
 * Get recent security events for monitoring
 */
export async function getSecurityEvents(limit = 100) {
  return memoryStore.securityEvents.slice(0, limit);
}

/**
 * Manually unblock an IP address
 */
export async function unblockIP(ip) {
  logger.info(`Manually unblocking IP: ${ip}`);
  memoryStore.blockedIPs.delete(ip);
  await logSecurityEvent('ip_unblocked', { ip, manual: true });
}

/**
 * Get list of currently blocked IPs
 */
export async function getBlockedIPs() {
  return Array.from(memoryStore.blockedIPs);
}

/**
 * Cleanup function (no-op since we're using in-memory store)
 */
export function closeAbuseDetectionRedis() {
  // No Redis to close - using in-memory store
  logger.info('Abuse detection cleanup (in-memory store, no connection to close)');
}

export default {
  checkIPBlock,
  botDetection,
  trackFailedLogin,
  resetFailedLoginsOnSuccess,
  credentialStuffingDetection,
  blockIP,
  unblockIP,
  getBlockedIPs,
  getSecurityEvents,
  trackSuspiciousActivity,
  closeAbuseDetectionRedis,
};
