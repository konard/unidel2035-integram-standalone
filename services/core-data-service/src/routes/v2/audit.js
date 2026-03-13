/**
 * @integram/core-data-service - V2 Роуты аудита (#186)
 */
import { Router } from 'express';

export function createAuditRoutes(services, options = {}) {
  const router = Router();
  const { auditService } = services;
  const logger = options.logger || console;
  const wrap = (data, meta = {}) => ({ success: true, data, meta: { timestamp: new Date().toISOString(), ...meta } });
  const wrapErr = (error, code = 'ERROR') => ({ success: false, error: { code, message: error.message || 'Ошибка' }, meta: { timestamp: new Date().toISOString() } });

  router.get('/databases/:database/audit', async (req, res) => {
    try {
      const { database } = req.params;
      const { action, userId, since, until, limit, offset } = req.query;
      const filters = {};
      if (action) filters.action = action; if (userId) filters.userId = userId;
      if (since) filters.since = since; if (until) filters.until = until;
      if (limit) filters.limit = parseInt(limit, 10); if (offset) filters.offset = parseInt(offset, 10);
      const result = await auditService.getAuditLog(database, filters);
      res.json(wrap(result.entries || result, { total: result.total || (result.entries || result).length }));
    } catch (e) { logger.error('GET audit failed', { error: e.message }); res.status(500).json(wrapErr(e)); }
  });

  router.get('/databases/:database/audit/object/:objectId', async (req, res) => {
    try { const result = await auditService.getObjectAudit(req.params.database, parseInt(req.params.objectId, 10)); res.json(wrap(result)); }
    catch (e) { logger.error('GET object audit failed', { error: e.message }); res.status(500).json(wrapErr(e)); }
  });

  router.get('/databases/:database/audit/user/:userId', async (req, res) => {
    try { const result = await auditService.getAccessLog(req.params.database, req.params.userId); res.json(wrap(result)); }
    catch (e) { logger.error('GET user audit failed', { error: e.message }); res.status(500).json(wrapErr(e)); }
  });

  router.get('/databases/:database/audit/report', async (req, res) => {
    try {
      const dateRange = {}; if (req.query.since) dateRange.since = req.query.since; if (req.query.until) dateRange.until = req.query.until;
      const report = await auditService.generateComplianceReport(req.params.database, dateRange);
      res.json(wrap(report));
    } catch (e) { logger.error('GET compliance report failed', { error: e.message }); res.status(500).json(wrapErr(e)); }
  });

  return router;
}
export default createAuditRoutes;
