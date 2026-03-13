/**
 * @integram/core-data-service - Services Index
 *
 * Exports all core data services.
 */

export { ObjectService } from './ObjectService.js';
export { QueryService } from './QueryService.js';
export { SchemaService } from './SchemaService.js';
export { TypeService } from './TypeService.js';
export { ValidationService } from './ValidationService.js';
export { TransactionService, TRANSACTION_ACTIONS } from './TransactionService.js';
export { AuditService } from './AuditService.js';
export { OntologyService } from './OntologyService.js';

export default {
  ObjectService,
  QueryService,
  SchemaService,
  TypeService,
  ValidationService,
  TransactionService,
  AuditService,
  OntologyService,
};

import { ObjectService } from './ObjectService.js';
import { QueryService } from './QueryService.js';
import { SchemaService } from './SchemaService.js';
import { TypeService } from './TypeService.js';
import { ValidationService } from './ValidationService.js';
import { TransactionService } from './TransactionService.js';
import { AuditService } from './AuditService.js';
import { OntologyService } from './OntologyService.js';
