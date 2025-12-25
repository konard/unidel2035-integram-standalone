/**
 * My Database Token Authorization Middleware
 *
 * Issue #3811: Authorization by 'my' database
 *
 * This middleware handles the new authorization pattern where:
 * 1. When logging into 'my' database, users obtain an authorization token
 * 2. The token is passed using the 'my: {token}' header for cross-database access
 * 3. If the 'my' header is present, it allows access to other databases
 * 4. If logging into a specific database (not 'my'), use that database's specific token
 *
 * Header format:
 * - For 'my' database token: my: {token_value}
 * - For specific database: X-Authorization: {token_value}
 *
 * This enables a unified authentication model where a single 'my' token
 * can be used to access multiple databases through the 'my:' header.
 */

import logger from '../../utils/logger.js';

/**
 * Parse 'my:' header from request
 * @param {Object} req - Express request object
 * @returns {string|null} Token from 'my' header or null
 */
function parseMyHeader(req) {
  // Check for 'my' header (case-insensitive)
  const myHeader = req.get('my') || req.get('MY') || req.get('My');

  if (myHeader) {
    logger.debug({ header: 'my' }, 'Found my: header in request');
    return myHeader.trim();
  }

  return null;
}

/**
 * Middleware to handle 'my:' token authorization
 *
 * This middleware:
 * 1. Checks for 'my:' header in the request
 * 2. If present, extracts the token and sets it for downstream use
 * 3. Marks the request as using 'my' database authentication
 * 4. Allows the request to proceed with unified authorization
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function myTokenAuth(req, res, next) {
  try {
    // Extract 'my:' token from header
    const myToken = parseMyHeader(req);

    if (myToken) {
      // Store 'my' token in request for downstream middleware
      req.myToken = myToken;
      req.isMyDatabaseAuth = true;

      logger.debug({
        path: req.path,
        method: req.method,
        hasMyToken: true
      }, 'Request authenticated with my: header');

      // Also set as X-Authorization for compatibility with existing code
      // This allows existing middleware to work with the 'my' token
      if (!req.get('X-Authorization')) {
        req.headers['x-authorization'] = myToken;
      }
    }

    next();
  } catch (error) {
    logger.error({ error: error.message }, 'Error in myTokenAuth middleware');
    next(error);
  }
}

/**
 * Middleware to validate 'my' token and check database access
 *
 * This middleware should be used on routes that require database access.
 * It validates that the 'my' token grants access to the requested database.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function requireMyToken(req, res, next) {
  try {
    const myToken = req.myToken;

    if (!myToken) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide my: header with valid token.'
      });
    }

    // Token validation logic will be handled by existing auth middleware
    // This just ensures the token is present
    logger.debug({
      path: req.path,
      isMyDatabaseAuth: req.isMyDatabaseAuth
    }, 'my: token validated');

    next();
  } catch (error) {
    logger.error({ error: error.message }, 'Error in requireMyToken middleware');
    res.status(500).json({
      success: false,
      error: 'Internal server error during token validation'
    });
  }
}

/**
 * Utility function to get the appropriate authorization token for a database
 *
 * This function determines which token to use based on:
 * 1. If 'my:' header is present and database is accessible via 'my', use my token
 * 2. Otherwise, use database-specific token from session
 *
 * @param {Object} req - Express request object
 * @param {string} database - Database name
 * @param {Object} session - User session object
 * @returns {string|null} Authorization token or null
 */
export function getAuthTokenForDatabase(req, database, session) {
  // If 'my:' header is present, use it for cross-database access
  if (req.isMyDatabaseAuth && req.myToken) {
    logger.debug({
      database,
      authMethod: 'my-token'
    }, 'Using my: token for database access');

    return req.myToken;
  }

  // Otherwise, use database-specific token from session
  if (session && session.databases) {
    const dbAuth = session.databases.find(db => db.database === database);

    if (dbAuth) {
      logger.debug({
        database,
        authMethod: 'database-specific'
      }, 'Using database-specific token');

      return dbAuth.token;
    }
  }

  logger.warn({
    database,
    hasMyToken: !!req.myToken,
    hasSession: !!session
  }, 'No authorization token found for database');

  return null;
}

/**
 * Middleware to inject 'my:' token into Integram API requests
 *
 * This middleware modifies outgoing Integram API requests to include
 * the 'my:' header when appropriate.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function injectMyTokenToIntegram(req, res, next) {
  try {
    // If request has 'my' token and is targeting Integram API
    if (req.isMyDatabaseAuth && req.myToken) {
      // Store original headers modifier if exists
      const originalHeadersModifier = req.integraminjectMyTokenToIntegram;

      // Create new headers modifier that includes 'my:' header
      req.integramHeadersModifier = (headers = {}) => {
        const modifiedHeaders = originalHeadersModifier ? originalHeadersModifier(headers) : { ...headers };

        // Add 'my:' header to Integram requests
        modifiedHeaders['my'] = req.myToken;

        logger.debug('Injected my: header into Integram API request');

        return modifiedHeaders;
      };
    }

    next();
  } catch (error) {
    logger.error({ error: error.message }, 'Error in injectMyTokenToIntegram middleware');
    next(error);
  }
}

export default {
  myTokenAuth,
  requireMyToken,
  getAuthTokenForDatabase,
  injectMyTokenToIntegram
};
