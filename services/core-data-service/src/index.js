/**
 * @integram/core-data-service - Main Entry Point
 *
 * Core data service for Integram - handles CRUD operations, queries,
 * and data management with full PHP compatibility.
 */

import express from 'express';

// ============================================================================
// Re-export Services
// ============================================================================

export * from './services/index.js';
export * from './middleware/LegacyFormatTransformer.js';

// ============================================================================
// Import Services
// ============================================================================

import { ObjectService } from './services/ObjectService.js';
import { QueryService } from './services/QueryService.js';
import { SchemaService } from './services/SchemaService.js';
import { TypeService } from './services/TypeService.js';
import { ValidationService } from './services/ValidationService.js';
import { TransactionService } from './services/TransactionService.js';
import { AuditService } from './services/AuditService.js';
import { OntologyService } from './services/OntologyService.js';
import { BatchService } from './services/BatchService.js';
import { EventService } from './services/EventService.js';
import { SearchService } from './services/SearchService.js';import { LegacyFormatTransformer } from './middleware/LegacyFormatTransformer.js';
import { createV1Routes } from './routes/v1/index.js';
import { createV2Routes } from './routes/v2/index.js';
import { createLegacyActionRoutes } from './routes/legacy/index.js';

// ============================================================================
// Package Information
// ============================================================================

export const PACKAGE_NAME = '@integram/core-data-service';
export const PACKAGE_VERSION = '1.0.0';

// ============================================================================
// CoreDataService Class
// ============================================================================

/**
 * Core data service that coordinates all data operations.
 */
export class CoreDataService {
  /**
   * @param {Object} databaseService - Database service instance
   * @param {Object} [options] - Service options
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(databaseService, options = {}) {
    this.logger = options.logger || console;

    const validationService = new ValidationService(options);

    this.objectService = new ObjectService(databaseService, {
      ...options,
      validationService,
    });

    this.queryService = new QueryService(databaseService, {
      ...options,
      validationService,
    });

    this.typeService = new TypeService(databaseService, {
      ...options,
      validationService,
    });

    this.schemaService = new SchemaService(databaseService, {
      typeService: this.typeService,
      queryService: this.queryService,
      objectService: this.objectService,
    }, {
      ...options,
      validationService,
    });

    this.transactionService = new TransactionService(databaseService, options);

    this.auditService = new AuditService(databaseService, options);

    this.ontologyService = new OntologyService(databaseService, {
      typeService: this.typeService,
      objectService: this.objectService,
    }, options);

    this.batchService = new BatchService(databaseService, {
      objectService: this.objectService,
      typeService: this.typeService,
      queryService: this.queryService,
    }, options);

// Event Streaming (#187)
    this.eventService = new EventService(databaseService, options);
// Agent Search API (#188) — полнотекстовый, NL-поиск, фильтрация, агрегация
    this.searchService = new SearchService(databaseService, {
      queryService: this.queryService,
      typeService: this.typeService,
      objectService: this.objectService,
    }, {
      ...options,
      validationService,
    });
    this.validationService = validationService;
    this.transformer = new LegacyFormatTransformer(options);
  }

  getServices() {
    return {
      objectService: this.objectService,
      queryService: this.queryService,
      schemaService: this.schemaService,
      typeService: this.typeService,
      validationService: this.validationService,
      transactionService: this.transactionService,
      auditService: this.auditService,
      ontologyService: this.ontologyService,
      batchService: this.batchService,
eventService: this.eventService,
searchService: this.searchService,    };
  }

  createRouter(options = {}) {
    const router = express.Router();
    const services = this.getServices();
    const routeOptions = { logger: this.logger };

    if (options.enableV1 !== false) {
      router.use('/v1', createV1Routes(services, routeOptions));
    }
    if (options.enableV2 !== false) {
      router.use('/v2', createV2Routes(services, routeOptions));
    }
    if (options.enableLegacy !== false) {
      router.use('/', createLegacyActionRoutes(services, routeOptions));
    }

    return router;
  }

  async create(database, data) { return this.objectService.create(database, data); }
  async getById(database, id, options) { return this.objectService.getById(database, id, options); }
  async update(database, id, data) { return this.objectService.update(database, id, data); }
  async delete(database, id, options) { return this.objectService.delete(database, id, options); }
  async query(database, filters) { return this.queryService.queryObjects(database, filters); }
  async search(database, term, options) { return this.queryService.searchObjects(database, term, options); }
  async count(database, filters) { return this.queryService.countObjects(database, filters); }
  async getTypes(database, options) { return this.typeService.getAllTypes(database, options); }
  async getSchema(database, typeId) { return this.typeService.getSchema(database, typeId); }
  async createType(database, data) { return this.typeService.createType(database, data); }
}

export function createCoreDataService(databaseService, options = {}) {
  return new CoreDataService(databaseService, options);
}

export function createApp(databaseService, options = {}) {
  const app = express();
  const coreDataService = createCoreDataService(databaseService, options);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', coreDataService.createRouter(options));

  app.use((err, req, res, next) => {
    const logger = options.logger || console;
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      },
    });
  });

  return app;
}

export default {
CoreDataService,
  ObjectService,
  QueryService,
  SchemaService,
  TypeService,
  ValidationService,
  TransactionService,
  AuditService,
  OntologyService,
  BatchService,
  EventService,
  LegacyFormatTransformer,
  createCoreDataService,
  createApp,
  createV1Routes,
  createV2Routes,
  createLegacyActionRoutes,
  PACKAGE_NAME,
  PACKAGE_VERSION,
CoreDataService, ObjectService, QueryService, SchemaService, TypeService,
  ValidationService, TransactionService, AuditService, OntologyService,
  BatchService, SearchService, LegacyFormatTransformer,
  createCoreDataService, createApp, createV1Routes, createV2Routes,
  createLegacyActionRoutes, PACKAGE_NAME, PACKAGE_VERSION,};
