/**
 * @integram/core-data-service - V2 Роуты событий (Event Streaming)
 *
 * SSE-поток событий, JSON-лог, webhook-подписки.
 * Клиент может подписаться через SSE (GET /events) или зарегистрировать webhook (POST /events/subscribe).
 */

import { Router } from 'express';

/**
 * Создать роуты событий.
 *
 * @param {Object} services
 * @param {import('../../services/EventService.js').EventService} services.eventService
 * @param {Object} [options]
 * @param {Object} [options.logger]
 * @returns {Router}
 */
export function createEventRoutes(services, options = {}) {
  const router = Router({ mergeParams: true });
  const { eventService } = services;
  const logger = options.logger || console;

  /** Обёртка успешного ответа */
  const ok = (data, meta = {}) => ({
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), ...meta },
  });

  /** Обёртка ошибки */
  const err = (e, code = 'ERROR') => ({
    success: false,
    error: { code, message: e.message || 'Неизвестная ошибка' },
    meta: { timestamp: new Date().toISOString() },
  });

  // ==========================================================================
  // GET /databases/:database/events — SSE-поток событий
  // ==========================================================================

  router.get('/databases/:database/events', (req, res) => {
    const { database } = req.params;
    const { types, actions } = req.query;

    // Парсим фильтры из query-параметров
    const filter = {};
    if (types) {
      filter.types = types.split(',').map(Number).filter(n => !isNaN(n));
    }
    if (actions) {
      filter.actions = actions.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Настраиваем SSE-заголовки
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // для nginx
    });

    // Отправляем начальное событие подключения
    res.write(`event: connected\ndata: ${JSON.stringify({
      message: 'Подключено к потоку событий',
      database,
      filter,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    // Подписываемся на события
    const subscriptionId = eventService.subscribe(database, filter, (event) => {
      try {
        const sseData = JSON.stringify({
          id: event.id,
          action: event.action,
          targetId: event.targetId,
          targetType: event.targetType,
          oldValue: event.oldValue,
          newValue: event.newValue,
          meta: event.meta,
          timestamp: event.timestamp,
          createdAt: event.createdAt,
        });

        res.write(`id: ${event.id}\nevent: ${event.action}\ndata: ${sseData}\n\n`);
      } catch (e) {
        logger.warn('SSE: ошибка отправки события', { subscriptionId, error: e.message });
      }
    });

    logger.info('SSE: клиент подключен', { database, subscriptionId, filter });

    // Keepalive — пинг каждые 30 секунд
    const pingInterval = setInterval(() => {
      try {
        res.write(`: ping ${new Date().toISOString()}\n\n`);
      } catch {
        clearInterval(pingInterval);
      }
    }, 30000);

    // Отписка при закрытии соединения
    req.on('close', () => {
      clearInterval(pingInterval);
      eventService.unsubscribe(subscriptionId);
      logger.info('SSE: клиент отключен', { database, subscriptionId });
    });
  });

  // ==========================================================================
  // GET /databases/:database/events/log — лог событий (JSON)
  // ==========================================================================

  router.get('/databases/:database/events/log', async (req, res) => {
    try {
      const { database } = req.params;
      const { since, types, actions, limit } = req.query;

      const opts = {};
      if (since) opts.since = parseInt(since, 10);
      if (types) opts.types = types.split(',').map(Number).filter(n => !isNaN(n));
      if (actions) opts.actions = actions.split(',').map(s => s.trim()).filter(Boolean);
      if (limit) opts.limit = parseInt(limit, 10);

      const events = await eventService.getEventLog(database, opts);

      res.json(ok(events, { count: events.length }));
    } catch (e) {
      logger.error('GET events/log', { error: e.message });
      res.status(500).json(err(e));
    }
  });

  // ==========================================================================
  // GET /databases/:database/events/stats — статистика потока
  // ==========================================================================

  router.get('/databases/:database/events/stats', (req, res) => {
    try {
      const { database } = req.params;
      const stats = eventService.getStats(database);
      res.json(ok(stats));
    } catch (e) {
      logger.error('GET events/stats', { error: e.message });
      res.status(500).json(err(e));
    }
  });

  // ==========================================================================
  // POST /databases/:database/events/subscribe — webhook-подписка
  // ==========================================================================

  router.post('/databases/:database/events/subscribe', (req, res) => {
    try {
      const { database } = req.params;
      const { url, filter, secret } = req.body || {};

      if (!url) {
        return res.status(400).json(err({ message: 'url обязателен' }, 'VALIDATION'));
      }

      // Валидация URL
      try {
        new URL(url);
      } catch {
        return res.status(400).json(err({ message: 'Некорректный URL' }, 'VALIDATION'));
      }

      const webhook = eventService.registerWebhook(database, { url, filter, secret });

      res.status(201).json(ok(webhook));
    } catch (e) {
      logger.error('POST events/subscribe', { error: e.message });
      res.status(500).json(err(e));
    }
  });

  // ==========================================================================
  // GET /databases/:database/events/subscribe — список webhook-подписок
  // ==========================================================================

  router.get('/databases/:database/events/subscribe', (req, res) => {
    try {
      const { database } = req.params;
      const webhooks = eventService.listWebhooks(database);
      res.json(ok(webhooks, { count: webhooks.length }));
    } catch (e) {
      logger.error('GET events/subscribe', { error: e.message });
      res.status(500).json(err(e));
    }
  });

  // ==========================================================================
  // DELETE /databases/:database/events/subscribe/:id — отписка webhook
  // ==========================================================================

  router.delete('/databases/:database/events/subscribe/:id', (req, res) => {
    try {
      const { id } = req.params;

      const removed = eventService.removeWebhook(id);
      if (!removed) {
        return res.status(404).json(err({ message: 'Webhook не найден' }, 'NOT_FOUND'));
      }

      res.status(204).send();
    } catch (e) {
      logger.error('DELETE events/subscribe', { error: e.message });
      res.status(500).json(err(e));
    }
  });

  // ==========================================================================
  // POST /databases/:database/events/replay — воспроизведение событий
  // ==========================================================================

  router.post('/databases/:database/events/replay', async (req, res) => {
    try {
      const { database } = req.params;
      const { since, url, secret } = req.body || {};

      if (!since) {
        return res.status(400).json(err({ message: 'since (timestamp) обязателен' }, 'VALIDATION'));
      }

      if (!url) {
        return res.status(400).json(err({ message: 'url обязателен' }, 'VALIDATION'));
      }

      let replayed = 0;
      await eventService.replayEvents(database, parseInt(since, 10), async (event) => {
        // Доставляем каждое событие на указанный URL
        const body = JSON.stringify({ event });
        const headers = { 'Content-Type': 'application/json' };

        if (secret) {
          const { createHmac } = await import('node:crypto');
          const signature = createHmac('sha256', secret).update(body).digest('hex');
          headers['X-Integram-Signature'] = `sha256=${signature}`;
        }

        await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
        replayed++;
      });

      res.json(ok({ replayed }));
    } catch (e) {
      logger.error('POST events/replay', { error: e.message });
      res.status(500).json(err(e));
    }
  });

  return router;
}

export default createEventRoutes;
