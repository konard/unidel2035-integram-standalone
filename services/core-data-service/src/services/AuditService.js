/**
 * @integram/core-data-service - AuditService
 * Сервис аудита и governance (#186).
 */

const AUDIT_ACTIONS = { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', READ: 'read', LOGIN: 'login', LOGOUT: 'logout', EXPORT: 'export', IMPORT: 'import', BATCH: 'batch' };

export class AuditService {
  constructor(databaseService, options = {}) {
    this.db = databaseService;
    this.logger = options.logger || console;
    this._tableCreated = new Set();
  }

  async _ensureAuditTable(db) {
    if (this._tableCreated.has(db)) return;
    try {
      await this.db.execSql(db, `CREATE TABLE IF NOT EXISTS _audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id VARCHAR(255), action VARCHAR(50) NOT NULL, object_id INT, object_type VARCHAR(255),
        details JSON, ip_address VARCHAR(45), session_id VARCHAR(255),
        INDEX idx_timestamp (timestamp), INDEX idx_user_id (user_id),
        INDEX idx_object_id (object_id), INDEX idx_action (action)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    } catch (e) { /* already exists */ }
    this._tableCreated.add(db);
  }

  async logAction(db, userId, action, objectId = null, details = {}) {
    await this._ensureAuditTable(db);
    const result = await this.db.execSql(db,
      `INSERT INTO _audit_log (user_id, action, object_id, object_type, details, ip_address, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId || 'system', action, objectId, details.objectType || null, JSON.stringify(details), details.ipAddress || null, details.sessionId || null]
    );
    return { id: result.insertId, userId, action, objectId, timestamp: new Date().toISOString() };
  }

  async getAuditLog(db, filters = {}) {
    await this._ensureAuditTable(db);
    const conds = [], params = [];
    if (filters.action) { conds.push('action = ?'); params.push(filters.action); }
    if (filters.userId) { conds.push('user_id = ?'); params.push(filters.userId); }
    if (filters.since) { conds.push('timestamp >= ?'); params.push(filters.since); }
    if (filters.until) { conds.push('timestamp <= ?'); params.push(filters.until); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const limit = filters.limit || 50, offset = filters.offset || 0;
    const countResult = await this.db.execSql(db, `SELECT COUNT(*) as total FROM _audit_log ${where}`, params);
    const entries = await this.db.execSql(db, `SELECT * FROM _audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    for (const e of entries) { if (e.details && typeof e.details === 'string') try { e.details = JSON.parse(e.details); } catch(x) {} }
    return { entries, total: countResult[0]?.total || 0 };
  }

  async getObjectAudit(db, objectId) {
    await this._ensureAuditTable(db);
    const entries = await this.db.execSql(db, `SELECT * FROM _audit_log WHERE object_id = ? ORDER BY timestamp DESC LIMIT 100`, [objectId]);
    for (const e of entries) { if (e.details && typeof e.details === 'string') try { e.details = JSON.parse(e.details); } catch(x) {} }
    return entries;
  }

  async getAccessLog(db, userId) {
    await this._ensureAuditTable(db);
    const entries = await this.db.execSql(db, `SELECT * FROM _audit_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT 100`, [userId]);
    for (const e of entries) { if (e.details && typeof e.details === 'string') try { e.details = JSON.parse(e.details); } catch(x) {} }
    return entries;
  }

  async generateComplianceReport(db, dateRange = {}) {
    await this._ensureAuditTable(db);
    const conds = [], params = [];
    if (dateRange.since) { conds.push('timestamp >= ?'); params.push(dateRange.since); }
    if (dateRange.until) { conds.push('timestamp <= ?'); params.push(dateRange.until); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const totalResult = await this.db.execSql(db, `SELECT COUNT(*) as total FROM _audit_log ${where}`, params);
    const byAction = await this.db.execSql(db, `SELECT action, COUNT(*) as count FROM _audit_log ${where} GROUP BY action ORDER BY count DESC`, params);
    const byUser = await this.db.execSql(db, `SELECT user_id, COUNT(*) as count FROM _audit_log ${where} GROUP BY user_id ORDER BY count DESC LIMIT 20`, params);
    const byDay = await this.db.execSql(db, `SELECT DATE(timestamp) as date, COUNT(*) as count FROM _audit_log ${where} GROUP BY DATE(timestamp) ORDER BY date DESC LIMIT 30`, params);
    return {
      generatedAt: new Date().toISOString(), database: db,
      period: { since: dateRange.since || 'начало', until: dateRange.until || 'сейчас' },
      summary: { totalActions: totalResult[0]?.total || 0, uniqueActions: byAction.length, activeUsers: byUser.length },
      byAction, byUser, byDay,
    };
  }
}

export { AUDIT_ACTIONS };
export default AuditService;
