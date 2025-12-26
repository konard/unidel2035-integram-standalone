/**
 * API v2 Router
 *
 * Главный роутер для API v2 с поддержкой JSON:API 1.1
 */

const express = require('express');
const router = express.Router();

// Middleware
const { jsonApiMiddleware, jsonApiErrorHandler } = require('./middleware/jsonapi');

// Routes
const infoRoutes = require('./routes/info');
const integramRoutes = require('./routes/integram');

// Применить JSON:API middleware ко всем v2 routes
router.use(jsonApiMiddleware);

// Request ID middleware (для трассировки)
router.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Logging middleware
router.use((req, res, next) => {
  const startTime = Date.now();

  // Log после завершения запроса
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[API v2] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });

  next();
});

// Mount routes
router.use('/', infoRoutes);              // /api/v2, /api/v2/health, /api/v2/openapi.yaml
router.use('/integram', integramRoutes);  // /api/v2/integram/*

// TODO: Добавить остальные routes когда будут реализованы
// router.use('/auth', authRoutes);       // /api/v2/auth/*
// router.use('/chat', chatRoutes);       // /api/v2/chat
// router.use('/users', userRoutes);      // /api/v2/users/*
// router.use('/ai-access-tokens', tokenRoutes); // /api/v2/ai-access-tokens/*

// 404 handler для несуществующих v2 endpoints
router.use((req, res) => {
  res.jsonApi.error({
    status: 404,
    code: 'NOT_FOUND',
    title: 'Endpoint not found',
    detail: `The endpoint ${req.method} ${req.originalUrl} does not exist in API v2`,
    meta: {
      availableEndpoints: [
        'GET /api/v2',
        'GET /api/v2/health',
        'GET /api/v2/openapi.yaml',
        'GET /api/v2/openapi.json',
        'GET /api/v2/integram/databases/{database}/types',
        'GET /api/v2/integram/databases/{database}/types/{typeId}/metadata',
        'GET /api/v2/integram/databases/{database}/types/{typeId}/objects',
        'POST /api/v2/integram/databases/{database}/types/{typeId}/objects',
        'GET /api/v2/integram/databases/{database}/objects/{objectId}',
        'PATCH /api/v2/integram/databases/{database}/objects/{objectId}',
        'DELETE /api/v2/integram/databases/{database}/objects/{objectId}'
      ]
    }
  }, 404);
});

// Error handler (должен быть последним)
router.use(jsonApiErrorHandler);

module.exports = router;
