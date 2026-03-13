/**
 * @integram/core-data-service - V2 Роуты пакетных операций (Batch API)
 *
 * POST   /databases/:db/batch              — пакетные операции (create/update/delete)
 * POST   /databases/:db/batch/import/:typeId — массовый импорт записей
 * GET    /databases/:db/batch/export/:typeId — массовый экспорт записей
 * DELETE /databases/:db/batch/:typeId       — массовое удаление по фильтру
 *
 * Closes #184
 */

import { Router } from 'express';

/**
 * Создание роутов пакетных операций.
 *
 * @param {Object} services - Сервисы
 * @param {import('../../services/BatchService.js').BatchService} services.batchService
 * @param {Object} [options] - Настройки
 * @returns {Router} Express-роутер
 */
export function createBatchRoutes(services, options = {}) {
  const router = Router();
  const { batchService } = services;
  const logger = options.logger || console;

  // Обёртка успешного ответа
  const ok = (data, meta = {}) => ({
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), ...meta },
  });

  // Обёртка ошибки
  const err = (e, code = 'ERROR') => ({
    success: false,
    error: { code, message: e.message || 'Неизвестная ошибка' },
    meta: { timestamp: new Date().toISOString() },
  });

  // ==========================================================================
  // POST /databases/:database/batch — пакетные операции
  // ==========================================================================

  router.post('/databases/:database/batch', async (req, res) => {
    try {
      const { database } = req.params;
      const { operations, atomic } = req.body;

      if (!Array.isArray(operations) || operations.length === 0) {
        return res.status(400).json(err({ message: 'operations должен быть непустым массивом' }, 'VALIDATION'));
      }

      const result = await batchService.executeBatch(database, operations, { atomic: atomic === true });

      // Если атомарный режим и есть ошибки — статус 422
      if (atomic && result.failed > 0) {
        return res.status(422).json({
          success: false,
          data: result,
          error: { code: 'ATOMIC_FAILURE', message: 'Атомарная операция прервана: ' + result.failed + ' ошибок' },
          meta: { timestamp: new Date().toISOString() },
        });
      }

      res.json(ok(result, { total: operations.length, success: result.success, failed: result.failed }));
    } catch (error) {
      logger.error('POST batch', { error: error.message });
      res.status(400).json(err(error, 'BATCH_ERROR'));
    }
  });

  // ==========================================================================
  // POST /databases/:database/batch/import/:typeId — массовый импорт
  // ==========================================================================

  router.post('/databases/:database/batch/import/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const { records, skipDuplicates, updateExisting, batchSize } = req.body;

      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json(err({ message: 'records должен быть непустым массивом' }, 'VALIDATION'));
      }

      const opts = {};
      if (skipDuplicates !== undefined) opts.skipDuplicates = skipDuplicates;
      if (updateExisting !== undefined) opts.updateExisting = updateExisting;
      if (batchSize !== undefined) opts.batchSize = parseInt(batchSize, 10);

      const result = await batchService.importRecords(database, parseInt(typeId, 10), records, opts);

      res.status(201).json(ok(result, {
        total: records.length,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
      }));
    } catch (error) {
      logger.error('POST batch/import', { error: error.message });
      res.status(400).json(err(error, 'IMPORT_ERROR'));
    }
  });

  // ==========================================================================
  // GET /databases/:database/batch/export/:typeId — массовый экспорт
  // ==========================================================================

  router.get('/databases/:database/batch/export/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const { format, fields, parentId, value, limit } = req.query;

      const opts = {};
      if (format) opts.format = format;
      if (fields) opts.fields = fields.split(',').map(f => f.trim());
      if (limit) opts.limit = parseInt(limit, 10);

      // Фильтр
      const filter = {};
      if (parentId !== undefined) filter.parentId = parseInt(parentId, 10);
      if (value !== undefined) filter.value = value;
      if (Object.keys(filter).length > 0) opts.filter = filter;

      const result = await batchService.exportRecords(database, parseInt(typeId, 10), opts);

      // CSV — отдаём как файл
      if (result.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="export-' + typeId + '.csv"');
        return res.send(result.data);
      }

      res.json(ok(result, { count: result.count }));
    } catch (error) {
      logger.error('GET batch/export', { error: error.message });
      res.status(500).json(err(error));
    }
  });

  // ==========================================================================
  // DELETE /databases/:database/batch/:typeId — массовое удаление
  // ==========================================================================

  router.delete('/databases/:database/batch/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const { parentId, value, ids } = req.body || {};

      const filter = {};
      if (parentId !== undefined) filter.parentId = parseInt(parentId, 10);
      if (value !== undefined) filter.value = value;
      if (Array.isArray(ids)) filter.ids = ids.map(id => parseInt(id, 10));

      const result = await batchService.deleteByFilter(database, parseInt(typeId, 10), filter);

      res.json(ok(result, { deleted: result.deleted }));
    } catch (error) {
      logger.error('DELETE batch', { error: error.message });
      res.status(500).json(err(error));
    }
  });

  return router;
}

export default createBatchRoutes;
