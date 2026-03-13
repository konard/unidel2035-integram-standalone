/**
 * @integram/core-data-service - OntologyService
 *
 * JSON-LD ontology export, knowledge graph construction,
 * relationship inference from reference columns,
 * and external class mapping.
 */

import { BASIC_TYPES } from '@integram/common';

export class OntologyService {
  constructor(databaseService, deps = {}, options = {}) {
    this.db = databaseService;
    this.typeService = deps.typeService || null;
    this.queryService = deps.queryService || null;
    this.logger = options.logger || console;
  }

  async exportOntology(database, options = {}) {
    const includeRequisites = options.includeRequisites !== false;
    const includeSystem = options.includeSystem === true;
    if (!this.typeService) throw new Error('TypeService is required for ontology export');

    const types = await this.typeService.getAllTypes(database, { includeSystem });
    const classes = [];

    for (const type of types) {
      const classNode = {
        '@id': `integram:${database}/${type.name}`,
        '@type': 'rdfs:Class',
        'rdfs:label': type.name,
        'integram:typeId': type.id,
        'integram:baseType': type.baseType,
      };
      if (includeRequisites) {
        const requisites = await this.typeService.getRequisites(database, type.id);
        classNode['integram:properties'] = requisites.map(req => ({
          '@id': `integram:${database}/${type.name}/${req.alias || req.name}`,
          '@type': 'rdf:Property',
          'rdfs:label': req.name,
          'integram:requisiteId': req.id,
          'integram:dataType': req.basicType,
          'integram:typeId': req.typeId,
          'integram:required': req.required,
          'integram:multi': req.multi,
          'integram:isReference': !(req.typeId in BASIC_TYPES),
          ...(req.alias ? { 'integram:alias': req.alias } : {}),
        }));
      }
      classes.push(classNode);
    }

    const mappings = await this._loadMappings(database);
    for (const cls of classes) {
      const typeId = cls['integram:typeId'];
      if (mappings[typeId]) cls['owl:equivalentClass'] = { '@id': mappings[typeId] };
    }

    return {
      '@context': {
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'owl': 'http://www.w3.org/2002/07/owl#',
        'integram': `https://integram.app/ontology/${database}/`,
      },
      '@graph': classes,
    };
  }

  async getKnowledgeGraph(database, options = {}) {
    if (!this.typeService) throw new Error('TypeService is required for knowledge graph');
    const types = await this.typeService.getAllTypes(database);
    const nodes = [];
    const edges = [];

    for (const type of types) {
      nodes.push({ id: `type:${type.id}`, label: type.name, kind: 'type', typeId: type.id });
      const requisites = await this.typeService.getRequisites(database, type.id);
      for (const req of requisites) {
        if (!(req.typeId in BASIC_TYPES)) {
          edges.push({
            source: `type:${type.id}`, target: `type:${req.typeId}`,
            label: req.alias || req.name, kind: 'reference',
            requisiteId: req.id, multi: req.multi,
          });
        }
      }
    }

    if (options.includeData && this.queryService) {
      const sampleLimit = options.sampleLimit || 10;
      for (const type of types) {
        try {
          const objects = await this.queryService.queryObjects(database, { typeId: type.id, limit: sampleLimit });
          for (const obj of objects) {
            nodes.push({ id: `obj:${obj.id}`, label: obj.val || obj.value || `#${obj.id}`, kind: 'object', typeId: type.id });
            edges.push({ source: `obj:${obj.id}`, target: `type:${type.id}`, label: 'instanceOf', kind: 'instanceOf' });
          }
        } catch (err) {
          this.logger.warn('Failed to sample objects', { typeId: type.id, error: err.message });
        }
      }
    }

    return { nodes, edges };
  }

  async inferRelationships(database) {
    if (!this.typeService) throw new Error('TypeService is required for relationship inference');
    const types = await this.typeService.getAllTypes(database);
    const relationships = [];
    const typeNameMap = {};
    for (const t of types) typeNameMap[t.id] = t.name;

    for (const type of types) {
      const requisites = await this.typeService.getRequisites(database, type.id);
      for (const req of requisites) {
        if (!(req.typeId in BASIC_TYPES)) {
          relationships.push({
            sourceTypeId: type.id, sourceTypeName: type.name,
            targetTypeId: req.typeId, targetTypeName: typeNameMap[req.typeId] || `Unknown(${req.typeId})`,
            requisiteId: req.id, requisiteName: req.alias || req.name,
            cardinality: req.multi ? 'many' : 'one', required: req.required,
          });
        }
      }
    }
    this.logger.info('Relationships inferred', { database, count: relationships.length });
    return relationships;
  }

  async mapTypeToClass(database, typeId, externalUri) {
    if (!typeId || !externalUri) throw new Error('typeId and externalUri are required');
    await this._ensureMappingTable(database);
    const sql = `INSERT INTO ${database}_ontology_mappings (type_id, external_uri) VALUES (?, ?) ON DUPLICATE KEY UPDATE external_uri = VALUES(external_uri)`;
    await this.db.execSql(sql, [typeId, externalUri], 'OntologyService.mapTypeToClass');
    this.logger.info('Type mapped to class', { database, typeId, externalUri });
  }

  async getMappings(database) {
    await this._ensureMappingTable(database);
    const sql = `SELECT type_id, external_uri, created_at FROM ${database}_ontology_mappings ORDER BY type_id`;
    const result = await this.db.execSql(sql, [], 'OntologyService.getMappings');
    return (result.rows || result).map(r => ({ typeId: r.type_id, externalUri: r.external_uri, createdAt: r.created_at }));
  }

  async _ensureMappingTable(database) {
    const sql = `CREATE TABLE IF NOT EXISTS ${database}_ontology_mappings (type_id INT NOT NULL, external_uri VARCHAR(512) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (type_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
    await this.db.execSql(sql, [], 'OntologyService._ensureMappingTable');
  }

  async _loadMappings(database) {
    try {
      await this._ensureMappingTable(database);
      const mappings = await this.getMappings(database);
      const lookup = {};
      for (const m of mappings) lookup[m.typeId] = m.externalUri;
      return lookup;
    } catch (err) {
      this.logger.warn('Could not load ontology mappings', { error: err.message });
      return {};
    }
  }
}

export default OntologyService;
