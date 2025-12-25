/**
 * Role Entity - Role-Sets Paradigm
 *
 * A Role represents a position/slot within a Prism that defines a contract
 * (attributes, invariants, operations). Roles define what it means to inhabit
 * a specific position in a conceptual space.
 *
 * Key Principles (from Role-Sets Theory):
 * 1. Roles belong to Prisms and define contracts for membership
 * 2. Roles specify attributes, invariants, and operations
 * 3. Things gain attributes by inhabiting roles (via witnesses)
 * 4. Roles can evolve by versioning
 *
 * @see /docs/conceptual-framework/role-sets-theory.md
 * @see /docs/conceptual-framework/plain-models-architecture.md
 */

import { v4 as uuidv4 } from 'uuid'

/**
 * @typedef {Object} AttributeDefinition
 * @property {'string'|'number'|'boolean'|'Date'|'Array'|'Object'} type - Attribute type
 * @property {boolean} required - Whether attribute is required
 * @property {any} [defaultValue] - Default value
 * @property {string} [computed] - Formula if derived/computed
 * @property {string} [validation] - Additional validation rule
 */

/**
 * @typedef {Object} OperationDefinition
 * @property {Object<string, string>} parameters - Parameter name -> type mapping
 * @property {string} returns - Return type
 * @property {string} [implementation] - Function body or reference
 */

/**
 * @typedef {Object} RelationshipDefinition
 * @property {string} targetPrism - Target prism name
 * @property {string} targetRole - Target role name
 * @property {'1:1'|'1:N'|'N:M'} cardinality - Relationship cardinality
 * @property {string} [inverseRelation] - Name of inverse relationship
 */

/**
 * @typedef {Object} RoleContract
 * @property {Object<string, AttributeDefinition>} attributes - Attribute definitions
 * @property {string[]} invariants - Contract invariants (predicates)
 * @property {Object<string, OperationDefinition>} operations - Available operations
 * @property {Object<string, RelationshipDefinition>} [relationships] - Relationships to other roles
 */

/**
 * @typedef {Object} Role
 * @property {string} id - Unique identifier (UUID)
 * @property {string} prismId - ID of the Prism this role belongs to
 * @property {string} name - Role name (must be unique within prism)
 * @property {string} description - Human-readable description
 * @property {number} version - Version number for evolution tracking
 * @property {RoleContract} contract - The role's contract
 * @property {Date} createdAt - Timestamp when Role was created
 * @property {Date} [updatedAt] - Timestamp when Role was last updated
 */

/**
 * @typedef {Object} RoleCreateOptions
 * @property {string} [id] - Optional custom ID (UUID will be generated if not provided)
 * @property {string} prismId - ID of the Prism (required)
 * @property {string} name - Role name (required)
 * @property {string} [description] - Role description
 * @property {number} [version] - Version number (defaults to 1)
 * @property {RoleContract} contract - The role's contract (required)
 */

/**
 * Creates a new Role
 *
 * @param {RoleCreateOptions} options - Creation options
 * @returns {Role} The created Role
 *
 * @example
 * const role = createRole({
 *   prismId: 'prism-floweditor',
 *   name: 'ProcessNode',
 *   description: 'A node that processes data',
 *   contract: {
 *     attributes: {
 *       label: { type: 'string', required: true },
 *       processingType: { type: 'string', required: true }
 *     },
 *     invariants: ['label.length > 0'],
 *     operations: {
 *       process: { parameters: { data: 'any' }, returns: 'any' }
 *     }
 *   }
 * })
 */
export function createRole(options) {
  if (!options || !options.prismId) {
    throw new Error('Role prismId is required')
  }

  if (!options.name) {
    throw new Error('Role name is required')
  }

  if (!options.contract) {
    throw new Error('Role contract is required')
  }

  const now = new Date()

  return {
    id: options.id || uuidv4(),
    prismId: options.prismId,
    name: options.name,
    description: options.description || '',
    version: options.version || 1,
    contract: {
      attributes: options.contract.attributes || {},
      invariants: options.contract.invariants || [],
      operations: options.contract.operations || {},
      relationships: options.contract.relationships || {}
    },
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now
  }
}

/**
 * Validates that an object is a valid Role
 *
 * @param {any} obj - Object to validate
 * @returns {boolean} True if valid Role
 */
export function isValidRole(obj) {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    return false
  }

  if (typeof obj.prismId !== 'string' || obj.prismId.length === 0) {
    return false
  }

  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    return false
  }

  if (typeof obj.version !== 'number' || obj.version < 1) {
    return false
  }

  if (!obj.contract || typeof obj.contract !== 'object') {
    return false
  }

  if (!obj.contract.attributes || typeof obj.contract.attributes !== 'object') {
    return false
  }

  if (!Array.isArray(obj.contract.invariants)) {
    return false
  }

  if (!obj.contract.operations || typeof obj.contract.operations !== 'object') {
    return false
  }

  if (!(obj.createdAt instanceof Date) || isNaN(obj.createdAt.getTime())) {
    return false
  }

  return true
}

/**
 * Updates a Role
 *
 * @param {Role} role - The Role to update
 * @param {Partial<RoleCreateOptions>} updates - Fields to update
 * @returns {Role} New Role with updates
 */
export function updateRole(role, updates) {
  if (!isValidRole(role)) {
    throw new Error('Invalid Role')
  }

  return {
    ...role,
    ...updates,
    contract: {
      ...role.contract,
      ...(updates.contract || {}),
      attributes: {
        ...role.contract.attributes,
        ...(updates.contract?.attributes || {})
      },
      operations: {
        ...role.contract.operations,
        ...(updates.contract?.operations || {})
      },
      relationships: {
        ...role.contract.relationships,
        ...(updates.contract?.relationships || {})
      }
    },
    updatedAt: new Date()
  }
}

/**
 * Creates a new version of a Role
 *
 * @param {Role} role - The Role to version
 * @param {Partial<RoleCreateOptions>} changes - Changes for new version
 * @returns {Role} New Role version
 */
export function versionRole(role, changes = {}) {
  if (!isValidRole(role)) {
    throw new Error('Invalid Role')
  }

  return createRole({
    ...role,
    ...changes,
    id: uuidv4(), // New version gets new ID
    version: role.version + 1,
    contract: {
      ...role.contract,
      ...(changes.contract || {}),
      attributes: {
        ...role.contract.attributes,
        ...(changes.contract?.attributes || {})
      },
      operations: {
        ...role.contract.operations,
        ...(changes.contract?.operations || {})
      },
      relationships: {
        ...role.contract.relationships,
        ...(changes.contract?.relationships || {})
      }
    }
  })
}

/**
 * Adds an attribute to a Role's contract
 *
 * @param {Role} role - The Role
 * @param {string} attributeName - Attribute name
 * @param {AttributeDefinition} definition - Attribute definition
 * @returns {Role} Updated Role
 */
export function addAttribute(role, attributeName, definition) {
  if (!isValidRole(role)) {
    throw new Error('Invalid Role')
  }

  if (!attributeName || typeof attributeName !== 'string') {
    throw new Error('Attribute name must be a non-empty string')
  }

  if (!definition || typeof definition !== 'object') {
    throw new Error('Attribute definition must be an object')
  }

  return updateRole(role, {
    contract: {
      ...role.contract,
      attributes: {
        ...role.contract.attributes,
        [attributeName]: definition
      }
    }
  })
}

/**
 * Adds an invariant to a Role's contract
 *
 * @param {Role} role - The Role
 * @param {string} invariant - Invariant predicate
 * @returns {Role} Updated Role
 */
export function addInvariant(role, invariant) {
  if (!isValidRole(role)) {
    throw new Error('Invalid Role')
  }

  if (!invariant || typeof invariant !== 'string') {
    throw new Error('Invariant must be a non-empty string')
  }

  return updateRole(role, {
    contract: {
      ...role.contract,
      invariants: [...role.contract.invariants, invariant]
    }
  })
}

/**
 * Adds an operation to a Role's contract
 *
 * @param {Role} role - The Role
 * @param {string} operationName - Operation name
 * @param {OperationDefinition} definition - Operation definition
 * @returns {Role} Updated Role
 */
export function addOperation(role, operationName, definition) {
  if (!isValidRole(role)) {
    throw new Error('Invalid Role')
  }

  if (!operationName || typeof operationName !== 'string') {
    throw new Error('Operation name must be a non-empty string')
  }

  if (!definition || typeof definition !== 'object') {
    throw new Error('Operation definition must be an object')
  }

  return updateRole(role, {
    contract: {
      ...role.contract,
      operations: {
        ...role.contract.operations,
        [operationName]: definition
      }
    }
  })
}

/**
 * Serializes a Role to JSON-compatible object
 *
 * @param {Role} role - The Role to serialize
 * @returns {Object} JSON-compatible object
 */
export function serializeRole(role) {
  if (!isValidRole(role)) {
    throw new Error('Invalid Role')
  }

  return {
    id: role.id,
    prismId: role.prismId,
    name: role.name,
    description: role.description,
    version: role.version,
    contract: role.contract,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt ? role.updatedAt.toISOString() : undefined
  }
}

/**
 * Deserializes a Role from JSON-compatible object
 *
 * @param {Object} json - JSON-compatible object
 * @returns {Role} Deserialized Role
 */
export function deserializeRole(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid JSON: must be an object')
  }

  return createRole({
    id: json.id,
    prismId: json.prismId,
    name: json.name,
    description: json.description,
    version: json.version,
    contract: json.contract,
    createdAt: json.createdAt ? new Date(json.createdAt) : undefined,
    updatedAt: json.updatedAt ? new Date(json.updatedAt) : undefined
  })
}

// Export default for easier imports
export default {
  createRole,
  isValidRole,
  updateRole,
  versionRole,
  addAttribute,
  addInvariant,
  addOperation,
  serializeRole,
  deserializeRole
}
