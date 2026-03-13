/**
 * @integram/core-data-service — V2 Schema Introspection Routes
 *
 * Роуты для интроспекции схемы базы данных Integram.
 * Предоставляет полную схему, связи, статистику и экспорт в JSON Schema / OpenAPI.
 */

import { Router } from 'express';

/**
 * Создать роуты для интроспекции схемы.
 *
 * @param {Object} services - Экземпляры сервисов
 * @param {SchemaService} services.schemaService - Сервис интроспекции схемы
 * @param {Object} [options] - Настройки роутов
 * @returns {Router} Express router
 */
export function createSchemaRoutes(services, options = {}) {
  const router = Router({ mergeParams: true });
  const { schemaService } = services;
  const logger = options.logger || console;

  /** Обёртка успешного ответа */
  const wrapResponse = (data, meta = {}) => ({
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), ...meta },
  });

  /** Обёртка ошибки */
  const wrapError = (error, code = 'ERROR') => ({
    success: false,
    error: { code, message: error.message || 'Unknown error' },
    meta: { timestamp: new Date().toISOString() },
  });

  // GET /schema — полная схема базы данных
  router.get('/', async (req, res) => {
    try {
      const { database } = req.params;
      const schema = await schemaService.getFullSchema(database);
      res.json(wrapResponse(schema, {
        totalTypes: schema.stats.totalTypes,
        totalObjects: schema.stats.totalObjects,
      }));
    } catch (error) {
      logger.error('GET schema failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // GET /schema/types/:typeId — схема конкретной таблицы
  router.get('/types/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const schema = await schemaService.getTableSchema(database, parseInt(typeId, 10));
      if (!schema) {
        return res.status(404).json(wrapError({ message: 'Type not found' }, 'NOT_FOUND'));
      }
      res.json(wrapResponse(schema));
    } catch (error) {
      logger.error('GET type schema failed', { error: error.message });
      if (error.name === 'NotFoundError') {
        return res.status(404).json(wrapError(error, 'NOT_FOUND'));
      }
      res.status(500).json(wrapError(error));
    }
  });

  // GET /schema/relationships — граф связей между таблицами
  router.get('/relationships', async (req, res) => {
    try {
      const { database } = req.params;
      const relationships = await schemaService.getRelationships(database);
      res.json(wrapResponse(relationships, { count: relationships.length }));
    } catch (error) {
      logger.error('GET relationships failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // GET /schema/stats — статистика базы данных
  router.get('/stats', async (req, res) => {
    try {
      const { database } = req.params;
      const stats = await schemaService.getStats(database);
      res.json(wrapResponse(stats));
    } catch (error) {
      logger.error('GET stats failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // GET /schema/export/json-schema — экспорт в JSON Schema формат
  router.get('/export/json-schema', async (req, res) => {
    try {
      const { database } = req.params;
      const jsonSchema = await schemaService.exportJsonSchema(database);
      res.json(wrapResponse(jsonSchema));
    } catch (error) {
      logger.error('GET json-schema export failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // GET /schema/export/openapi — генерация OpenAPI спецификации
  router.get('/export/openapi', async (req, res) => {
    try {
      const { database } = req.params;
      const openapi = await schemaService.exportOpenAPI(database);
      res.json(wrapResponse(openapi));
    } catch (error) {
      logger.error('GET openapi export failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  return router;
}

export default createSchemaRoutes;
