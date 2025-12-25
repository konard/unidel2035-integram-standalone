/**
 * Prism Entity - Role-Sets Paradigm
 *
 * A Prism represents a coherent context/aspect of consideration with its own vocabulary,
 * invariants, and operations. Prisms define the conceptual space in which Things play roles.
 *
 * Key Principles (from Role-Sets Theory):
 * 1. Prisms are first-class contexts that define roles and their contracts
 * 2. The same Thing can be viewed through multiple prisms simultaneously
 * 3. Prisms have their own DSL, invariants, and operations
 * 4. Prisms evolve by versioning, not by schema migrations
 *
 * @see /docs/conceptual-framework/role-sets-theory.md
 * @see /docs/conceptual-framework/plain-models-architecture.md
 */

import { v4 as uuidv4 } from 'uuid'

/**
 * @typedef {Object} PrismMetadata
 * @property {string} [dsl] - Domain-specific language definitions
 * @property {string[]} invariants - Global constraints in this prism
 * @property {string[]} operations - Valid operations in this prism
 * @property {Object} [custom] - Custom metadata
 */

/**
 * @typedef {Object} Prism
 * @property {string} id - Unique identifier (UUID)
 * @property {string} name - Prism name (must be unique)
 * @property {string} description - Human-readable description
 * @property {number} version - Version number for evolution tracking
 * @property {PrismMetadata} metadata - Prism metadata (DSL, invariants, operations)
 * @property {Date} createdAt - Timestamp when Prism was created
 * @property {Date} [updatedAt] - Timestamp when Prism was last updated
 */

/**
 * @typedef {Object} PrismCreateOptions
 * @property {string} [id] - Optional custom ID (UUID will be generated if not provided)
 * @property {string} name - Prism name (required)
 * @property {string} [description] - Prism description
 * @property {number} [version] - Version number (defaults to 1)
 * @property {PrismMetadata} [metadata] - Prism metadata
 */

/**
 * Creates a new Prism
 *
 * @param {PrismCreateOptions} options - Creation options
 * @returns {Prism} The created Prism
 *
 * @example
 * const prism = createPrism({
 *   name: 'FlowEditor',
 *   description: 'Visual flow editing context',
 *   metadata: {
 *     invariants: ['All nodes must be connected'],
 *     operations: ['addNode', 'removeNode', 'connectNodes']
 *   }
 * })
 */
export function createPrism(options) {
  if (!options || !options.name) {
    throw new Error('Prism name is required')
  }

  const now = new Date()

  return {
    id: options.id || uuidv4(),
    name: options.name,
    description: options.description || '',
    version: options.version || 1,
    metadata: {
      dsl: options.metadata?.dsl || '',
      invariants: options.metadata?.invariants || [],
      operations: options.metadata?.operations || [],
      custom: options.metadata?.custom || {}
    },
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now
  }
}

/**
 * Validates that an object is a valid Prism
 *
 * @param {any} obj - Object to validate
 * @returns {boolean} True if valid Prism
 *
 * @example
 * isValidPrism(prism) // true if valid
 */
export function isValidPrism(obj) {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    return false
  }

  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    return false
  }

  if (typeof obj.version !== 'number' || obj.version < 1) {
    return false
  }

  if (!obj.metadata || typeof obj.metadata !== 'object') {
    return false
  }

  if (!Array.isArray(obj.metadata.invariants)) {
    return false
  }

  if (!Array.isArray(obj.metadata.operations)) {
    return false
  }

  if (!(obj.createdAt instanceof Date) || isNaN(obj.createdAt.getTime())) {
    return false
  }

  return true
}

/**
 * Updates a Prism (creates new version)
 *
 * @param {Prism} prism - The Prism to update
 * @param {Partial<PrismCreateOptions>} updates - Fields to update
 * @returns {Prism} New Prism with updates
 *
 * @example
 * const updated = updatePrism(prism, {
 *   description: 'Updated description',
 *   metadata: { invariants: [...prism.metadata.invariants, 'New invariant'] }
 * })
 */
export function updatePrism(prism, updates) {
  if (!isValidPrism(prism)) {
    throw new Error('Invalid Prism')
  }

  return {
    ...prism,
    ...updates,
    metadata: {
      ...prism.metadata,
      ...(updates.metadata || {})
    },
    updatedAt: new Date()
  }
}

/**
 * Creates a new version of a Prism
 *
 * @param {Prism} prism - The Prism to version
 * @param {Partial<PrismCreateOptions>} changes - Changes for new version
 * @returns {Prism} New Prism version
 *
 * @example
 * const v2 = versionPrism(prismV1, {
 *   metadata: { operations: [...prismV1.metadata.operations, 'newOperation'] }
 * })
 * // v2.version === 2
 */
export function versionPrism(prism, changes = {}) {
  if (!isValidPrism(prism)) {
    throw new Error('Invalid Prism')
  }

  return createPrism({
    ...prism,
    ...changes,
    id: uuidv4(), // New version gets new ID
    version: prism.version + 1,
    metadata: {
      ...prism.metadata,
      ...(changes.metadata || {})
    }
  })
}

/**
 * Adds an invariant to a Prism
 *
 * @param {Prism} prism - The Prism
 * @param {string} invariant - Invariant to add
 * @returns {Prism} Updated Prism
 *
 * @example
 * const updated = addInvariant(prism, 'price > 0')
 */
export function addInvariant(prism, invariant) {
  if (!isValidPrism(prism)) {
    throw new Error('Invalid Prism')
  }

  if (typeof invariant !== 'string' || invariant.length === 0) {
    throw new Error('Invariant must be a non-empty string')
  }

  return updatePrism(prism, {
    metadata: {
      ...prism.metadata,
      invariants: [...prism.metadata.invariants, invariant]
    }
  })
}

/**
 * Adds an operation to a Prism
 *
 * @param {Prism} prism - The Prism
 * @param {string} operation - Operation to add
 * @returns {Prism} Updated Prism
 *
 * @example
 * const updated = addOperation(prism, 'processData')
 */
export function addOperation(prism, operation) {
  if (!isValidPrism(prism)) {
    throw new Error('Invalid Prism')
  }

  if (typeof operation !== 'string' || operation.length === 0) {
    throw new Error('Operation must be a non-empty string')
  }

  return updatePrism(prism, {
    metadata: {
      ...prism.metadata,
      operations: [...prism.metadata.operations, operation]
    }
  })
}

/**
 * Serializes a Prism to JSON-compatible object
 *
 * @param {Prism} prism - The Prism to serialize
 * @returns {Object} JSON-compatible object
 */
export function serializePrism(prism) {
  if (!isValidPrism(prism)) {
    throw new Error('Invalid Prism')
  }

  return {
    id: prism.id,
    name: prism.name,
    description: prism.description,
    version: prism.version,
    metadata: prism.metadata,
    createdAt: prism.createdAt.toISOString(),
    updatedAt: prism.updatedAt ? prism.updatedAt.toISOString() : undefined
  }
}

/**
 * Deserializes a Prism from JSON-compatible object
 *
 * @param {Object} json - JSON-compatible object
 * @returns {Prism} Deserialized Prism
 */
export function deserializePrism(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid JSON: must be an object')
  }

  return createPrism({
    id: json.id,
    name: json.name,
    description: json.description,
    version: json.version,
    metadata: json.metadata,
    createdAt: json.createdAt ? new Date(json.createdAt) : undefined,
    updatedAt: json.updatedAt ? new Date(json.updatedAt) : undefined
  })
}

// Export default for easier imports
export default {
  createPrism,
  isValidPrism,
  updatePrism,
  versionPrism,
  addInvariant,
  addOperation,
  serializePrism,
  deserializePrism
}
