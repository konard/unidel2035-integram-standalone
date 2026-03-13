/**
 * @integram/core-data-service - Services Index
 * Экспорт всех сервисов.
 */

<<<<<<< HEAD
export { ObjectService } from './ObjectService.js';
export { QueryService } from './QueryService.js';
export { TypeService } from './TypeService.js';
export { ValidationService } from './ValidationService.js';
export { AuditService } from './AuditService.js';
export { OntologyService } from './OntologyService.js';
export { BatchService } from './BatchService.js';

=======
>>>>>>> origin/master
import { ObjectService } from './ObjectService.js';
import { QueryService } from './QueryService.js';
import { SchemaService } from './SchemaService.js';
import { TypeService } from './TypeService.js';
import { ValidationService } from './ValidationService.js';
import { TransactionService } from './TransactionService.js';
import { AuditService } from './AuditService.js';
import { OntologyService } from './OntologyService.js';
import { BatchService } from './BatchService.js';
<<<<<<< HEAD

export default {
  ObjectService,
  QueryService,
  TypeService,
  ValidationService,
  AuditService,
  OntologyService,
  BatchService,
=======

export { ObjectService } from './ObjectService.js';
export { QueryService } from './QueryService.js';
export { SchemaService } from './SchemaService.js';
export { TypeService } from './TypeService.js';
export { ValidationService } from './ValidationService.js';
export { TransactionService, TRANSACTION_ACTIONS, TX_STATUS } from './TransactionService.js';
export { AuditService, AUDIT_ACTIONS } from './AuditService.js';
export { OntologyService } from './OntologyService.js';
export { BatchService } from './BatchService.js';

export default {
  ObjectService, QueryService, SchemaService, TypeService, ValidationService,
  TransactionService, AuditService, OntologyService, BatchService,
>>>>>>> origin/master
};
