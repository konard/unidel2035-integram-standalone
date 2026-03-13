/**
 * @integram/core-data-service - AuditService
 *
 * Audit logging for all data operations, agent permissions CRUD,
 * and FinOps metrics aggregation.
 */

import { ValidationError } from '@integram/common';

export class AuditService {
  constructor(databaseService, options = {}) {
    this.db = databaseService;
    this.logger = options.logger || console;
  }

  async ensureAuditTable(database) {
    const auditTableSql = `
      CREATE TABLE IF NOT EXISTS ${database}_audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(64) NOT NULL,
        entity_type VARCHAR(64) DEFAULT NULL,
        entity_id INT DEFAULT NULL,
        agent_id VARCHAR(128) DEFAULT NULL,
        user_id VARCHAR(128) DEFAULT NULL,
        details JSON DEFAULT NULL,
        tokens_used INT DEFAULT 0,
        cost_usd DECIMAL(10,6) DEFAULT 0,
        duration_ms INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_action (action),
        INDEX idx_agent (agent_id),
        INDEX idx_entity (entity_type, entity_id),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;
    const permTableSql = `
      CREATE TABLE IF NOT EXISTS ${database}_agent_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        agent_id VARCHAR(128) NOT NULL,
        resource VARCHAR(128) NOT NULL,
        actions JSON NOT NULL,
        granted_by VARCHAR(128) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_agent_resource (agent_id, resource),
        INDEX idx_agent (agent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;
    await this.db.execSql(auditTableSql, [], 'AuditService.ensureAuditTable');
    await this.db.execSql(permTableSql, [], 'AuditService.ensurePermTable');
    this.logger.info('Audit tables ensured', { database });
  }

  async log(database, entry) {
    if (!entry.action) {
      throw new ValidationError('action is required for audit log');
    }
    const sql = `
      INSERT INTO ${database}_audit_log
        (action, entity_type, entity_id, agent_id, user_id, details, tokens_used, cost_usd, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      entry.action, entry.entityType || null, entry.entityId || null,
      entry.agentId || null, entry.userId || null,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.tokensUsed || 0, entry.costUsd || 0, entry.durationMs || 0,
    ];
    const result = await this.db.execSql(sql, params, 'AuditService.log');
    return result.insertId;
  }

  async getAuditLog(database, filters = {}) {
    const conditions = [];
    const params = [];
    if (filters.action) { conditions.push('action = ?'); params.push(filters.action); }
    if (filters.agentId) { conditions.push('agent_id = ?'); params.push(filters.agentId); }
    if (filters.entityType) { conditions.push('entity_type = ?'); params.push(filters.entityType); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    const sql = `SELECT * FROM ${database}_audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const result = await this.db.execSql(sql, params, 'AuditService.getAuditLog');
    return (result.rows || result).map(row => this._mapAuditRow(row));
  }

  async getAgentActivity(database, agentId, options = {}) {
    const days = options.days || 30;
    const sql = `
      SELECT action, COUNT(*) as count, SUM(tokens_used) as total_tokens,
        SUM(cost_usd) as total_cost, AVG(duration_ms) as avg_duration_ms,
        MAX(created_at) as last_activity
      FROM ${database}_audit_log
      WHERE agent_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY action ORDER BY count DESC
    `;
    const result = await this.db.execSql(sql, [agentId, days], 'AuditService.getAgentActivity');
    const rows = result.rows || result;
    return {
      agentId, period: `${days}d`,
      actions: rows.map(r => ({
        action: r.action, count: Number(r.count),
        totalTokens: Number(r.total_tokens || 0), totalCost: Number(r.total_cost || 0),
        avgDurationMs: Math.round(Number(r.avg_duration_ms || 0)), lastActivity: r.last_activity,
      })),
      totals: {
        actions: rows.reduce((s, r) => s + Number(r.count), 0),
        tokens: rows.reduce((s, r) => s + Number(r.total_tokens || 0), 0),
        cost: rows.reduce((s, r) => s + Number(r.total_cost || 0), 0),
      },
    };
  }

  async getFinOps(database, options = {}) {
    const days = options.days || 30;
    const sql = `
      SELECT agent_id, COUNT(*) as request_count, SUM(tokens_used) as total_tokens,
        SUM(cost_usd) as total_cost, AVG(duration_ms) as avg_latency_ms
      FROM ${database}_audit_log
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND agent_id IS NOT NULL
      GROUP BY agent_id ORDER BY total_cost DESC
    `;
    const result = await this.db.execSql(sql, [days], 'AuditService.getFinOps');
    const rows = result.rows || result;
    return {
      period: `${days}d`,
      agents: rows.map(r => ({
        agentId: r.agent_id, requests: Number(r.request_count),
        tokens: Number(r.total_tokens || 0), costUsd: Number(r.total_cost || 0),
        avgLatencyMs: Math.round(Number(r.avg_latency_ms || 0)),
      })),
      totals: {
        requests: rows.reduce((s, r) => s + Number(r.request_count), 0),
        tokens: rows.reduce((s, r) => s + Number(r.total_tokens || 0), 0),
        costUsd: rows.reduce((s, r) => s + Number(r.total_cost || 0), 0),
      },
    };
  }

  async setPermissions(database, agentId, resource, actions, grantedBy = null) {
    if (!agentId || !resource) throw new ValidationError('agentId and resource are required');
    if (!Array.isArray(actions)) throw new ValidationError('actions must be an array');
    const sql = `
      INSERT INTO ${database}_agent_permissions (agent_id, resource, actions, granted_by)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE actions = VALUES(actions), granted_by = VALUES(granted_by)
    `;
    await this.db.execSql(sql, [agentId, resource, JSON.stringify(actions), grantedBy], 'AuditService.setPermissions');
    this.logger.info('Permissions set', { database, agentId, resource, actions });
  }

  async getPermissions(database, agentId) {
    const sql = `SELECT * FROM ${database}_agent_permissions WHERE agent_id = ? ORDER BY resource`;
    const result = await this.db.execSql(sql, [agentId], 'AuditService.getPermissions');
    return (result.rows || result).map(r => ({
      id: r.id, agentId: r.agent_id, resource: r.resource,
      actions: typeof r.actions === 'string' ? JSON.parse(r.actions) : r.actions,
      grantedBy: r.granted_by, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async checkPermission(database, agentId, resource, action) {
    const sql = `SELECT actions FROM ${database}_agent_permissions WHERE agent_id = ? AND resource = ?`;
    const result = await this.db.execSql(sql, [agentId, resource], 'AuditService.checkPermission');
    const rows = result.rows || result;
    if (rows.length === 0) return false;
    const actions = typeof rows[0].actions === 'string' ? JSON.parse(rows[0].actions) : rows[0].actions;
    return Array.isArray(actions) && actions.includes(action);
  }

  _mapAuditRow(row) {
    return {
      id: row.id, action: row.action, entityType: row.entity_type, entityId: row.entity_id,
      agentId: row.agent_id, userId: row.user_id,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      tokensUsed: row.tokens_used, costUsd: Number(row.cost_usd),
      durationMs: row.duration_ms, createdAt: row.created_at,
    };
  }
}

export default AuditService;
