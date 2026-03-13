/**
 * @integram/core-data-service - V2 Роуты поиска (Agent Search API)
 *
 * Поисковые эндпоинты, оптимизированные для AI-агентов:
 * - Полнотекстовый поиск
 * - Фильтрация по реквизитам с AND/OR логикой
 * - Агрегация данных
 * - Обход графа связей
 * - Поиск на естественном языке (NL)
 */

import { Router } from 'express';

/**
 * Создаёт роуты поиска.
 *
 * @param {Object} services — { searchService }
 * @param {Object} [options] — опции (logger и т.д.)
 * @returns {Router}
 */
export function createSearchRoutes(services, options = {}) {
  const router = Router({ mergeParams: true });
  const { searchService } = services;
  const logger = options.logger || console;

  // ==========================================================================
  // Хелперы ответов (единый формат)
  // ==========================================================================

  const ok = (data, meta = {}) => ({
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), ...meta },
  });

  const err = (e, code = 'ERROR') => ({
    success: false,
    error: { code, message: e.message || 'Неизвестная ошибка' },
    meta: { timestamp: new Date().toISOString() },
  });

  // ==========================================================================
  // POST /databases/:database/search — полнотекстовый поиск
  // ==========================================================================

  router.post('/databases/:database/search', async (req, res) => {
    try {
      const { database } = req.params;
      const { text, types, fields, limit, offset } = req.body;

      if (!text) {
        return res.status(400).json(err({ message: 'Параметр text обязателен' }, 'VALIDATION'));
      }

      const result = await searchService.search(database, { text, types, fields, limit, offset });

      res.json(ok(result.results, {
        total: result.total,
        count: result.results.length,
        query: text,
      }));
    } catch (e) {
      logger.error('POST search failed', { error: e.message });
      if (e.name === 'ValidationError') {
        return res.status(400).json(err(e, 'VALIDATION'));
      }
      res.status(500).json(err(e));
    }
  });

  // ==========================================================================
  // POST /databases/:database/search/filter/:typeId — фильтрация
  // ==========================================================================

  router.post('/databases/:database/search/filter/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const { conditions, logic, limit, offset } = req.body;

      if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
        return res.status(400).json(err({ message: 'Массив conditions обязателен' }, 'VALIDATION'));
      }

      const result = await searchService.filter(database, parseInt(typeId, 10), {
        conditions,
        logic,
        limit,
        offset,
      });

      res.json(ok(result.results, {
        total: result.total,
        count: result.results.length,
        typeId: parseInt(typeId, 10),
        logic: (logic || 'AND').toUpperCase(),
      }));
    } catch (e) {
      logger.error('POST search/filter failed', { error: e.message });
      if (e.name === 'ValidationError') {
        return res.status(400).json(err(e, 'VALIDATION'));
      }
      res.status(500).json(err(e));
    }
  });

  // ==========================================================================
  // POST /databases/:database/search/aggregate/:typeId — агрегация
  // ==========================================================================

  router.post('/databases/:database/search/aggregate/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const { groupBy, metrics } = req.body;

      if (!groupBy) {
        return res.status(400).json(err({ message: 'Параметр groupBy обязателен' }, 'VALIDATION'));
      }
      if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
        return res.status(400).json(err({ message: 'Массив metrics обязателен' }, 'VALIDATION'));
      }

      const result = await searchService.aggregate(database, parseInt(typeId, 10), {
        groupBy,
        metrics,
      });

      res.json(ok(result.groups, {
        typeId: parseInt(typeId, 10),
        groupBy,
        groupCount: result.groups.length,
      }));
    } catch (e) {
      logger.error('POST search/aggregate failed', { error: e.message });
      if (e.name === 'ValidationError') {
        return res.status(400).json(err(e, 'VALIDATION'));
      }
      res.status(500).json(err(e));
    }
  });

  // ==========================================================================
  // GET /databases/:database/search/related/:objectId — связанные объекты
  // ==========================================================================

  router.get('/databases/:database/search/related/:objectId', async (req, res) => {
    try {
      const { database, objectId } = req.params;
      const depth = req.query.depth ? parseInt(req.query.depth, 10) : 1;

      const result = await searchService.findRelated(database, parseInt(objectId, 10), depth);

      res.json(ok(result, {
        rootId: parseInt(objectId, 10),
        relatedCount: result.related.length,
        depth: result.depth,
      }));
    } catch (e) {
      logger.error('GET search/related failed', { error: e.message });
      if (e.name === 'ValidationError') {
        return res.status(400).json(err(e, 'VALIDATION'));
      }
      res.status(500).json(err(e));
    }
  });

  // ==========================================================================
  // POST /databases/:database/search/nl — natural language запрос
  // ==========================================================================

  router.post('/databases/:database/search/nl', async (req, res) => {
    try {
      const { database } = req.params;
      const { query: nlQuery } = req.body;

      if (!nlQuery) {
        return res.status(400).json(err({ message: 'Параметр query обязателен' }, 'VALIDATION'));
      }

      const result = await searchService.naturalLanguageQuery(database, nlQuery);

      res.json(ok(result.results, {
        total: result.total,
        count: result.results.length,
        parsed: result.parsed,
        matchedType: result.matchedType || null,
        fallback: result.fallback || false,
      }));
    } catch (e) {
      logger.error('POST search/nl failed', { error: e.message });
      if (e.name === 'ValidationError') {
        return res.status(400).json(err(e, 'VALIDATION'));
      }
      res.status(500).json(err(e));
    }
  });

  return router;
}

export default createSearchRoutes;
