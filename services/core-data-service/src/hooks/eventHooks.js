/**
 * @integram/core-data-service - Хуки событий (Event Streaming)
 *
 * After-хуки для автоматической публикации событий при create/update/delete.
 * Подключаются к ObjectService и вызывают eventService.emit() после каждой операции.
 */

import { EVENT_ACTIONS } from '../services/EventService.js';

/**
 * Хук после создания объекта — публикует событие create.
 * @param {Object} ctx — контекст операции
 */
export async function afterCreate(ctx) {
  try {
    await ctx.eventService.emit(ctx.database, {
      action: EVENT_ACTIONS.CREATE,
      targetId: ctx.result.id,
      targetType: ctx.result.typeId,
      oldValue: null,
      newValue: ctx.result,
      meta: {
        agentId: ctx.data?.agentId || null,
        sessionId: ctx.data?.sessionId || null,
        source: 'ObjectService.create',
      },
    });
  } catch (e) {
    ctx.logger.warn('eventHooks.afterCreate: ошибка публикации события', { error: e.message });
  }
}

/**
 * Хук после обновления объекта — публикует событие update.
 * @param {Object} ctx — контекст операции
 */
export async function afterUpdate(ctx) {
  try {
    await ctx.eventService.emit(ctx.database, {
      action: EVENT_ACTIONS.UPDATE,
      targetId: ctx.objectId,
      targetType: ctx.snapshot?.typeId || ctx.result?.typeId,
      oldValue: ctx.snapshot || null,
      newValue: ctx.result,
      meta: {
        agentId: ctx.data?.agentId || null,
        sessionId: ctx.data?.sessionId || null,
        source: 'ObjectService.update',
      },
    });
  } catch (e) {
    ctx.logger.warn('eventHooks.afterUpdate: ошибка публикации события', { error: e.message });
  }
}

/**
 * Хук после удаления объекта — публикует событие delete.
 * @param {Object} ctx — контекст операции
 */
export async function afterDelete(ctx) {
  if (!ctx.snapshot) return;
  try {
    await ctx.eventService.emit(ctx.database, {
      action: EVENT_ACTIONS.DELETE,
      targetId: ctx.objectId,
      targetType: ctx.snapshot.typeId,
      oldValue: ctx.snapshot,
      newValue: null,
      meta: {
        agentId: ctx.options?.agentId || null,
        sessionId: ctx.options?.sessionId || null,
        cascade: ctx.options?.cascade || false,
        source: 'ObjectService.delete',
      },
    });
  } catch (e) {
    ctx.logger.warn('eventHooks.afterDelete: ошибка публикации события', { error: e.message });
  }
}

/**
 * Хук после пакетного создания — публикует событие batch.
 * @param {Object} ctx — контекст операции
 */
export async function afterBatch(ctx) {
  try {
    await ctx.eventService.emit(ctx.database, {
      action: EVENT_ACTIONS.BATCH,
      targetId: null,
      targetType: ctx.typeId || null,
      oldValue: null,
      newValue: { ids: ctx.ids, count: ctx.ids.length },
      meta: {
        source: 'ObjectService.createBatch',
      },
    });
  } catch (e) {
    ctx.logger.warn('eventHooks.afterBatch: ошибка публикации события', { error: e.message });
  }
}

// ============================================================================
// Фабрика хуков
// ============================================================================

/**
 * Создать набор event-хуков для интеграции с ObjectService.
 *
 * @param {Object} services — сервисы
 * @param {Object} services.eventService — экземпляр EventService
 * @param {Object} services.objectService — экземпляр ObjectService (для снимков)
 * @param {Object} [options]
 * @param {Object} [options.logger] — логгер
 * @returns {Object} — набор хуков { afterCreate, afterUpdate, afterDelete, afterBatch }
 */
export function createEventHooks(services, options = {}) {
  const { eventService, objectService } = services;
  const logger = options.logger || console;

  return {
    afterCreate: (db, data, result) =>
      afterCreate({ database: db, data, result, eventService, logger }),

    afterUpdate: (db, objectId, data, snapshot, result) =>
      afterUpdate({ database: db, objectId, data, snapshot, result, eventService, logger }),

    afterDelete: (db, objectId, opts, snapshot) =>
      afterDelete({ database: db, objectId, options: opts, snapshot, eventService, logger }),

    afterBatch: (db, typeId, ids) =>
      afterBatch({ database: db, typeId, ids, eventService, logger }),
  };
}

export default createEventHooks;
