/**
 * @integram/core-data-service - V2 Роуты транзакций (Palantir-style)
 */
import { Router } from 'express';

export function createTransactionRoutes(services, options = {}) {
  const router = Router();
  const { transactionService } = services;
  const logger = options.logger || console;
  const ok = (data, meta = {}) => ({ success: true, data, meta: { timestamp: new Date().toISOString(), ...meta } });
  const err = (e, code = 'ERROR') => ({ success: false, error: { code, message: e.message || 'Ошибка' }, meta: { timestamp: new Date().toISOString() } });

  router.get('/databases/:database/transactions', async (req, res) => {
    try { const { database } = req.params; const { action, agentId, sessionId, targetType, since, until, limit, offset } = req.query; const f = {}; if (action) f.action=action; if (agentId) f.agentId=agentId; if (sessionId) f.sessionId=sessionId; if (targetType) f.targetType=parseInt(targetType,10); if (since) f.since=since; if (until) f.until=until; if (limit) f.limit=parseInt(limit,10); if (offset) f.offset=parseInt(offset,10); const r = await transactionService.getTransactions(database, f); res.json(ok(r.transactions, { total: r.total, count: r.transactions.length })); } catch (e) { logger.error('GET transactions', { error: e.message }); res.status(500).json(err(e)); }
  });

  router.get('/databases/:database/transactions/:transactionId', async (req, res) => {
    try { const { database, transactionId } = req.params; const tx = await transactionService.getTransactionById(database, parseInt(transactionId,10)); if (!tx) return res.status(404).json(err({ message: 'Не найдена' }, 'NOT_FOUND')); res.json(ok(tx)); } catch (e) { logger.error('GET transaction', { error: e.message }); res.status(500).json(err(e)); }
  });

  router.get('/databases/:database/objects/:objectId/history', async (req, res) => {
    try { const { database, objectId } = req.params; const { limit, offset, action } = req.query; const o = {}; if (limit) o.limit=parseInt(limit,10); if (offset) o.offset=parseInt(offset,10); if (action) o.action=action; const h = await transactionService.getHistory(database, parseInt(objectId,10), o); res.json(ok(h, { count: h.length })); } catch (e) { logger.error('GET history', { error: e.message }); res.status(500).json(err(e)); }
  });

  router.get('/databases/:database/objects/:objectId/versions/:version', async (req, res) => {
    try { const { database, objectId, version } = req.params; const v = await transactionService.getVersion(database, parseInt(objectId,10), parseInt(version,10)); if (!v) return res.status(404).json(err({ message: 'Версия не найдена' }, 'NOT_FOUND')); res.json(ok(v)); } catch (e) { logger.error('GET version', { error: e.message }); res.status(500).json(err(e)); }
  });

  router.get('/databases/:database/objects/:objectId/diff', async (req, res) => {
    try { const { database, objectId } = req.params; const { v1, v2 } = req.query; if (!v1||!v2) return res.status(400).json(err({ message: 'v1 и v2 обязательны' }, 'VALIDATION')); const d = await transactionService.diffVersions(database, parseInt(objectId,10), parseInt(v1,10), parseInt(v2,10)); res.json(ok(d)); } catch (e) { if (e.name==='ValidationError') return res.status(400).json(err(e,'VALIDATION')); logger.error('GET diff', { error: e.message }); res.status(500).json(err(e)); }
  });

  router.post('/databases/:database/transactions/:transactionId/rollback', async (req, res) => {
    try { const { database, transactionId } = req.params; const { agentId, sessionId } = req.body||{}; const r = await transactionService.rollback(database, parseInt(transactionId,10), { agentId, sessionId }); res.json(ok(r)); } catch (e) { if (e.code==='NOT_FOUND'||e.name==='ObjectNotFoundError') return res.status(404).json(err(e,'NOT_FOUND')); logger.error('POST rollback', { error: e.message }); res.status(500).json(err(e)); }
  });

  router.post('/databases/:database/transactions/begin', async (req, res) => {
    try { const { userId } = req.body||{}; if (!userId) return res.status(400).json(err({ message: 'userId обязателен' },'VALIDATION')); const txId = transactionService.beginTransaction(userId); res.status(201).json(ok({ txId, status: 'PENDING' })); } catch (e) { logger.error('POST begin', { error: e.message }); res.status(500).json(err(e)); }
  });

  router.post('/databases/:database/transactions/commit', async (req, res) => {
    try { const { txId } = req.body||{}; if (!txId) return res.status(400).json(err({ message: 'txId обязателен' },'VALIDATION')); const r = await transactionService.commitTransaction(txId); res.json(ok(r)); } catch (e) { if (e.name==='ValidationError') return res.status(400).json(err(e,'VALIDATION')); logger.error('POST commit', { error: e.message }); res.status(500).json(err(e)); }
  });

  router.post('/databases/:database/transactions/rollback-group', async (req, res) => {
    try { const { txId } = req.body||{}; if (!txId) return res.status(400).json(err({ message: 'txId обязателен' },'VALIDATION')); const r = await transactionService.rollbackTransaction(txId); res.json(ok(r)); } catch (e) { if (e.name==='ValidationError') return res.status(400).json(err(e,'VALIDATION')); logger.error('POST rollback-group', { error: e.message }); res.status(500).json(err(e)); }
  });

  return router;
}
export default createTransactionRoutes;
