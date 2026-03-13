/**
 * @integram/core-data-service - SearchService
 *
 * Поисковый API, оптимизированный для AI-агентов.
 * Полнотекстовый поиск, фильтрация по реквизитам, агрегация,
 * обход графа связей, семантический поиск (заглушка), NL-запросы.
 */

import {
  ValidationError,
  DEFAULT_LIMIT,
  BASIC_TYPES,
} from '@integram/common';

import { ValidationService } from './ValidationService.js';

// ============================================================================
// Допустимые операторы фильтрации
// ============================================================================

const ALLOWED_OPERATORS = new Set([
  'eq', 'ne', 'gt', 'lt', 'gte', 'lte',
  'contains', 'startsWith', 'endsWith', 'in',
]);

// Маппинг операторов в SQL-фрагменты
const OPERATOR_SQL = {
  eq:         '= ?',
  ne:         '!= ?',
  gt:         '> ?',
  lt:         '< ?',
  gte:        '>= ?',
  lte:        '<= ?',
  contains:   'LIKE ?',
  startsWith: 'LIKE ?',
  endsWith:   'LIKE ?',
};

// Допустимые агрегатные функции
const ALLOWED_AGG_FN = new Set(['count', 'sum', 'avg', 'min', 'max']);

// Максимальная глубина обхода графа
const MAX_GRAPH_DEPTH = 3;

// ============================================================================
// SearchService Class
// ============================================================================

export class SearchService {
  /**
   * @param {Object} databaseService — сервис доступа к БД
   * @param {Object} deps — зависимости (queryService, typeService, objectService)
   * @param {Object} [options]
   */
  constructor(databaseService, deps = {}, options = {}) {
    this.db = databaseService;
    this.queryService = deps.queryService;
    this.typeService = deps.typeService;
    this.objectService = deps.objectService;
    this.logger = options.logger || console;
    this.validation = options.validationService || new ValidationService(options);
  }

  // ==========================================================================
  // 1. Полнотекстовый поиск
  // ==========================================================================

  /**
   * Полнотекстовый поиск по значениям (val) объектов.
   *
   * @param {string} database — имя базы
   * @param {Object} query — параметры поиска
   * @param {string} query.text — искомый текст
   * @param {number[]} [query.types] — ограничить поиск типами
   * @param {string[]} [query.fields] — имена реквизитов для поиска (по алиасу/имени)
   * @param {number} [query.limit] — лимит результатов
   * @param {number} [query.offset] — смещение
   * @returns {Promise<{results: Array, total: number}>}
   */
  async search(database, query = {}) {
    const db = this.validation.validateDatabase(database);
    const text = (query.text || '').trim();
    if (!text) {
      throw new ValidationError('Параметр text обязателен для поиска');
    }

    const limit = query.limit ? parseInt(query.limit, 10) : DEFAULT_LIMIT;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const types = Array.isArray(query.types) ? query.types.map(Number).filter(Boolean) : [];

    // --- Основной поиск по val ---
    const conditions = ['val LIKE ?'];
    const params = ['%' + text + '%'];

    if (types.length > 0) {
      conditions.push('t IN (' + types.map(() => '?').join(', ') + ')');
      params.push(...types);
    }

    // Не включать метаданные (типы, up=0) — ищем только данные
    conditions.push('up != 0');

    const whereClause = conditions.join(' AND ');

    // Получаем общий счётчик
    const countSql = 'SELECT COUNT(*) as total FROM ' + db + ' WHERE ' + whereClause;
    const countResult = await this.db.execSql(countSql, [...params], 'SearchService.search.count');
    const total = countResult.rows && countResult.rows[0] ? countResult.rows[0].total : 0;

    // Получаем результаты
    const dataSql = 'SELECT id, val, up, t, ord FROM ' + db + ' WHERE ' + whereClause + ' ORDER BY val ASC LIMIT ? OFFSET ?';
    const dataResult = await this.db.execSql(dataSql, [...params, limit, offset], 'SearchService.search.data');
    const rows = dataResult.rows || [];

    // --- Если указаны fields — дополнительно ищем по реквизитам ---
    let fieldResults = [];
    if (Array.isArray(query.fields) && query.fields.length > 0 && types.length > 0) {
      fieldResults = await this._searchByFields(db, text, types, query.fields);
    }

    // Объединяем результаты, убираем дубли по id
    const seen = new Set(rows.map(r => r.id));
    for (const fr of fieldResults) {
      if (!seen.has(fr.id)) {
        rows.push(fr);
        seen.add(fr.id);
      }
    }

    return {
      results: rows.map(r => ({
        id: r.id,
        value: r.val,
        parentId: r.up,
        typeId: r.t,
        order: r.ord,
      })),
      total,
    };
  }

  /**
   * Поиск по значениям конкретных реквизитов (полей).
   * Находит объекты-реквизиты, затем возвращает их родителей.
   * @private
   */
  async _searchByFields(db, text, types, fieldNames) {
    // Получаем id реквизитных типов по имени/алиасу
    const reqTypeIds = [];
    for (const typeId of types) {
      try {
        const requisites = await this.typeService.getRequisites(db, typeId);
        for (const req of requisites) {
          const nameMatch = fieldNames.some(fn =>
            req.name.toLowerCase() === fn.toLowerCase() ||
            (req.alias && req.alias.toLowerCase() === fn.toLowerCase())
          );
          if (nameMatch) {
            reqTypeIds.push(req.id);
          }
        }
      } catch (_e) {
        // Тип не найден — пропускаем
      }
    }

    if (reqTypeIds.length === 0) return [];

    // Ищем реквизиты с подходящим значением
    const placeholders = reqTypeIds.map(() => '?').join(', ');
    const sql = 'SELECT DISTINCT up FROM ' + db + ' WHERE t IN (' + placeholders + ') AND val LIKE ? LIMIT 100';
    const result = await this.db.execSql(sql, [...reqTypeIds, '%' + text + '%'], 'SearchService._searchByFields');
    const parentIds = (result.rows || []).map(r => r.up);

    if (parentIds.length === 0) return [];

    // Загружаем объекты-родители
    const pPlaceholders = parentIds.map(() => '?').join(', ');
    const parentSql = 'SELECT id, val, up, t, ord FROM ' + db + ' WHERE id IN (' + pPlaceholders + ')';
    const parentResult = await this.db.execSql(parentSql, parentIds, 'SearchService._searchByFields.parents');
    return parentResult.rows || [];
  }

  // ==========================================================================
  // 2. Фильтрация по значениям реквизитов
  // ==========================================================================

  /**
   * Фильтрация объектов указанного типа по значениям реквизитов.
   *
   * @param {string} database — имя базы
   * @param {number} typeId — тип объектов
   * @param {Object} body — тело запроса
   * @param {Array} body.conditions — массив условий [{field, operator, value}]
   * @param {string} [body.logic='AND'] — 'AND' или 'OR'
   * @param {number} [body.limit]
   * @param {number} [body.offset]
   * @returns {Promise<{results: Array, total: number}>}
   */
  async filter(database, typeId, body = {}) {
    const db = this.validation.validateDatabase(database);
    const type = this.validation.validateTypeId(typeId);
    const conditions = body.conditions || [];
    const logic = (body.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
    const limit = body.limit ? parseInt(body.limit, 10) : DEFAULT_LIMIT;
    const offset = body.offset ? parseInt(body.offset, 10) : 0;

    if (!Array.isArray(conditions) || conditions.length === 0) {
      throw new ValidationError('Массив conditions обязателен и не может быть пустым');
    }

    // Разрешаем имена полей -> id реквизитных типов
    const requisites = await this.typeService.getRequisites(db, type);
    const reqMap = {};
    for (const req of requisites) {
      reqMap[req.name.toLowerCase()] = req;
      if (req.alias) reqMap[req.alias.toLowerCase()] = req;
    }

    // Строим подзапросы
    const subQueries = [];
    const allParams = [];

    for (const cond of conditions) {
      const { field, operator, value } = cond;
      if (!field || !operator) {
        throw new ValidationError('Условие должно содержать field и operator');
      }
      if (!ALLOWED_OPERATORS.has(operator)) {
        throw new ValidationError('Неподдерживаемый оператор: ' + operator + '. Допустимые: ' + [...ALLOWED_OPERATORS].join(', '));
      }

      const reqDef = reqMap[field.toLowerCase()];
      if (!reqDef) {
        throw new ValidationError('Реквизит "' + field + '" не найден в типе ' + typeId);
      }

      let sqlOp;
      let sqlValue;
      if (operator === 'in') {
        if (!Array.isArray(value)) {
          throw new ValidationError('Для оператора "in" value должен быть массивом');
        }
        sqlOp = 'IN (' + value.map(() => '?').join(', ') + ')';
        sqlValue = value;
      } else if (operator === 'contains') {
        sqlOp = OPERATOR_SQL[operator];
        sqlValue = ['%' + value + '%'];
      } else if (operator === 'startsWith') {
        sqlOp = OPERATOR_SQL[operator];
        sqlValue = [value + '%'];
      } else if (operator === 'endsWith') {
        sqlOp = OPERATOR_SQL[operator];
        sqlValue = ['%' + value];
      } else {
        sqlOp = OPERATOR_SQL[operator];
        sqlValue = [value];
      }

      const sub = 'SELECT up FROM ' + db + ' WHERE t = ? AND val ' + sqlOp;
      subQueries.push(sub);
      allParams.push(reqDef.id);
      if (Array.isArray(sqlValue)) {
        allParams.push(...sqlValue);
      }
    }

    // Объединяем подзапросы
    let filterSql;
    if (logic === 'OR') {
      const unionSql = subQueries.join(' UNION ');
      filterSql = 'SELECT id, val, up, t, ord FROM ' + db + ' WHERE t = ? AND id IN (' + unionSql + ')';
    } else {
      if (subQueries.length === 1) {
        filterSql = 'SELECT id, val, up, t, ord FROM ' + db + ' WHERE t = ? AND id IN (' + subQueries[0] + ')';
      } else {
        let inner = subQueries[0];
        for (let i = 1; i < subQueries.length; i++) {
          inner = 'SELECT up FROM (' + inner + ') _s' + i + ' WHERE up IN (' + subQueries[i] + ')';
        }
        filterSql = 'SELECT id, val, up, t, ord FROM ' + db + ' WHERE t = ? AND id IN (' + inner + ')';
      }
    }

    // Счётчик
    const countSql = 'SELECT COUNT(*) as total FROM (' + filterSql + ') _cnt';
    const countParams = [type, ...allParams];
    const countResult = await this.db.execSql(countSql, countParams, 'SearchService.filter.count');
    const total = countResult.rows && countResult.rows[0] ? countResult.rows[0].total : 0;

    // Данные с пагинацией
    const dataSql = filterSql + ' ORDER BY ord ASC LIMIT ? OFFSET ?';
    const dataParams = [type, ...allParams, limit, offset];
    const dataResult = await this.db.execSql(dataSql, dataParams, 'SearchService.filter.data');
    const rows = dataResult.rows || [];

    return {
      results: rows.map(r => ({
        id: r.id,
        value: r.val,
        parentId: r.up,
        typeId: r.t,
        order: r.ord,
      })),
      total,
    };
  }

  // ==========================================================================
  // 3. Агрегация данных
  // ==========================================================================

  /**
   * Агрегация значений реквизитов объектов заданного типа.
   *
   * @param {string} database
   * @param {number} typeId
   * @param {Object} options
   * @param {string} options.groupBy — имя реквизита для группировки
   * @param {Array} options.metrics — [{field, fn: 'count'|'sum'|'avg'|'min'|'max'}]
   * @returns {Promise<{groups: Array}>}
   */
  async aggregate(database, typeId, options = {}) {
    const db = this.validation.validateDatabase(database);
    const type = this.validation.validateTypeId(typeId);
    const { groupBy, metrics } = options;

    if (!groupBy) {
      throw new ValidationError('Параметр groupBy обязателен');
    }
    if (!Array.isArray(metrics) || metrics.length === 0) {
      throw new ValidationError('Массив metrics обязателен и не может быть пустым');
    }

    // Разрешаем имена полей
    const requisites = await this.typeService.getRequisites(db, type);
    const reqMap = {};
    for (const req of requisites) {
      reqMap[req.name.toLowerCase()] = req;
      if (req.alias) reqMap[req.alias.toLowerCase()] = req;
    }

    const groupReq = reqMap[groupBy.toLowerCase()];
    if (!groupReq) {
      throw new ValidationError('Реквизит "' + groupBy + '" не найден в типе ' + typeId);
    }

    // Получаем все объекты данного типа
    const objectsSql = 'SELECT id FROM ' + db + ' WHERE t = ? AND up != 0';
    const objResult = await this.db.execSql(objectsSql, [type], 'SearchService.aggregate.objects');
    const objectIds = (objResult.rows || []).map(r => r.id);

    if (objectIds.length === 0) {
      return { groups: [] };
    }

    const placeholders = objectIds.map(() => '?').join(', ');

    // Получаем значения groupBy-реквизита
    const groupSql = 'SELECT up, val FROM ' + db + ' WHERE up IN (' + placeholders + ') AND t = ?';
    const groupResult = await this.db.execSql(groupSql, [...objectIds, groupReq.id], 'SearchService.aggregate.groupBy');

    // Маппинг objectId -> groupValue
    const groupMap = {};
    for (const row of (groupResult.rows || [])) {
      groupMap[row.up] = row.val;
    }

    // Для каждой метрики получаем значения
    const metricData = {};
    for (const metric of metrics) {
      if (!metric.field || !metric.fn) {
        throw new ValidationError('Каждая метрика должна содержать field и fn');
      }
      if (!ALLOWED_AGG_FN.has(metric.fn)) {
        throw new ValidationError('Неподдерживаемая функция: ' + metric.fn + '. Допустимые: ' + [...ALLOWED_AGG_FN].join(', '));
      }

      if (metric.fn === 'count') {
        metricData[metric.field + '_' + metric.fn] = { fn: 'count', values: {} };
        continue;
      }

      const metricReq = reqMap[metric.field.toLowerCase()];
      if (!metricReq) {
        throw new ValidationError('Реквизит "' + metric.field + '" не найден в типе ' + typeId);
      }

      const metricSql = 'SELECT up, val FROM ' + db + ' WHERE up IN (' + placeholders + ') AND t = ?';
      const metricResult = await this.db.execSql(metricSql, [...objectIds, metricReq.id], 'SearchService.aggregate.metric');
      const valMap = {};
      for (const row of (metricResult.rows || [])) {
        valMap[row.up] = parseFloat(row.val) || 0;
      }
      metricData[metric.field + '_' + metric.fn] = { fn: metric.fn, values: valMap, req: metricReq };
    }

    // Группируем
    const groupBuckets = {};
    for (const objId of objectIds) {
      const groupVal = groupMap[objId] || '(пусто)';
      if (!groupBuckets[groupVal]) {
        groupBuckets[groupVal] = [];
      }
      groupBuckets[groupVal].push(objId);
    }

    // Вычисляем агрегаты
    const groups = Object.entries(groupBuckets).map(([groupValue, ids]) => {
      const metricsResult = {};
      for (const metric of metrics) {
        const key = metric.field + '_' + metric.fn;
        const data = metricData[key];
        if (metric.fn === 'count') {
          metricsResult[key] = ids.length;
        } else {
          const vals = ids.map(id => data.values[id]).filter(v => v !== undefined);
          metricsResult[key] = this._computeAggregate(metric.fn, vals);
        }
      }
      return { groupValue, count: ids.length, metrics: metricsResult };
    });

    groups.sort((a, b) => b.count - a.count);

    return { groups };
  }

  /**
   * Вычисление агрегатной функции для массива чисел.
   * @private
   */
  _computeAggregate(fn, values) {
    if (values.length === 0) return null;
    switch (fn) {
      case 'sum': return values.reduce((a, b) => a + b, 0);
      case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
      case 'min': return Math.min(...values);
      case 'max': return Math.max(...values);
      case 'count': return values.length;
      default: return null;
    }
  }

  // ==========================================================================
  // 4. Поиск связанных объектов (обход графа reference-полей)
  // ==========================================================================

  /**
   * Находит объекты, связанные через reference-реквизиты.
   *
   * @param {string} database
   * @param {number} objectId
   * @param {number} [depth=1] — глубина обхода (макс 3)
   * @returns {Promise<{root: Object, related: Array, depth: number}>}
   */
  async findRelated(database, objectId, depth = 1) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(objectId);
    const maxDepth = Math.min(Math.max(parseInt(depth, 10) || 1, 1), MAX_GRAPH_DEPTH);

    // Загружаем корневой объект
    const rootRow = await this.queryService.executeOne(
      'SELECT id, val, up, t, ord FROM ' + db + ' WHERE id = ?',
      [objId]
    );

    if (!rootRow) {
      throw new ValidationError('Объект ' + objectId + ' не найден');
    }

    const root = {
      id: rootRow.id,
      value: rootRow.val,
      parentId: rootRow.up,
      typeId: rootRow.t,
    };

    // BFS обход связей
    const visited = new Set([objId]);
    const related = [];
    let frontier = [objId];

    for (let d = 0; d < maxDepth; d++) {
      if (frontier.length === 0) break;
      const nextFrontier = [];

      for (const currentId of frontier) {
        // Ищем реквизиты, которые являются ссылками (тип > 50 = пользовательский)
        const reqsSql = 'SELECT id, val, t FROM ' + db + ' WHERE up = ? AND t > 50';
        const reqsResult = await this.db.execSql(reqsSql, [currentId], 'SearchService.findRelated.reqs');
        const reqs = reqsResult.rows || [];

        for (const req of reqs) {
          const refId = parseInt(req.val, 10);
          if (!refId || isNaN(refId) || visited.has(refId)) continue;

          const refRow = await this.queryService.executeOne(
            'SELECT id, val, up, t, ord FROM ' + db + ' WHERE id = ?',
            [refId]
          );

          if (refRow) {
            visited.add(refId);
            related.push({
              id: refRow.id,
              value: refRow.val,
              parentId: refRow.up,
              typeId: refRow.t,
              distance: d + 1,
              linkedFrom: currentId,
              linkRequisiteType: req.t,
            });
            nextFrontier.push(refId);
          }
        }

        // Обратные ссылки
        const backRefsSql = 'SELECT up FROM ' + db + ' WHERE val = ? AND t > 50 AND up != 0';
        const backRefsResult = await this.db.execSql(backRefsSql, [String(currentId)], 'SearchService.findRelated.backRefs');
        const backRefs = backRefsResult.rows || [];

        for (const br of backRefs) {
          if (visited.has(br.up)) continue;

          const refRow = await this.queryService.executeOne(
            'SELECT id, val, up, t, ord FROM ' + db + ' WHERE id = ?',
            [br.up]
          );

          if (refRow) {
            visited.add(br.up);
            related.push({
              id: refRow.id,
              value: refRow.val,
              parentId: refRow.up,
              typeId: refRow.t,
              distance: d + 1,
              linkedFrom: currentId,
              direction: 'inbound',
            });
            nextFrontier.push(br.up);
          }
        }
      }

      frontier = nextFrontier;
    }

    return { root, related, depth: maxDepth };
  }

  // ==========================================================================
  // 5. Семантический поиск (заглушка)
  // ==========================================================================

  /**
   * Семантический (векторный) поиск — заглушка.
   * Пока выполняет fuzzy text match через LIKE и нечёткое сравнение.
   *
   * @param {string} database
   * @param {string} query — поисковый запрос
   * @param {Object} [options]
   * @param {number[]} [options.types]
   * @param {number} [options.limit]
   * @returns {Promise<{results: Array, engine: string}>}
   */
  async semanticSearch(database, query, options = {}) {
    const db = this.validation.validateDatabase(database);
    const text = (query || '').trim();
    if (!text) {
      throw new ValidationError('Параметр query обязателен');
    }

    const limit = options.limit ? parseInt(options.limit, 10) : DEFAULT_LIMIT;
    const types = Array.isArray(options.types) ? options.types.map(Number).filter(Boolean) : [];

    // Разбиваем на слова для fuzzy-поиска
    const words = text.split(/\s+/).filter(w => w.length >= 2);

    if (words.length === 0) {
      return { results: [], engine: 'fuzzy-text' };
    }

    // Считаем релевантность как количество совпавших слов
    const scoreExpr = words.map(() => '(val LIKE ?)').join(' + ');
    const scoreParams = words.map(w => '%' + w + '%');

    const conditions = words.map(() => 'val LIKE ?');
    const condParams = words.map(w => '%' + w + '%');

    let typesCondition = '';
    const typesParams = [];
    if (types.length > 0) {
      typesCondition = ' AND t IN (' + types.map(() => '?').join(', ') + ')';
      typesParams.push(...types);
    }

    const sql = 'SELECT id, val, up, t, ord, (' + scoreExpr + ') as relevance FROM ' + db +
      ' WHERE (' + conditions.join(' OR ') + ') AND up != 0' + typesCondition +
      ' ORDER BY relevance DESC, val ASC LIMIT ?';

    const allParams = [...scoreParams, ...condParams, ...typesParams, limit];
    const result = await this.db.execSql(sql, allParams, 'SearchService.semanticSearch');
    const rows = result.rows || [];

    return {
      results: rows.map(r => ({
        id: r.id,
        value: r.val,
        parentId: r.up,
        typeId: r.t,
        relevance: r.relevance || 0,
      })),
      engine: 'fuzzy-text',
      note: 'Семантический поиск пока работает как fuzzy text match. Векторный движок будет добавлен позднее.',
    };
  }

  // ==========================================================================
  // 6. Парсинг Natural Language запросов
  // ==========================================================================

  /**
   * Парсит естественноязыковый запрос в filter conditions.
   * Базовый парсер русского и английского языков.
   *
   * @param {string} database
   * @param {string} nlQuery — запрос вида "найди все дроны с весом больше 5 кг"
   * @returns {Promise<{parsed: Object, results: Array}>}
   */
  async naturalLanguageQuery(database, nlQuery) {
    const db = this.validation.validateDatabase(database);
    const text = (nlQuery || '').trim();
    if (!text) {
      throw new ValidationError('Параметр nlQuery обязателен');
    }

    // Парсим запрос
    const parsed = this._parseNL(text);

    // Если удалось распознать тип и условия — выполняем фильтрацию
    if (parsed.typeHint && parsed.conditions.length > 0) {
      const types = await this.queryService.getTypes(db);
      const matchedType = types.find(t =>
        t.name.toLowerCase().includes(parsed.typeHint.toLowerCase())
      );

      if (matchedType) {
        try {
          const filterResult = await this.filter(database, matchedType.id, {
            conditions: parsed.conditions,
            limit: parsed.limit || DEFAULT_LIMIT,
          });
          return {
            parsed,
            matchedType: { id: matchedType.id, name: matchedType.name },
            results: filterResult.results,
            total: filterResult.total,
          };
        } catch (e) {
          this.logger.debug('NL фильтрация не удалась, фоллбэк на текстовый поиск', { error: e.message });
        }
      }
    }

    // Фоллбэк: текстовый поиск по ключевым словам
    const keywords = parsed.keywords.join(' ');
    const searchResult = await this.search(database, {
      text: keywords || text,
      limit: parsed.limit || DEFAULT_LIMIT,
    });

    return {
      parsed,
      results: searchResult.results,
      total: searchResult.total,
      fallback: true,
    };
  }

  /**
   * Базовый парсер естественного языка.
   * Распознаёт паттерны вида:
   *   "найди все <тип> с <поле> больше|меньше|равно <значение>"
   *   "покажи <тип> где <поле> содержит <значение>"
   *
   * @private
   * @param {string} text
   * @returns {{typeHint: string|null, conditions: Array, keywords: string[], limit: number|null}}
   */
  _parseNL(text) {
    const lower = text.toLowerCase();
    const result = {
      typeHint: null,
      conditions: [],
      keywords: [],
      limit: null,
      originalQuery: text,
    };

    // Извлечение лимита: "первые 10", "top 10", "лимит 5"
    const limitMatch = lower.match(/(?:перв\w*|top|лимит|limit)\s+(\d+)/);
    if (limitMatch) {
      result.limit = parseInt(limitMatch[1], 10);
    }

    // Паттерны для распознавания
    const patterns = [
      // "найди дроны с весом больше 5"
      /(?:найди|покажи|выведи|отфильтруй|найти|показать)\s+(?:все|всех)?\s*(\S+)\s+(?:с|где|с\s+полем|у\s+которых)\s+(\S+)\s+(больше|меньше|равно|равен|равна|содержит|начинается|заканчивается|не\s+равно)\s+(.+)/i,
      // "дроны где вес > 5"
      /(\S+)\s+(?:где|с|у\s+которых)\s+(\S+)\s*(>|<|>=|<=|=|!=|содержит|contains)\s*(.+)/i,
      // "find drones where weight > 5"
      /(?:find|show|get|list)\s+(?:all)?\s*(\S+)\s+(?:where|with)\s+(\S+)\s*(>|<|>=|<=|=|!=|contains|starts\s*with|like)\s*(.+)/i,
    ];

    for (const pattern of patterns) {
      const match = lower.match(pattern);
      if (match) {
        result.typeHint = match[1].replace(/[ыиея]$/, '');
        const field = match[2];
        const opRaw = match[3].trim();
        const value = match[4].trim().replace(/\s*(кг|штук|шт|руб|м|км|%)\s*$/i, '').trim();

        // Маппинг оператора
        const opMap = {
          'больше': 'gt', '>': 'gt', '>=': 'gte',
          'меньше': 'lt', '<': 'lt', '<=': 'lte',
          'равно': 'eq', 'равен': 'eq', 'равна': 'eq', '=': 'eq',
          'не равно': 'ne', '!=': 'ne',
          'содержит': 'contains', 'contains': 'contains', 'like': 'contains',
          'начинается': 'startsWith', 'starts with': 'startsWith',
          'заканчивается': 'endsWith',
        };

        result.conditions.push({
          field,
          operator: opMap[opRaw] || 'contains',
          value: isNaN(Number(value)) ? value : Number(value),
        });

        break;
      }
    }

    // Извлекаем ключевые слова (без стоп-слов)
    const stopWords = new Set([
      'найди', 'покажи', 'выведи', 'все', 'всех', 'с', 'где', 'у', 'которых',
      'find', 'show', 'get', 'list', 'all', 'where', 'with', 'the', 'a', 'an',
      'и', 'или', 'не', 'в', 'на', 'по', 'для', 'от', 'до',
      'больше', 'меньше', 'равно', 'содержит',
    ]);

    result.keywords = text.split(/\s+/)
      .map(w => w.replace(/[.,!?;:()]/g, '').toLowerCase())
      .filter(w => w.length >= 2 && !stopWords.has(w));

    return result;
  }
}

// ============================================================================
// Export
// ============================================================================

export default SearchService;
