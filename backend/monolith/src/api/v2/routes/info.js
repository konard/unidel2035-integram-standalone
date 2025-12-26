/**
 * API v2 Info Routes
 *
 * Endpoints для discovery и metadata API
 */

const express = require('express');
const router = express.Router();
const { createResource } = require('../middleware/jsonapi');

/**
 * GET /api/v2
 * API Discovery endpoint
 */
router.get('/', (req, res) => {
  const apiInfo = createResource(
    'api-info',
    'integram-api-v2',
    {
      version: '2.0.0',
      name: 'Integram Standalone API',
      description: 'Modern AI-friendly JSON API for Integram',
      status: 'beta',
      features: [
        'json-api-1.1',
        'openapi-3.1',
        'hateoas',
        'streaming',
        'webhooks'
      ],
      authentication: {
        methods: ['jwt', 'api-key'],
        defaultMethod: 'jwt'
      },
      rateLimits: {
        default: {
          requestsPerMinute: 60,
          requestsPerHour: 3600
        },
        authenticated: {
          requestsPerMinute: 300,
          requestsPerHour: 18000
        }
      }
    },
    {
      links: {
        self: '/api/v2',
        documentation: '/docs/api/MODERN_API_FORMAT.md',
        openapi: '/api/v2/openapi.yaml',
        health: '/api/v2/health'
      },
      meta: {
        buildVersion: '2.0.0-20251225.1',
        buildDate: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      }
    }
  );

  res.jsonApi.success(apiInfo, {
    links: {
      self: '/api/v2',
      endpoints: {
        auth: '/api/v2/auth',
        chat: '/api/v2/chat',
        integram: '/api/v2/integram',
        users: '/api/v2/users'
      }
    }
  });
});

/**
 * GET /api/v2/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB'
    }
  };

  res.json(health);
});

/**
 * GET /api/v2/openapi.yaml
 * Serve OpenAPI specification
 */
router.get('/openapi.yaml', (req, res) => {
  const fs = require('fs');
  const path = require('path');

  const openapiPath = path.join(__dirname, '../../../../docs/api/openapi-v2.yaml');

  if (fs.existsSync(openapiPath)) {
    res.setHeader('Content-Type', 'application/x-yaml');
    res.sendFile(openapiPath);
  } else {
    res.jsonApi.error({
      status: 404,
      code: 'NOT_FOUND',
      title: 'OpenAPI specification not found',
      detail: 'The OpenAPI specification file is not available'
    }, 404);
  }
});

/**
 * GET /api/v2/openapi.json
 * Serve OpenAPI specification as JSON
 */
router.get('/openapi.json', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const yaml = require('js-yaml');

  const openapiPath = path.join(__dirname, '../../../../docs/api/openapi-v2.yaml');

  if (fs.existsSync(openapiPath)) {
    try {
      const yamlContent = fs.readFileSync(openapiPath, 'utf8');
      const jsonContent = yaml.load(yamlContent);
      res.json(jsonContent);
    } catch (error) {
      res.jsonApi.error({
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        title: 'Failed to parse OpenAPI specification',
        detail: error.message
      }, 500);
    }
  } else {
    res.jsonApi.error({
      status: 404,
      code: 'NOT_FOUND',
      title: 'OpenAPI specification not found',
      detail: 'The OpenAPI specification file is not available'
    }, 404);
  }
});

module.exports = router;
