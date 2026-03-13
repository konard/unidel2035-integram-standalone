/**
 * @integram/core-data-service - V2 Роуты пакетных операций (#184)
 */
import { Router } from 'express';

export function createBatchRoutes(services, options = {}) {
  const router = Router();
  const { batchService } = services;
  const logger = options.logger || console;
  const wrap = (data, meta = {}) => ({ success: true, data, meta: { timestamp: new Date().toISOString(), ...meta } });
  const wrapErr = (error, code = 'ERROR') => ({ success: false, error: { code, message: error.message || 'Ошибка' }, meta: { timestamp: new Date().toISOString() } });

  router.post('/databases/:database/batch', async (req, res) => {
    try {
      if (!Array.isArray(req.body?.operations) || !req.body.operations.length) return res.status(400).json(wrapErr({ message: 'operations обязателен' }, 'VALIDATION'));
      res.json(wrap(await batchService.executeBatch(req.params.database, req.body.operations)));
    } catch (e) { logger.error('POST batch failed', { error: e.message }); res.status(400).json(wrapErr(e, 'BATCH_ERROR')); }
  });

  router.post('/databases/:database/batch/import/:typeId', async (req, res) => {
    try {
      if (!Array.isArray(req.body?.records) || !req.body.records.length) return res.status(400).json(wrapErr({ message: 'records обязателен' }, 'VALIDATION'));
      res.status(201).json(wrap(await batchService.importBatch(req.params.database, parseInt(req.params.typeId, 10), req.body.records)));
    } catch (e) { logger.error('POST import failed', { error: e.message }); res.status(400).json(wrapErr(e, 'IMPORT_ERROR')); }
  });

  router.get('/databases/:database/batch/export/:typeId', async (req, res) => {
    try {
      const format = req.query.format || 'json';
      const result = await batchService.exportBatch(req.params.database, parseInt(req.params.typeId, 10), format);
      if (format === 'csv') { res.set('Content-Type', 'text/csv'); res.set('Content-Disposition', `attachment; filename="export_${req.params.typeId}.csv"`); res.send(result); }
      else res.json(wrap(result));
    } catch (e) { logger.error('GET export failed', { error: e.message }); res.status(500).json(wrapErr(e)); }
  });

  return router;
}
export default createBatchRoutes;
