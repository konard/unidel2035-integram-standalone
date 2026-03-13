/**
 * @integram/core-data-service - EventService
 *
 * Сервис стриминга событий изменений данных.
 * Использует EventEmitter для внутренней pub/sub модели,
 * кольцевой буфер для хранения последних событий в памяти
 * и опциональную персистенцию в таблицу _events.
 */

import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

// ============================================================================
// Константы
// ============================================================================

/** Таблица для персистенции событий */
const EVENTS_TABLE = '_events';

/** Типы действий */
export const EVENT_ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  BATCH: 'batch',
};

/** SQL для создания таблицы событий */
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL,
    action ENUM('create', 'update', 'delete', 'batch') NOT NULL,
    target_id INT DEFAULT NULL,
    target_type INT DEFAULT NULL,
    old_value JSON DEFAULT NULL,
    new_value JSON DEFAULT NULL,
    meta JSON DEFAULT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_action (action),
    INDEX idx_target_type (target_type),
    INDEX idx_created_at (created_at),
    UNIQUE KEY uq_event_id (event_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// ============================================================================
// Кольцевой буфер для хранения событий в памяти
// ============================================================================

class RingBuffer {
  /**
   * @param {number} capacity — максимальный размер буфера
   */
  constructor(capacity = 10000) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;   // указатель на следующую позицию записи
    this.size = 0;   // текущее количество элементов
  }

  /** Добавить элемент в буфер */
  push(item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  /**
   * Получить последние N элементов (от старых к новым).
   * @param {number} [n] — количество, по умолчанию все
   * @returns {Array}
   */
  getLast(n) {
    const count = Math.min(n || this.size, this.size);
    const result = [];
    // Начинаем с самого старого из запрошенных
    let start = (this.head - count + this.capacity) % this.capacity;
    for (let i = 0; i < count; i++) {
      result.push(this.buffer[(start + i) % this.capacity]);
    }
    return result;
  }

  /**
   * Получить все элементы после указанного timestamp.
   * @param {number} since — Unix-время в миллисекундах
   * @returns {Array}
   */
  getSince(since) {
    const all = this.getLast();
    return all.filter(item => item && item.timestamp >= since);
  }

  /** Текущий размер */
  get length() {
    return this.size;
  }
}

// ============================================================================
// EventService
// ============================================================================

export class EventService {
  /**
   * @param {Object} databaseService — сервис доступа к БД (опционально, для персистенции)
   * @param {Object} [options]
   * @param {Object} [options.logger] — логгер
   * @param {number} [options.bufferSize=10000] — размер кольцевого буфера
   * @param {boolean} [options.persistEvents=false] — сохранять события в таблицу _events
   */
  constructor(databaseService, options = {}) {
    this.db = databaseService;
    this.logger = options.logger || console;
    this.persistEvents = options.persistEvents || false;
    this.bufferSize = options.bufferSize || 10000;

    /** EventEmitter для pub/sub */
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(0); // без лимита

    /** Кольцевые буферы по базам данных */
    this.buffers = new Map();

    /** Реестр подписок: subscriptionId -> { db, filter, callback, channel } */
    this.subscriptions = new Map();

    /** Реестр webhook-подписок: id -> { db, url, filter, secret, createdAt } */
    this.webhooks = new Map();

    /** Счётчик подписок */
    this._subCounter = 0;

    /** Флаг инициализации таблиц (по базам) */
    this._initialized = new Set();
  }

  // ==========================================================================
  // Инициализация
  // ==========================================================================

  /**
   * Инициализация таблицы событий для базы данных (если включена персистенция).
   * @param {string} db — имя базы данных
   */
  async ensureTable(db) {
    if (!this.persistEvents || this._initialized.has(db)) return;
    try {
      await this.db.execSql(CREATE_TABLE_SQL, [], 'EventService.ensureTable');
      this._initialized.add(db);
    } catch (e) {
      this.logger.warn('EventService: не удалось создать таблицу событий', { db, error: e.message });
    }
  }

  /**
   * Получить (или создать) кольцевой буфер для базы данных.
   * @param {string} db
   * @returns {RingBuffer}
   */
  getBuffer(db) {
    if (!this.buffers.has(db)) {
      this.buffers.set(db, new RingBuffer(this.bufferSize));
    }
    return this.buffers.get(db);
  }

  // ==========================================================================
  // Публикация событий
  // ==========================================================================

  /**
   * Опубликовать событие.
   *
   * @param {string} db — имя базы данных
   * @param {Object} event — данные события
   * @param {string} event.action — тип действия: create | update | delete | batch
   * @param {number} [event.targetId] — ID затронутого объекта
   * @param {number} [event.targetType] — тип объекта
   * @param {*} [event.oldValue] — значение до изменения
   * @param {*} [event.newValue] — значение после изменения
   * @param {Object} [event.meta] — дополнительные метаданные
   * @returns {Object} — полное событие с id и timestamp
   */
  async emit(db, event) {
    const fullEvent = {
      id: crypto.randomUUID(),
      db,
      action: event.action,
      targetId: event.targetId || null,
      targetType: event.targetType || null,
      oldValue: event.oldValue || null,
      newValue: event.newValue || null,
      meta: event.meta || {},
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
    };

    // Сохраняем в кольцевой буфер
    this.getBuffer(db).push(fullEvent);

    // Публикуем через EventEmitter
    this.emitter.emit(`event:${db}`, fullEvent);

    // Персистенция в БД (если включена)
    if (this.persistEvents) {
      await this._persistEvent(db, fullEvent);
    }

    // Отправляем webhook-подписчикам (асинхронно, без ожидания)
    this._notifyWebhooks(db, fullEvent);

    this.logger.info('EventService: событие опубликовано', {
      db,
      action: fullEvent.action,
      targetId: fullEvent.targetId,
      eventId: fullEvent.id,
    });

    return fullEvent;
  }

  // ==========================================================================
  // Подписка / отписка
  // ==========================================================================

  /**
   * Подписаться на события базы данных с фильтрацией.
   *
   * @param {string} db — имя базы данных
   * @param {Object} [filter] — фильтр событий
   * @param {Array<number>} [filter.types] — фильтр по типам объектов
   * @param {Array<string>} [filter.actions] — фильтр по действиям (create, update, delete)
   * @param {Array<string>} [filter.fields] — фильтр по полям (зарезервировано)
   * @param {Function} callback — функция-обработчик: (event) => void
   * @returns {string} — идентификатор подписки
   */
  subscribe(db, filter, callback) {
    const subscriptionId = `sub_${++this._subCounter}_${Date.now()}`;

    // Обёртка с фильтрацией
    const handler = (event) => {
      if (this._matchesFilter(event, filter)) {
        try {
          callback(event);
        } catch (e) {
          this.logger.warn('EventService: ошибка в обработчике подписки', {
            subscriptionId,
            error: e.message,
          });
        }
      }
    };

    this.emitter.on(`event:${db}`, handler);

    this.subscriptions.set(subscriptionId, {
      db,
      filter,
      callback,
      handler,
      channel: `event:${db}`,
      createdAt: new Date().toISOString(),
    });

    this.logger.info('EventService: подписка создана', { subscriptionId, db, filter });

    return subscriptionId;
  }

  /**
   * Отписаться от событий.
   *
   * @param {string} subscriptionId — идентификатор подписки
   * @returns {boolean} — true если подписка была найдена и удалена
   */
  unsubscribe(subscriptionId) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;

    this.emitter.off(sub.channel, sub.handler);
    this.subscriptions.delete(subscriptionId);

    this.logger.info('EventService: подписка удалена', { subscriptionId });
    return true;
  }

  // ==========================================================================
  // Лог событий
  // ==========================================================================

  /**
   * Получить лог событий.
   *
   * @param {string} db — имя базы данных
   * @param {Object} [options]
   * @param {number} [options.since] — timestamp (ms) начала выборки
   * @param {Array<number>} [options.types] — фильтр по типам
   * @param {Array<string>} [options.actions] — фильтр по действиям
   * @param {number} [options.limit=100] — макс. кол-во
   * @returns {Array} — массив событий
   */
  async getEventLog(db, options = {}) {
    // Если есть персистенция — берём из БД
    if (this.persistEvents && this.db && !options._fromBuffer) {
      return this._getPersistedLog(db, options);
    }

    // Иначе из кольцевого буфера
    const buffer = this.getBuffer(db);
    let events = options.since
      ? buffer.getSince(options.since)
      : buffer.getLast();

    // Применяем фильтры
    if (options.types && options.types.length > 0) {
      events = events.filter(e => options.types.includes(e.targetType));
    }
    if (options.actions && options.actions.length > 0) {
      events = events.filter(e => options.actions.includes(e.action));
    }

    // Лимит
    const limit = options.limit || 100;
    return events.slice(-limit);
  }

  /**
   * Воспроизвести события начиная с указанного момента.
   *
   * @param {string} db — имя базы данных
   * @param {number} since — timestamp (ms)
   * @param {Function} callback — обработчик: (event) => void
   * @returns {number} — количество воспроизведённых событий
   */
  async replayEvents(db, since, callback) {
    const events = await this.getEventLog(db, { since });
    let count = 0;

    for (const event of events) {
      try {
        await callback(event);
        count++;
      } catch (e) {
        this.logger.warn('EventService: ошибка при воспроизведении события', {
          eventId: event.id,
          error: e.message,
        });
      }
    }

    this.logger.info('EventService: воспроизведено событий', { db, since, count });
    return count;
  }

  // ==========================================================================
  // Webhook-подписки
  // ==========================================================================

  /**
   * Зарегистрировать webhook-подписку.
   *
   * @param {string} db — имя базы данных
   * @param {Object} options
   * @param {string} options.url — URL для доставки уведомлений
   * @param {Object} [options.filter] — фильтр событий
   * @param {string} [options.secret] — секрет для подписи запросов (HMAC)
   * @returns {Object} — данные подписки с id
   */
  registerWebhook(db, options) {
    const id = `wh_${crypto.randomUUID()}`;
    const webhook = {
      id,
      db,
      url: options.url,
      filter: options.filter || {},
      secret: options.secret || null,
      createdAt: new Date().toISOString(),
      deliveries: 0,
      lastDelivery: null,
      errors: 0,
    };

    this.webhooks.set(id, webhook);

    this.logger.info('EventService: webhook зарегистрирован', { id, db, url: options.url });
    return { id, db, url: options.url, filter: webhook.filter, createdAt: webhook.createdAt };
  }

  /**
   * Удалить webhook-подписку.
   *
   * @param {string} id — идентификатор webhook
   * @returns {boolean}
   */
  removeWebhook(id) {
    const existed = this.webhooks.delete(id);
    if (existed) {
      this.logger.info('EventService: webhook удалён', { id });
    }
    return existed;
  }

  /**
   * Список webhook-подписок для базы данных.
   *
   * @param {string} db
   * @returns {Array}
   */
  listWebhooks(db) {
    const result = [];
    for (const wh of this.webhooks.values()) {
      if (wh.db === db) {
        result.push({
          id: wh.id,
          url: wh.url,
          filter: wh.filter,
          createdAt: wh.createdAt,
          deliveries: wh.deliveries,
          lastDelivery: wh.lastDelivery,
          errors: wh.errors,
        });
      }
    }
    return result;
  }

  // ==========================================================================
  // Статистика
  // ==========================================================================

  /**
   * Получить статистику сервиса событий.
   * @param {string} [db] — если указано, статистика по конкретной базе
   * @returns {Object}
   */
  getStats(db) {
    const stats = {
      totalSubscriptions: this.subscriptions.size,
      totalWebhooks: this.webhooks.size,
      buffers: {},
    };

    if (db) {
      const buffer = this.buffers.get(db);
      stats.buffers[db] = buffer ? buffer.length : 0;
    } else {
      for (const [name, buffer] of this.buffers) {
        stats.buffers[name] = buffer.length;
      }
    }

    return stats;
  }

  // ==========================================================================
  // Приватные методы
  // ==========================================================================

  /**
   * Проверить, соответствует ли событие фильтру.
   * @param {Object} event
   * @param {Object} filter
   * @returns {boolean}
   */
  _matchesFilter(event, filter) {
    if (!filter) return true;

    // Фильтр по типам
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(event.targetType)) return false;
    }

    // Фильтр по действиям
    if (filter.actions && filter.actions.length > 0) {
      if (!filter.actions.includes(event.action)) return false;
    }

    return true;
  }

  /**
   * Сохранить событие в таблицу _events.
   * @param {string} db
   * @param {Object} event
   */
  async _persistEvent(db, event) {
    try {
      await this.ensureTable(db);
      const sql = `INSERT INTO ${EVENTS_TABLE} (event_id, action, target_id, target_type, old_value, new_value, meta) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      await this.db.execSql(sql, [
        event.id,
        event.action,
        event.targetId,
        event.targetType,
        event.oldValue ? JSON.stringify(event.oldValue) : null,
        event.newValue ? JSON.stringify(event.newValue) : null,
        event.meta ? JSON.stringify(event.meta) : null,
      ], 'EventService._persistEvent');
    } catch (e) {
      this.logger.warn('EventService: ошибка персистенции события', { eventId: event.id, error: e.message });
    }
  }

  /**
   * Получить события из таблицы _events.
   * @param {string} db
   * @param {Object} options
   * @returns {Array}
   */
  async _getPersistedLog(db, options = {}) {
    try {
      await this.ensureTable(db);
      let sql = `SELECT * FROM ${EVENTS_TABLE} WHERE 1=1`;
      const params = [];

      if (options.since) {
        sql += ' AND created_at >= ?';
        params.push(new Date(options.since).toISOString());
      }

      if (options.types && options.types.length > 0) {
        sql += ` AND target_type IN (${options.types.map(() => '?').join(',')})`;
        params.push(...options.types);
      }

      if (options.actions && options.actions.length > 0) {
        sql += ` AND action IN (${options.actions.map(() => '?').join(',')})`;
        params.push(...options.actions);
      }

      sql += ' ORDER BY created_at ASC';

      const limit = options.limit || 100;
      sql += ' LIMIT ?';
      params.push(limit);

      const result = await this.db.execSql(sql, params, 'EventService._getPersistedLog');
      return (result.rows || []).map(row => ({
        id: row.event_id,
        db,
        action: row.action,
        targetId: row.target_id,
        targetType: row.target_type,
        oldValue: row.old_value ? JSON.parse(row.old_value) : null,
        newValue: row.new_value ? JSON.parse(row.new_value) : null,
        meta: row.meta ? JSON.parse(row.meta) : null,
        timestamp: new Date(row.created_at).getTime(),
        createdAt: row.created_at,
      }));
    } catch (e) {
      this.logger.warn('EventService: ошибка чтения лога из БД, возврат к буферу', { error: e.message });
      // Фолбэк на кольцевой буфер
      return this.getEventLog(db, { ...options, _fromBuffer: true });
    }
  }

  /**
   * Уведомить все webhook-подписки для данной базы (асинхронно).
   * @param {string} db
   * @param {Object} event
   */
  _notifyWebhooks(db, event) {
    for (const wh of this.webhooks.values()) {
      if (wh.db !== db) continue;
      if (!this._matchesFilter(event, wh.filter)) continue;

      // Асинхронная доставка без блокировки
      this._deliverWebhook(wh, event).catch(() => {});
    }
  }

  /**
   * Доставить событие на webhook URL.
   * @param {Object} webhook
   * @param {Object} event
   */
  async _deliverWebhook(webhook, event) {
    try {
      const body = JSON.stringify({
        event: {
          id: event.id,
          db: event.db,
          action: event.action,
          targetId: event.targetId,
          targetType: event.targetType,
          oldValue: event.oldValue,
          newValue: event.newValue,
          meta: event.meta,
          timestamp: event.timestamp,
          createdAt: event.createdAt,
        },
      });

      const headers = {
        'Content-Type': 'application/json',
        'X-Integram-Event': event.action,
        'X-Integram-Delivery': event.id,
      };

      // Если задан секрет — подписываем тело запроса HMAC-SHA256
      if (webhook.secret) {
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(body)
          .digest('hex');
        headers['X-Integram-Signature'] = `sha256=${signature}`;
      }

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000), // таймаут 10 сек
      });

      webhook.deliveries++;
      webhook.lastDelivery = new Date().toISOString();

      if (!response.ok) {
        webhook.errors++;
        this.logger.warn('EventService: webhook ответил ошибкой', {
          webhookId: webhook.id,
          status: response.status,
        });
      }
    } catch (e) {
      webhook.errors++;
      this.logger.warn('EventService: ошибка доставки webhook', {
        webhookId: webhook.id,
        error: e.message,
      });
    }
  }
}

// ============================================================================
// Экспорт
// ============================================================================

export default EventService;
