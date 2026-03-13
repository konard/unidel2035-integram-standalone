/**
 * @integram/core-data-service - Services Index
 *
 * Exports all core data services.
 */

export { ObjectService } from './ObjectService.js';
export { QueryService } from './QueryService.js';
export { TypeService } from './TypeService.js';
export { ValidationService } from './ValidationService.js';
export { AuditService } from './AuditService.js';
export { OntologyService } from './OntologyService.js';
export { BatchService } from './BatchService.js';

import { ObjectService } from './ObjectService.js';
import { QueryService } from './QueryService.js';
import { TypeService } from './TypeService.js';
import { ValidationService } from './ValidationService.js';
import { AuditService } from './AuditService.js';
import { OntologyService } from './OntologyService.js';
import { BatchService } from './BatchService.js';

export default {
  ObjectService,
  QueryService,
  TypeService,
  ValidationService,
  AuditService,
  OntologyService,
  BatchService,
};
