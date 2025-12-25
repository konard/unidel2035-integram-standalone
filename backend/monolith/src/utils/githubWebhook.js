// githubWebhook.js - GitHub webhook utilities
import crypto from 'crypto';
import logger from './logger.js';

/**
 * Verify GitHub webhook signature
 *
 * GitHub signs webhook payloads with HMAC-SHA256 using the webhook secret.
 * The signature is sent in the X-Hub-Signature-256 header.
 *
 * @param {Object} req - Express request object
 * @param {string} secret - Webhook secret from GitHub
 * @returns {boolean} - True if signature is valid
 */
export function verifyGitHubSignature(req, secret) {
  if (!secret) {
    logger.warn('GitHub webhook secret not configured - skipping signature verification');
    return true; // Allow in development without secret
  }

  const signature = req.headers['x-hub-signature-256'];

  if (!signature) {
    logger.warn('Missing X-Hub-Signature-256 header');
    return false;
  }

  // Get raw body (must be string or Buffer)
  const payload = JSON.stringify(req.body);

  // Compute expected signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  // Compare signatures using timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error({ error: error.message }, 'Signature verification failed');
    return false;
  }
}

/**
 * Parse GitHub event type from headers
 *
 * @param {Object} req - Express request object
 * @returns {string|null} - Event type (e.g., 'push', 'pull_request', 'issues')
 */
export function getGitHubEvent(req) {
  return req.headers['x-github-event'] || null;
}

/**
 * Parse GitHub delivery ID
 *
 * @param {Object} req - Express request object
 * @returns {string|null} - Delivery ID
 */
export function getGitHubDeliveryId(req) {
  return req.headers['x-github-delivery'] || null;
}

/**
 * Validate webhook payload structure
 *
 * @param {Object} payload - Webhook payload
 * @param {string} eventType - Event type
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateWebhookPayload(payload, eventType) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid payload: not an object' };
  }

  switch (eventType) {
    case 'push':
      if (!payload.ref) {
        return { valid: false, error: 'Missing required field: ref' };
      }
      if (!payload.head_commit) {
        return { valid: false, error: 'Missing required field: head_commit' };
      }
      break;

    case 'pull_request':
      if (!payload.action) {
        return { valid: false, error: 'Missing required field: action' };
      }
      if (!payload.pull_request) {
        return { valid: false, error: 'Missing required field: pull_request' };
      }
      break;

    case 'issues':
      if (!payload.action) {
        return { valid: false, error: 'Missing required field: action' };
      }
      if (!payload.issue) {
        return { valid: false, error: 'Missing required field: issue' };
      }
      break;

    default:
      // Unknown event type - allow it but log warning
      logger.warn({ eventType }, 'Unknown webhook event type');
      break;
  }

  return { valid: true };
}

/**
 * Extract relevant info from push event
 *
 * @param {Object} payload - Push event payload
 * @returns {Object} - { branch, commit, pusher, timestamp }
 */
export function parsePushEvent(payload) {
  const branch = payload.ref.replace('refs/heads/', '');

  return {
    branch,
    commit: payload.head_commit?.id || null,
    commitMessage: payload.head_commit?.message || null,
    pusher: payload.pusher?.name || payload.sender?.login || 'unknown',
    timestamp: payload.head_commit?.timestamp || new Date().toISOString(),
    repository: payload.repository?.full_name || null,
  };
}

/**
 * Extract relevant info from pull_request event
 *
 * @param {Object} payload - Pull request event payload
 * @returns {Object} - { action, prNumber, branch, title, author }
 */
export function parsePullRequestEvent(payload) {
  return {
    action: payload.action,
    prNumber: payload.pull_request.number,
    branch: payload.pull_request.head?.ref || null,
    baseBranch: payload.pull_request.base?.ref || 'main',
    title: payload.pull_request.title,
    author: payload.pull_request.user?.login || 'unknown',
    htmlUrl: payload.pull_request.html_url,
    timestamp: payload.pull_request.updated_at || new Date().toISOString(),
    repository: payload.repository?.full_name || null,
  };
}

/**
 * Extract relevant info from issues event
 *
 * @param {Object} payload - Issues event payload
 * @returns {Object} - { action, issueNumber, labels, title, author }
 */
export function parseIssuesEvent(payload) {
  return {
    action: payload.action,
    issueNumber: payload.issue.number,
    labels: payload.issue.labels?.map(l => l.name) || [],
    title: payload.issue.title,
    author: payload.issue.user?.login || 'unknown',
    htmlUrl: payload.issue.html_url,
    label: payload.label?.name || null, // The label that triggered the event
    timestamp: payload.issue.updated_at || new Date().toISOString(),
    repository: payload.repository?.full_name || null,
  };
}
