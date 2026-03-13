/**
 * @integram/core-data-service - Хуки транзакций
 * Before/after хуки для записи транзакций при create/update/delete.
 */
import { TRANSACTION_ACTIONS } from '../services/TransactionService.js';

export async function beforeCreate(ctx) { ctx.logger.info('beforeCreate хук', { database: ctx.database }); return ctx; }

export async function afterCreate(ctx) {
  try { await ctx.transactionService.record(ctx.database, { agentId: ctx.data.agentId || null, action: TRANSACTION_ACTIONS.CREATE, targetId: ctx.result.id, targetType: ctx.result.typeId, oldValue: null, newValue: ctx.result, sessionId: ctx.data.sessionId || null, txGroupId: ctx.data.txGroupId || null }); } catch (e) { ctx.logger.warn('afterCreate хук: ошибка', { error: e.message }); }
}

export async function beforeUpdate(ctx) {
  const snapshot = await ctx.objectService.getById(ctx.database, ctx.objectId);
  ctx.logger.info('beforeUpdate хук', { database: ctx.database, objectId: ctx.objectId });
  return { ...ctx, snapshot };
}

export async function afterUpdate(ctx) {
  try { await ctx.transactionService.record(ctx.database, { agentId: ctx.data.agentId || null, action: TRANSACTION_ACTIONS.UPDATE, targetId: ctx.objectId, targetType: ctx.snapshot?.typeId || ctx.result?.typeId, oldValue: ctx.snapshot, newValue: ctx.result, sessionId: ctx.data.sessionId || null, txGroupId: ctx.data.txGroupId || null }); } catch (e) { ctx.logger.warn('afterUpdate хук: ошибка', { error: e.message }); }
}

export async function beforeDelete(ctx) {
  const snapshot = await ctx.objectService.getById(ctx.database, ctx.objectId);
  ctx.logger.info('beforeDelete хук', { database: ctx.database, objectId: ctx.objectId });
  return { ...ctx, snapshot };
}

export async function afterDelete(ctx) {
  if (!ctx.snapshot) return;
  try { await ctx.transactionService.record(ctx.database, { agentId: ctx.options?.agentId || null, action: TRANSACTION_ACTIONS.DELETE, targetId: ctx.objectId, targetType: ctx.snapshot.typeId, oldValue: ctx.snapshot, newValue: null, sessionId: ctx.options?.sessionId || null, txGroupId: ctx.options?.txGroupId || null }); } catch (e) { ctx.logger.warn('afterDelete хук: ошибка', { error: e.message }); }
}

export function createTransactionHooks(services, options = {}) {
  const { transactionService, objectService } = services;
  const logger = options.logger || console;
  return {
    beforeCreate: (db, data) => beforeCreate({ database: db, data, logger }),
    afterCreate: (db, data, result) => afterCreate({ database: db, data, result, transactionService, logger }),
    beforeUpdate: (db, objectId, data) => beforeUpdate({ database: db, objectId, data, objectService, logger }),
    afterUpdate: (db, objectId, data, snapshot, result) => afterUpdate({ database: db, objectId, data, snapshot, result, transactionService, logger }),
    beforeDelete: (db, objectId, opts) => beforeDelete({ database: db, objectId, options: opts, objectService, logger }),
    afterDelete: (db, objectId, opts, snapshot) => afterDelete({ database: db, objectId, options: opts, snapshot, transactionService, logger }),
  };
}
export default createTransactionHooks;
