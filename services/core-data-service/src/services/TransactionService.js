/**
 * @integram/core-data-service - TransactionService
 *
 * Palantir Foundry-style версионирование транзакций для объектов Integram.
 * Записывает каждую операцию create/update/delete как неизменяемый лог транзакций,
 * обеспечивая полную историю версий, diff и откат.
 */

import {
  ValidationError,
  ObjectNotFoundError,
} from '@integram/common';

// ============================================================================
// Константы
// ============================================================================

const TRANSACTIONS_TABLE = '_transactions';

/** Типы операций */
const ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
};

/** Статусы транзакций (для группировки в begin/commit/rollback) */
const TX_STATUS = {
  PENDING: 'PENDING',
  COMMITTED: 'COMMITTED',
  ROLLED_BACK: 'ROLLED_BACK',
};

/**
 * SQL для создания таблицы транзакций.
 * Включает поле version для нумерации версий объекта и tx_group_id для группировки.
 */
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TRANSACTIONS_TABLE} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    agent_id VARCHAR(255) DEFAULT NULL,
    action ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL,
    target_id INT NOT NULL,
    target_type INT DEFAULT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    old_value JSON DEFAULT NULL,
    new_value JSON DEFAULT NULL,
    session_id VARCHAR(64) DEFAULT NULL,
    tx_group_id VARCHAR(64) DEFAULT NULL,
    tx_status ENUM('PENDING', 'COMMITTED', 'ROLLED_BACK') NOT NULL DEFAULT 'COMMITTED',
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_target_id (target_id),
    INDEX idx_target_version (target_id, version),
    INDEX idx_session_id (session_id),
    INDEX idx_tx_group (tx_group_id),
    INDEX idx_tx_status (tx_status),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// ============================================================================
// TransactionService Class
// ============================================================================

export class TransactionService {
  constructor(databaseService, options = {}) {
    this.db = databaseService;
    this.logger = options.logger || console;
    this._initializedDatabases = new Set();
    this._pendingTransactions = new Map();
  }

  async ensureTransactionTable(database) {
    if (this._initializedDatabases.has(database)) return;
    await this.db.execSql(CREATE_TABLE_SQL, [], 'TransactionService.ensureTable');
    this._initializedDatabases.add(database);
    this.logger.info('Таблица транзакций создана/проверена', { database });
  }

  // Начать групповую транзакцию
  beginTransaction(userId) {
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    this._pendingTransactions.set(txId, {
      userId, startedAt: new Date().toISOString(), operations: [], status: TX_STATUS.PENDING,
    });
    this.logger.info('Групповая транзакция начата', { txId, userId });
    return txId;
  }

  // Зафиксировать групповую транзакцию
  async commitTransaction(txId) {
    const pending = this._pendingTransactions.get(txId);
    if (!pending) throw new ValidationError(`Транзакция ${txId} не найдена`);
    if (pending.status !== TX_STATUS.PENDING) throw new ValidationError(`Транзакция ${txId} уже завершена`);

    for (const op of pending.operations) {
      const sql = `UPDATE ${TRANSACTIONS_TABLE} SET tx_status = ? WHERE tx_group_id = ? AND tx_status = ?`;
      await this.db.execSql(sql, [TX_STATUS.COMMITTED, txId, TX_STATUS.PENDING], 'TransactionService.commitTransaction');
    }
    pending.status = TX_STATUS.COMMITTED;
    const result = { txId, status: TX_STATUS.COMMITTED, operationCount: pending.operations.length, committedAt: new Date().toISOString() };
    this._pendingTransactions.delete(txId);
    this.logger.info('Групповая транзакция зафиксирована', result);
    return result;
  }

  // Откатить групповую транзакцию
  async rollbackTransaction(txId) {
    const pending = this._pendingTransactions.get(txId);
    if (!pending) throw new ValidationError(`Транзакция ${txId} не найдена`);
    if (pending.status !== TX_STATUS.PENDING) throw new ValidationError(`Транзакция ${txId} уже завершена`);

    const results = [];
    for (const op of [...pending.operations].reverse()) {
      try {
        await this._applyInverse(op.database, op);
        results.push({ transactionId: op.id, status: 'rolled_back' });
      } catch (error) {
        results.push({ transactionId: op.id, status: 'failed', error: error.message });
      }
    }
    if (pending.operations.length > 0) {
      const sql = `UPDATE ${TRANSACTIONS_TABLE} SET tx_status = ? WHERE tx_group_id = ?`;
      await this.db.execSql(sql, [TX_STATUS.ROLLED_BACK, txId], 'TransactionService.rollbackTransaction');
    }
    pending.status = TX_STATUS.ROLLED_BACK;
    this._pendingTransactions.delete(txId);
    this.logger.info('Групповая транзакция откачена', { txId });
    return { txId, status: TX_STATUS.ROLLED_BACK, operationCount: pending.operations.length, rolledBackAt: new Date().toISOString(), results };
  }

  // Записать транзакцию в лог
  async record(database, data) {
    await this.ensureTransactionTable(database);
    const { agentId, action, targetId, targetType, oldValue, newValue, sessionId, txGroupId, metadata } = data;

    if (!action || !Object.values(ACTIONS).includes(action)) {
      throw new ValidationError(`Недопустимая операция: ${action}. Допустимые: ${Object.values(ACTIONS).join(', ')}`);
    }
    if (targetId === undefined || targetId === null) {
      throw new ValidationError('targetId обязателен');
    }

    const version = await this._getNextVersion(database, targetId);
    const txStatus = txGroupId && this._pendingTransactions.has(txGroupId) ? TX_STATUS.PENDING : TX_STATUS.COMMITTED;

    const sql = `INSERT INTO ${TRANSACTIONS_TABLE} (agent_id, action, target_id, target_type, version, old_value, new_value, session_id, tx_group_id, tx_status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      agentId || null, action, targetId, targetType || null, version,
      oldValue !== undefined ? JSON.stringify(oldValue) : null,
      newValue !== undefined ? JSON.stringify(newValue) : null,
      sessionId || null, txGroupId || null, txStatus,
      metadata ? JSON.stringify(metadata) : null,
    ];

    const result = await this.db.execSql(sql, params, 'TransactionService.record');
    const recorded = { id: result.insertId, agentId: agentId || null, action, targetId, targetType: targetType || null, version, txGroupId: txGroupId || null, txStatus, sessionId: sessionId || null };
    this.logger.info('Транзакция записана', { database, transactionId: result.insertId, action, targetId, version });

    if (txGroupId && this._pendingTransactions.has(txGroupId)) {
      this._pendingTransactions.get(txGroupId).operations.push({ ...recorded, database, oldValue: oldValue || null, newValue: newValue || null });
    }
    return recorded;
  }

  // Получить историю версий объекта
  async getHistory(database, objectId, options = {}) {
    await this.ensureTransactionTable(database);
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    let sql = `SELECT id, agent_id, action, target_id, target_type, version, old_value, new_value, session_id, tx_group_id, tx_status, metadata, created_at FROM ${TRANSACTIONS_TABLE} WHERE target_id = ? AND tx_status = ?`;
    const params = [objectId, TX_STATUS.COMMITTED];
    if (options.action) { sql += ' AND action = ?'; params.push(options.action); }
    sql += ' ORDER BY version DESC, id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const { rows } = await this.db.execSql(sql, params, 'TransactionService.getHistory');
    return rows.map(row => this._mapRow(row));
  }

  // Получить конкретную версию объекта
  async getVersion(database, objectId, version) {
    await this.ensureTransactionTable(database);
    const sql = `SELECT id, agent_id, action, target_id, target_type, version, old_value, new_value, session_id, tx_group_id, tx_status, metadata, created_at FROM ${TRANSACTIONS_TABLE} WHERE target_id = ? AND version = ? AND tx_status = ? LIMIT 1`;
    const { rows } = await this.db.execSql(sql, [objectId, version, TX_STATUS.COMMITTED], 'TransactionService.getVersion');
    if (rows.length === 0) return null;
    const tx = this._mapRow(rows[0]);
    const state = tx.action === ACTIONS.DELETE ? tx.oldValue : (tx.newValue || tx.oldValue);
    return { objectId, version: tx.version, action: tx.action, state, transaction: tx };
  }

  // Diff между двумя версиями объекта (по номерам версий)
  async diffVersions(database, objectId, v1, v2) {
    await this.ensureTransactionTable(database);
    if (v1 === v2) throw new ValidationError('Версии должны отличаться');
    const [fromV, toV] = v1 < v2 ? [v1, v2] : [v2, v1];

    const sql = `SELECT id, agent_id, action, target_id, target_type, version, old_value, new_value, session_id, tx_group_id, tx_status, metadata, created_at FROM ${TRANSACTIONS_TABLE} WHERE target_id = ? AND version IN (?, ?) AND tx_status = ? ORDER BY version ASC`;
    const { rows } = await this.db.execSql(sql, [objectId, fromV, toV, TX_STATUS.COMMITTED], 'TransactionService.diffVersions.endpoints');
    if (rows.length < 2) throw new ValidationError('Не удалось найти обе версии объекта');

    const fromTx = this._mapRow(rows[0]);
    const toTx = this._mapRow(rows[1]);

    const betweenSql = `SELECT id, agent_id, action, target_id, target_type, version, old_value, new_value, session_id, tx_group_id, tx_status, metadata, created_at FROM ${TRANSACTIONS_TABLE} WHERE target_id = ? AND version > ? AND version < ? AND tx_status = ? ORDER BY version ASC`;
    const { rows: betweenRows } = await this.db.execSql(betweenSql, [objectId, fromV, toV, TX_STATUS.COMMITTED], 'TransactionService.diffVersions.between');

    const fromState = fromTx.action === ACTIONS.DELETE ? fromTx.oldValue : (fromTx.newValue || fromTx.oldValue);
    const toState = toTx.action === ACTIONS.DELETE ? toTx.oldValue : (toTx.newValue || toTx.oldValue);
    const changes = this._computeChanges(fromState, toState);

    return {
      objectId,
      fromVersion: { version: fromTx.version, transactionId: fromTx.id, action: fromTx.action, timestamp: fromTx.createdAt, state: fromState },
      toVersion: { version: toTx.version, transactionId: toTx.id, action: toTx.action, timestamp: toTx.createdAt, state: toState },
      intermediateSteps: betweenRows.map(row => this._mapRow(row)),
      changes,
    };
  }

  // Список транзакций с фильтрами
  async getTransactions(database, filters = {}) {
    await this.ensureTransactionTable(database);
    const conditions = ['tx_status = ?'];
    const params = [TX_STATUS.COMMITTED];
    if (filters.action) { conditions.push('action = ?'); params.push(filters.action); }
    if (filters.agentId) { conditions.push('agent_id = ?'); params.push(filters.agentId); }
    if (filters.sessionId) { conditions.push('session_id = ?'); params.push(filters.sessionId); }
    if (filters.targetType) { conditions.push('target_type = ?'); params.push(filters.targetType); }
    if (filters.since) { conditions.push('created_at >= ?'); params.push(filters.since); }
    if (filters.until) { conditions.push('created_at <= ?'); params.push(filters.until); }
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countSql = `SELECT COUNT(*) as total FROM ${TRANSACTIONS_TABLE} ${whereClause}`;
    const { rows: countRows } = await this.db.execSql(countSql, [...params], 'TransactionService.getTransactions.count');
    const total = countRows[0]?.total || 0;
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    const dataSql = `SELECT id, agent_id, action, target_id, target_type, version, old_value, new_value, session_id, tx_group_id, tx_status, metadata, created_at FROM ${TRANSACTIONS_TABLE} ${whereClause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
    const { rows } = await this.db.execSql(dataSql, [...params, limit, offset], 'TransactionService.getTransactions');
    return { transactions: rows.map(row => this._mapRow(row)), total };
  }

  // Получить транзакцию по ID
  async getTransactionById(database, transactionId) {
    await this.ensureTransactionTable(database);
    const sql = `SELECT id, agent_id, action, target_id, target_type, version, old_value, new_value, session_id, tx_group_id, tx_status, metadata, created_at FROM ${TRANSACTIONS_TABLE} WHERE id = ?`;
    const { rows } = await this.db.execSql(sql, [transactionId], 'TransactionService.getTransactionById');
    if (rows.length === 0) return null;
    return this._mapRow(rows[0]);
  }

  // Откатить одну транзакцию по ID
  async rollback(database, transactionId, context = {}) {
    await this.ensureTransactionTable(database);
    const tx = await this.getTransactionById(database, transactionId);
    if (!tx) throw new ObjectNotFoundError(transactionId);
    const rollbackResult = await this._applyInverse(database, tx);
    await this.record(database, {
      agentId: context.agentId || `rollback:${tx.agentId}`,
      action: rollbackResult.action, targetId: tx.targetId, targetType: tx.targetType,
      oldValue: rollbackResult.oldValue, newValue: rollbackResult.newValue,
      sessionId: context.sessionId || null,
      metadata: { rollbackOf: transactionId, originalAction: tx.action },
    });
    this.logger.info('Транзакция откачена', { database, transactionId, originalAction: tx.action });
    return { rolledBack: transactionId, originalAction: tx.action, targetId: tx.targetId, inverseAction: rollbackResult.action };
  }

  // Откатить все транзакции сессии
  async rollbackSession(database, sessionId, context = {}) {
    await this.ensureTransactionTable(database);
    const sql = `SELECT id, agent_id, action, target_id, target_type, version, old_value, new_value, session_id, tx_group_id, tx_status, metadata, created_at FROM ${TRANSACTIONS_TABLE} WHERE session_id = ? AND tx_status = ? ORDER BY id DESC`;
    const { rows } = await this.db.execSql(sql, [sessionId, TX_STATUS.COMMITTED], 'TransactionService.rollbackSession');
    if (rows.length === 0) throw new ValidationError(`Транзакции для сессии не найдены: ${sessionId}`);
    const rollbackSessionId = `rollback:${sessionId}:${Date.now()}`;
    const results = [];
    for (const row of rows) {
      const tx = this._mapRow(row);
      try {
        const rollbackResult = await this._applyInverse(database, tx);
        await this.record(database, {
          agentId: context.agentId || `rollback:${tx.agentId}`, action: rollbackResult.action,
          targetId: tx.targetId, targetType: tx.targetType, oldValue: rollbackResult.oldValue,
          newValue: rollbackResult.newValue, sessionId: rollbackSessionId,
          metadata: { rollbackOf: tx.id, originalAction: tx.action, originalSessionId: sessionId },
        });
        results.push({ transactionId: tx.id, status: 'rolled_back' });
      } catch (error) {
        results.push({ transactionId: tx.id, status: 'failed', error: error.message });
      }
    }
    this.logger.info('Сессия откачена', { database, sessionId, totalTransactions: rows.length, rolledBack: results.filter(r => r.status === 'rolled_back').length });
    return { sessionId, rollbackSessionId, total: rows.length, results };
  }

  // Приватные методы
  async _getNextVersion(database, targetId) {
    const sql = `SELECT MAX(version) as max_version FROM ${TRANSACTIONS_TABLE} WHERE target_id = ?`;
    const { rows } = await this.db.execSql(sql, [targetId], 'TransactionService._getNextVersion');
    return (rows[0]?.max_version || 0) + 1;
  }

  _mapRow(row) {
    return {
      id: row.id, agentId: row.agent_id, action: row.action, targetId: row.target_id,
      targetType: row.target_type, version: row.version, oldValue: this._parseJson(row.old_value),
      newValue: this._parseJson(row.new_value), sessionId: row.session_id,
      txGroupId: row.tx_group_id, txStatus: row.tx_status, metadata: this._parseJson(row.metadata),
      createdAt: row.created_at,
    };
  }

  _parseJson(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return value; }
  }

  async _applyInverse(database, tx) {
    switch (tx.action) {
      case ACTIONS.CREATE: {
        const currentObj = await this._fetchObject(database, tx.targetId);
        await this.db.delete(database, tx.targetId, 'TransactionService.rollback.delete');
        return { action: ACTIONS.DELETE, oldValue: currentObj, newValue: null };
      }
      case ACTIONS.UPDATE: {
        const currentObj = await this._fetchObject(database, tx.targetId);
        if (tx.oldValue && tx.oldValue.value !== undefined) {
          await this.db.updateVal(database, tx.targetId, String(tx.oldValue.value), 'TransactionService.rollback.update');
        }
        return { action: ACTIONS.UPDATE, oldValue: currentObj, newValue: tx.oldValue };
      }
      case ACTIONS.DELETE: {
        if (!tx.oldValue) throw new ValidationError('Невозможно откатить DELETE без снимка старого значения');
        const old = tx.oldValue;
        const id = await this.db.insert(database, old.parentId || 0, old.order || 1, old.typeId || 0, String(old.value || ''), 'TransactionService.rollback.insert');
        return { action: ACTIONS.CREATE, oldValue: null, newValue: { ...old, id } };
      }
      default: throw new ValidationError(`Неизвестная операция: ${tx.action}`);
    }
  }

  async _fetchObject(database, objectId) {
    const query = this.db.query(database).select('id', 'val', 'up', 't', 'ord').whereId(objectId);
    const { rows } = await this.db.executeQuery(query, 'TransactionService.fetchObject');
    if (rows.length === 0) return null;
    return { id: rows[0].id, value: rows[0].val, parentId: rows[0].up, typeId: rows[0].t, order: rows[0].ord };
  }

  _computeChanges(fromState, toState) {
    const changes = [];
    const allKeys = new Set([...Object.keys(fromState || {}), ...Object.keys(toState || {})]);
    for (const key of allKeys) {
      const fromVal = fromState?.[key];
      const toVal = toState?.[key];
      if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
        changes.push({ field: key, from: fromVal ?? null, to: toVal ?? null });
      }
    }
    return changes;
  }
}

export { ACTIONS as TRANSACTION_ACTIONS, TX_STATUS };
export default TransactionService;
