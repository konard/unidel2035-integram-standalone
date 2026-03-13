/**
 * @integram/core-data-service - BatchService
 *
 * Сервис пакетных операций: массовое создание, обновление, удаление,
 * импорт и экспорт записей.
 * Closes #184
 */

// ============================================================================
// BatchService Class
// ============================================================================

/**
 * Сервис пакетных (batch) операций над объектами Integram.
 * Поддерживает атомарное и частичное выполнение, массовый импорт/экспорт.
 */
export class BatchService {
  /**
   * @param {Object} databaseService - Сервис доступа к БД
   * @param {Object} deps - Зависимости (objectService, typeService, queryService)
   * @param {Object} [options] - Настройки
   */
  constructor(databaseService, deps = {}, options = {}) {
    this.db = databaseService;
    this.objectService = deps.objectService;
    this.typeService = deps.typeService;
    this.queryService = deps.queryService;
    this.logger = options.logger || console;
  }

  // ============================================================================
  // executeBatch — пакетное выполнение разнородных операций
  // ============================================================================

  /**
   * Пакетное выполнение операций (create / update / delete).
   *
   * @param {string} database - Имя базы данных
   * @param {Array<Object>} operations - Массив операций
   *   Каждая операция: { action: 'create'|'update'|'delete', typeId, data, objectId }
   * @param {Object} [options] - Настройки
   * @param {boolean} [options.atomic=false] - Атомарный режим: все или ничего
   * @returns {Promise<Object>} Результат: { success, failed, results, errors }
   */
  async executeBatch(database, operations, options = {}) {
    const atomic = options.atomic === true;

    if (!Array.isArray(operations) || operations.length === 0) {
      return { success: 0, failed: 0, results: [], errors: [] };
    }

    const results = [];
    const errors = [];
    // Для отката в атомарном режиме сохраняем функции отмены
    const rollbackActions = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      try {
        const { result, rollback } = await this._executeOperation(database, op, i);
        results.push({ index: i, action: op.action, status: 'ok', result });
        rollbackActions.push(rollback);
        successCount++;
      } catch (error) {
        failedCount++;
        const errInfo = { index: i, action: op.action, status: 'error', message: error.message };
        errors.push(errInfo);
        results.push(errInfo);

        // В атомарном режиме — откатываем все предыдущие и прерываем
        if (atomic) {
          this.logger.warn('Batch: атомарный режим, откат предыдущих операций', { index: i, error: error.message });
          for (let j = rollbackActions.length - 1; j >= 0; j--) {
            try {
              if (rollbackActions[j]) await rollbackActions[j]();
            } catch (e) {
              this.logger.error('Ошибка отката', { index: j, error: e.message });
            }
          }
          break;
        }
      }
    }

    this.logger.info('Batch выполнен', { database, success: successCount, failed: failedCount, atomic });

    return { success: successCount, failed: failedCount, results, errors };
  }

  /**
   * Выполнение одной операции из пакета. Возвращает результат и функцию отката.
   * @private
   */
  async _executeOperation(database, op, index) {
    const action = (op.action || '').toLowerCase();

    switch (action) {
      case 'create': {
        if (!op.data?.value && !op.data?.val) {
          throw new Error('Операция #' + index + ': для create нужен value в data');
        }
        const typeId = op.typeId || op.data?.typeId;
        if (!typeId) {
          throw new Error('Операция #' + index + ': для create нужен typeId');
        }
        const created = await this.objectService.create(database, {
          value: op.data.value || op.data.val,
          typeId,
          parentId: op.data.parentId ?? op.data.up ?? 0,
          order: op.data.order ?? op.data.ord,
          requisites: op.data.requisites,
        });
        return {
          result: { action: 'create', id: created.id, success: true },
          rollback: async () => { await this.objectService.delete(database, created.id); },
        };
      }

      case 'update': {
        const objectId = op.objectId || op.id;
        if (!objectId) {
          throw new Error('Операция #' + index + ': для update нужен objectId');
        }
        // Сохраняем снимок для возможного отката
        const oldObj = await this.objectService.getById(database, objectId);
        await this.objectService.update(database, objectId, op.data || {});
        return {
          result: { action: 'update', id: objectId, success: true },
          rollback: async () => {
            if (oldObj) {
              await this.objectService.update(database, objectId, {
                value: oldObj.value, typeId: oldObj.typeId, parentId: oldObj.parentId,
              });
            }
          },
        };
      }

      case 'delete': {
        const objectId = op.objectId || op.id;
        if (!objectId) {
          throw new Error('Операция #' + index + ': для delete нужен objectId');
        }
        const oldObj = await this.objectService.getById(database, objectId);
        await this.objectService.delete(database, objectId, { cascade: !!op.data?.cascade });
        return {
          result: { action: 'delete', id: objectId, success: true },
          rollback: async () => {
            if (oldObj) {
              await this.objectService.create(database, {
                value: oldObj.value, typeId: oldObj.typeId, parentId: oldObj.parentId,
              });
            }
          },
        };
      }

      default:
        throw new Error('Операция #' + index + ': неизвестное действие "' + action + '"');
    }
  }

  // ============================================================================
  // importRecords — массовый импорт записей одного типа
  // ============================================================================

  /**
   * Массовый импорт записей одного типа.
   *
   * @param {string} database - Имя базы данных
   * @param {number} typeId - ID типа для импорта
   * @param {Array<Object>} records - Записи: [{ value, parentId, requisites }, ...]
   * @param {Object} [options] - Настройки
   * @param {boolean} [options.skipDuplicates=false] - Пропускать дубликаты (по value)
   * @param {boolean} [options.updateExisting=false] - Обновлять существующие (по value)
   * @param {number} [options.batchSize=100] - Размер пакета
   * @returns {Promise<Object>} Результат: { created, updated, skipped, errors }
   */
  async importRecords(database, typeId, records, options = {}) {
    const batchSize = options.batchSize || 100;
    const skipDuplicates = options.skipDuplicates === true;
    const updateExisting = options.updateExisting === true;

    if (!Array.isArray(records) || records.length === 0) {
      return { created: 0, updated: 0, skipped: 0, errors: [] };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    // Загружаем существующие записи для проверки дубликатов
    let existingByValue = {};
    if (skipDuplicates || updateExisting) {
      const existing = await this.objectService.getByType(database, typeId, { limit: 100000 });
      for (const obj of existing) {
        existingByValue[obj.value] = obj;
      }
    }

    // Обрабатываем пакетами для контролируемой нагрузки
    for (let i = 0; i < records.length; i += batchSize) {
      const chunk = records.slice(i, i + batchSize);

      for (let j = 0; j < chunk.length; j++) {
        const record = chunk[j];
        const recordIndex = i + j;

        try {
          const value = record.value ?? record.val ?? record.name ?? '';
          if (!value) {
            errors.push({ index: recordIndex, message: 'Отсутствует значение (value)' });
            continue;
          }

          const existingObj = existingByValue[value];

          // Пропуск дубликатов
          if (existingObj && skipDuplicates && !updateExisting) {
            skipped++;
            continue;
          }

          // Обновление существующей записи
          if (existingObj && updateExisting) {
            await this.objectService.update(database, existingObj.id, {
              value,
              requisites: record.requisites,
            });
            updated++;
            continue;
          }

          // Создание новой записи
          const obj = await this.objectService.create(database, {
            value,
            typeId,
            parentId: record.parentId ?? record.up ?? 0,
            requisites: record.requisites,
          });

          existingByValue[value] = { id: obj.id, value };
          created++;
        } catch (error) {
          errors.push({ index: recordIndex, message: error.message });
        }
      }
    }

    this.logger.info('Импорт завершён', { database, typeId, created, updated, skipped, errors: errors.length });

    return { created, updated, skipped, errors };
  }

  // ============================================================================
  // exportRecords — массовый экспорт записей
  // ============================================================================

  /**
   * Массовый экспорт записей указанного типа.
   *
   * @param {string} database - Имя базы данных
   * @param {number} typeId - ID типа
   * @param {Object} [options] - Настройки
   * @param {string} [options.format='json'] - Формат: 'json' | 'csv'
   * @param {Array<string>} [options.fields] - Поля для экспорта
   * @param {Object} [options.filter] - Доп. фильтр (parentId, value)
   * @param {number} [options.limit] - Лимит записей
   * @returns {Promise<Object>} Данные в выбранном формате
   */
  async exportRecords(database, typeId, options = {}) {
    const format = options.format || 'json';
    const fields = options.fields || ['id', 'value', 'parentId', 'typeId', 'order'];

    // Собираем фильтры для запроса
    const queryFilters = { typeId, limit: options.limit || 10000 };
    if (options.filter?.parentId !== undefined) queryFilters.parentId = options.filter.parentId;
    if (options.filter?.value !== undefined) queryFilters.value = options.filter.value;

    // Получаем записи
    const rawRows = await this.queryService.queryObjects(database, queryFilters);

    // Маппим в читаемый формат
    const records = rawRows.map(row => ({
      id: row.id,
      value: row.val,
      parentId: row.up,
      typeId: row.t,
      order: row.ord,
    }));

    // Фильтруем поля
    const filtered = records.map(rec => {
      const obj = {};
      for (const f of fields) {
        if (rec[f] !== undefined) obj[f] = rec[f];
      }
      return obj;
    });

    // CSV-формат
    if (format === 'csv') {
      return this._toCsv(filtered, fields);
    }

    // JSON по умолчанию
    return { format: 'json', count: filtered.length, records: filtered };
  }

  /**
   * Конвертация массива объектов в CSV-строку.
   * @private
   */
  _toCsv(records, fields) {
    const header = fields.join(',');
    if (records.length === 0) {
      return { format: 'csv', count: 0, data: header + '\n' };
    }

    const rows = records.map(rec =>
      fields.map(f => {
        const val = rec[f] ?? '';
        const str = String(val);
        // Экранируем спецсимволы
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(',')
    );

    const data = [header, ...rows].join('\n') + '\n';
    return { format: 'csv', count: records.length, data };
  }

  // ============================================================================
  // deleteByFilter — массовое удаление по фильтру
  // ============================================================================

  /**
   * Массовое удаление записей по фильтру.
   *
   * @param {string} database - Имя базы данных
   * @param {number} typeId - ID типа
   * @param {Object} [filter] - Фильтр
   * @param {number} [filter.parentId] - Родительский ID
   * @param {string} [filter.value] - Фильтр по значению (LIKE)
   * @param {Array<number>} [filter.ids] - Конкретные ID для удаления
   * @returns {Promise<Object>} Результат: { deleted }
   */
  async deleteByFilter(database, typeId, filter = {}) {
    // Если переданы конкретные ID — удаляем по ним
    if (filter.ids && Array.isArray(filter.ids) && filter.ids.length > 0) {
      const count = await this.objectService.deleteByIds(database, filter.ids);
      this.logger.info('Массовое удаление по ID', { database, typeId, deleted: count });
      return { deleted: count };
    }

    // Иначе — находим записи по фильтру и удаляем
    const queryFilters = { typeId, limit: 100000 };
    if (filter.parentId !== undefined) queryFilters.parentId = filter.parentId;
    if (filter.value !== undefined) queryFilters.value = filter.value;

    const rows = await this.queryService.queryObjects(database, queryFilters);

    if (rows.length === 0) {
      return { deleted: 0 };
    }

    const ids = rows.map(r => r.id);
    const count = await this.objectService.deleteByIds(database, ids);

    this.logger.info('Массовое удаление по фильтру', { database, typeId, deleted: count });

    return { deleted: count };
  }
}

// ============================================================================
// Export
// ============================================================================

export default BatchService;
