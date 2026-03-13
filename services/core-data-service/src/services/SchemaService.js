/**
 * @integram/core-data-service - SchemaService
 *
 * Provides schema introspection for Integram databases.
 * Returns complete type definitions, requisites, relationships, and sample data.
 */

import {
  BASIC_TYPES,
} from '@integram/common';

import { ValidationService } from './ValidationService.js';

// ============================================================================
// SchemaService Class
// ============================================================================

/**
 * Service for introspecting Integram database schemas.
 * Aggregates type, requisite, relationship, and sample data.
 */
export class SchemaService {
  /**
   * Create a new schema service.
   *
   * @param {Object} databaseService - Database service instance
   * @param {Object} services - Related service instances
   * @param {TypeService} services.typeService - Type service
   * @param {QueryService} services.queryService - Query service
   * @param {ObjectService} services.objectService - Object service
   * @param {Object} [options] - Service options
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.cacheTimeout] - Cache TTL in ms (default: 60000)
   */
  constructor(databaseService, services, options = {}) {
    this.db = databaseService;
    this.typeService = services.typeService;
    this.queryService = services.queryService;
    this.objectService = services.objectService;
    this.logger = options.logger || console;
    this.validation = options.validationService || new ValidationService(options);

    // Schema cache with 60-second TTL
    this._cache = new Map();
    this._cacheTimeout = options.cacheTimeout || 60000;
  }

  // ============================================================================
  // Cache Helpers
  // ============================================================================

  /**
   * Get value from cache if still valid.
   *
   * @param {string} key - Cache key
   * @returns {*|null} Cached value or null
   */
  _getCached(key) {
    if (this._cache.has(key)) {
      const entry = this._cache.get(key);
      if (Date.now() - entry.timestamp < this._cacheTimeout) {
        return entry.data;
      }
      this._cache.delete(key);
    }
    return null;
  }

  /**
   * Set value in cache.
   *
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   */
  _setCache(key, data) {
    this._cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get full database schema: all types with requisites, counts, and relationships.
   *
   * @param {string} database - Database name
   * @returns {Promise<Object>} Full schema object
   */
  async getFullSchema(database) {
    const db = this.validation.validateDatabase(database);
    const cacheKey = `fullSchema:${db}`;

    const cached = this._getCached(cacheKey);
    if (cached) {
      return cached;
    }

    // Get all types
    const types = await this.typeService.getAllTypes(database, { includeSystem: false });

    // Get object counts grouped by type
    const typeCounts = await this.queryService.countByType(database);
    const countMap = {};
    let totalObjects = 0;
    for (const entry of typeCounts) {
      countMap[entry.t] = entry.count;
      totalObjects += entry.count;
    }

    // Build type details with requisites
    const typeDetails = [];
    const allRelationships = [];

    for (const type of types) {
      const requisites = await this.typeService.getRequisites(database, type.id);

      const mappedRequisites = requisites.map(req => {
        const isRef = !this.typeService.isBasicType(req.typeId) && req.typeId !== type.id;

        // Collect relationships
        if (isRef) {
          allRelationships.push({
            fromType: type.id,
            fromName: type.name,
            toType: req.typeId,
            toName: null, // resolved below
            requisiteId: req.id,
            alias: req.alias || req.name,
          });
        }

        return {
          id: req.id,
          alias: req.alias || req.name,
          type: req.typeId,
          baseTypeName: BASIC_TYPES[req.typeId] || null,
          refType: isRef ? req.typeId : null,
          required: req.required,
          multi: req.multi,
        };
      });

      typeDetails.push({
        id: type.id,
        name: type.name,
        baseType: type.baseType,
        baseTypeName: BASIC_TYPES[type.baseType] || null,
        count: countMap[type.id] || 0,
        requisites: mappedRequisites,
      });
    }

    // Resolve relationship target names
    const typeNameMap = {};
    for (const t of typeDetails) {
      typeNameMap[t.id] = t.name;
    }
    for (const rel of allRelationships) {
      rel.toName = typeNameMap[rel.toType] || null;
    }

    const result = {
      types: typeDetails,
      relationships: allRelationships,
      stats: {
        totalTypes: typeDetails.length,
        totalObjects,
      },
    };

    this._setCache(cacheKey, result);

    return result;
  }

  /**
   * Get schema for a single type with full detail and sample data.
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @returns {Promise<Object>} Type schema with sample
   */
  async getTypeSchema(database, typeId) {
    const db = this.validation.validateDatabase(database);
    const tid = this.validation.validateTypeId(typeId);
    const cacheKey = `typeSchema:${db}:${tid}`;

    const cached = this._getCached(cacheKey);
    if (cached) {
      return cached;
    }

    // Get type info
    const type = await this.typeService.getType(database, tid);
    if (!type) {
      return null;
    }

    // Get requisites
    const requisites = await this.typeService.getRequisites(database, tid);

    // Get object count
    const count = await this.typeService.getObjectCount(database, tid);

    // Get sample data
    const sample = await this.getSample(database, tid, 5);

    // Build relationships for this type
    const relationships = [];
    const mappedRequisites = requisites.map(req => {
      const isRef = !this.typeService.isBasicType(req.typeId) && req.typeId !== tid;

      if (isRef) {
        relationships.push({
          fromType: tid,
          fromName: type.name,
          toType: req.typeId,
          toName: null,
          requisiteId: req.id,
          alias: req.alias || req.name,
        });
      }

      return {
        id: req.id,
        alias: req.alias || req.name,
        type: req.typeId,
        baseTypeName: BASIC_TYPES[req.typeId] || null,
        refType: isRef ? req.typeId : null,
        required: req.required,
        multi: req.multi,
      };
    });

    // Resolve target type names in relationships
    for (const rel of relationships) {
      const targetType = await this.typeService.getType(database, rel.toType);
      rel.toName = targetType ? targetType.name : null;
    }

    const result = {
      id: type.id,
      name: type.name,
      baseType: type.baseType,
      baseTypeName: BASIC_TYPES[type.baseType] || null,
      count,
      requisites: mappedRequisites,
      relationships,
      sample,
    };

    this._setCache(cacheKey, result);

    return result;
  }

  /**
   * Get all reference relationships between types.
   *
   * @param {string} database - Database name
   * @returns {Promise<Array>} Array of relationship objects
   */
  async getRelationships(database) {
    const db = this.validation.validateDatabase(database);
    const cacheKey = `relationships:${db}`;

    const cached = this._getCached(cacheKey);
    if (cached) {
      return cached;
    }

    const types = await this.typeService.getAllTypes(database, { includeSystem: false });

    // Build name map
    const typeNameMap = {};
    for (const t of types) {
      typeNameMap[t.id] = t.name;
    }

    const relationships = [];

    for (const type of types) {
      const requisites = await this.typeService.getRequisites(database, type.id);

      for (const req of requisites) {
        const isRef = !this.typeService.isBasicType(req.typeId) && req.typeId !== type.id;
        if (isRef) {
          relationships.push({
            fromType: type.id,
            fromName: type.name,
            toType: req.typeId,
            toName: typeNameMap[req.typeId] || null,
            requisiteId: req.id,
            alias: req.alias || req.name,
          });
        }
      }
    }

    this._setCache(cacheKey, relationships);

    return relationships;
  }

  /**
   * Get sample rows for a type with requisite values.
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @param {number} [limit=5] - Number of sample rows
   * @returns {Promise<Array>} Sample objects with requisites
   */
  async getSample(database, typeId, limit = 5) {
    const db = this.validation.validateDatabase(database);
    const tid = this.validation.validateTypeId(typeId);

    const objects = await this.queryService.queryObjects(database, {
      typeId: tid,
      limit,
      orderBy: 'id',
      sortDir: 'ASC',
    });

    if (objects.length === 0) {
      return [];
    }

    // Get requisites for each sample object
    const samples = [];
    for (const obj of objects) {
      const requisites = await this.objectService.getRequisites(database, obj.id);
      samples.push({
        id: obj.id,
        value: obj.val,
        requisites,
      });
    }

    return samples;
  }
}

// ============================================================================
// Export
// ============================================================================

export default SchemaService;
