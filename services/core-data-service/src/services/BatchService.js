/**
 * @integram/core-data-service - BatchService
 * Пакетные операции (#184).
 */

export class BatchService {
  constructor(databaseService, deps = {}, options = {}) {
    this.db = databaseService;
    this.objectService = deps.objectService;
    this.typeService = deps.typeService;
    this.queryService = deps.queryService;
    this.logger = options.logger || console;
  }

  async executeBatch(db, operations) {
    if (!Array.isArray(operations) || operations.length === 0) throw new Error('operations должен быть непустым массивом');
    const results = [], rollbackActions = [];
    try {
      for (let i = 0; i < operations.length; i++) {
        const r = await this._executeOp(db, operations[i], i);
        results.push(r); rollbackActions.push(r.rollback);
      }
      return { success: true, results: results.map(r => r.result), count: results.length };
    } catch (error) {
      this.logger.warn('Пакетная операция не удалась, откат...', { error: error.message });
      for (let j = rollbackActions.length - 1; j >= 0; j--) { try { if (rollbackActions[j]) await rollbackActions[j](); } catch (e) { this.logger.error('Ошибка отката', { index: j, error: e.message }); } }
      throw new Error(`Пакетная операция не удалась на шаге ${results.length}: ${error.message}`);
    }
  }

  async importBatch(db, typeId, records) {
    if (!Array.isArray(records) || records.length === 0) throw new Error('records должен быть непустым массивом');
    const type = await this.typeService.getType(db, typeId);
    if (!type) throw new Error(`Тип с ID ${typeId} не найден`);
    const imported = [], errors = [];
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      try {
        const value = rec.value || rec.name || rec.val;
        if (!value) { errors.push({ index: i, error: 'Отсутствует значение (value)' }); continue; }
        const created = await this.objectService.create(db, { value, typeId, parentId: rec.parentId || 0, requisites: rec.requisites });
        imported.push({ index: i, id: created.id, value });
      } catch (e) { errors.push({ index: i, error: e.message }); }
    }
    return { imported: imported.length, total: records.length, ids: imported.map(r => r.id), details: imported, errors };
  }

  async exportBatch(db, typeId, format = 'json') {
    const type = await this.typeService.getType(db, typeId);
    if (!type) throw new Error(`Тип с ID ${typeId} не найден`);
    const objects = await this.queryService.queryObjects(db, { typeId, limit: 10000 });
    let schema = null; try { schema = await this.typeService.getSchema(db, typeId); } catch (e) {}
    const data = { type: { id: typeId, name: type.val }, exportedAt: new Date().toISOString(), count: objects.length, objects };
    if (format === 'csv') return this._toCSV(objects, schema);
    return data;
  }

  async _executeOp(db, op, idx) {
    const action = (op.action || '').toLowerCase();
    switch (action) {
      case 'create': {
        if (!op.data?.value && !op.data?.val) throw new Error(`Операция ${idx}: value обязателен`);
        const c = await this.objectService.create(db, { value: op.data.value || op.data.val, typeId: op.type || op.data.typeId, parentId: op.data.parentId || 0, requisites: op.data.requisites });
        return { result: { action: 'create', id: c.id, success: true }, rollback: async () => { await this.objectService.delete(db, c.id); } };
      }
      case 'update': {
        if (!op.id) throw new Error(`Операция ${idx}: id обязателен`);
        const old = await this.objectService.getById(db, op.id);
        await this.objectService.update(db, op.id, op.data || {});
        return { result: { action: 'update', id: op.id, success: true }, rollback: async () => { if (old) await this.objectService.update(db, op.id, { value: old.val, typeId: old.t, parentId: old.up }); } };
      }
      case 'delete': {
        if (!op.id) throw new Error(`Операция ${idx}: id обязателен`);
        const obj = await this.objectService.getById(db, op.id);
        await this.objectService.delete(db, op.id);
        return { result: { action: 'delete', id: op.id, success: true }, rollback: async () => { if (obj) await this.objectService.create(db, { value: obj.val, typeId: obj.t, parentId: obj.up }); } };
      }
      default: throw new Error(`Операция ${idx}: неизвестное действие "${action}"`);
    }
  }

  _toCSV(objects, schema) {
    if (!objects.length) return '';
    const reqNames = (schema?.requisites || []).map(r => r.val);
    const headers = ['id', 'value', 'type', 'parent', ...reqNames];
    const rows = [headers.join(',')];
    for (const obj of objects) rows.push([obj.id, this._csvEsc(obj.val || ''), obj.t || '', obj.up || '', ...reqNames.map(() => '')].join(','));
    return rows.join('\n');
  }

  _csvEsc(v) { if (v === null || v === undefined) return ''; const s = String(v); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s; }
}

export default BatchService;
