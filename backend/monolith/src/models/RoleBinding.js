/**
 * RoleBinding Entity (Witness) - Role-Sets Paradigm
 *
 * A RoleBinding (also called a Witness) is proof that a Thing inhabits a Role
 * within a Prism. It contains the operational artifact that demonstrates
 * membership: attribute values and validation traces.
 *
 * Key Principles (from Role-Sets Theory):
 * 1. Membership is not a boolean flag - it's a constructive proof (witness)
 * 2. Witnesses contain attribute values (the Thing's properties in this role)
 * 3. Witnesses include validation traces showing invariants are satisfied
 * 4. Witnesses are traceable with explanations and dependencies
 *
 * This implements the Curry-Howard correspondence:
 * - "Thing X is a Role Y" ↔ Witness that X satisfies Y's contract
 *
 * @see /docs/conceptual-framework/role-sets-theory.md
 * @see /docs/conceptual-framework/plain-models-architecture.md
 */

import { v4 as uuidv4 } from 'uuid'

/**
 * @typedef {Object} ValidationTrace
 * @property {string} invariant - The invariant being checked
 * @property {boolean} satisfied - Whether the invariant is satisfied
 * @property {any} evidence - Values/data used in the check
 * @property {string} [explanation] - Human-readable explanation
 */

/**
 * @typedef {Object} WitnessProof
 * @property {Object<string, any>} attributes - Attribute values for this role
 * @property {boolean} invariantsSatisfied - Whether all invariants hold
 * @property {Date} timestamp - When proof was constructed
 * @property {ValidationTrace[]} validationTrace - How invariants were checked
 */

/**
 * @typedef {Object} RoleBinding
 * @property {string} id - Unique identifier (UUID)
 * @property {string} thingId - ID of the Thing
 * @property {string} prismId - ID of the Prism
 * @property {string} roleId - ID of the Role
 * @property {WitnessProof} proof - The witness proof artifact
 * @property {Date} createdAt - Timestamp when binding was created
 * @property {Date} [updatedAt] - Timestamp when binding was last updated
 * @property {number} version - Version number for tracking updates
 * @property {string[]} dependencies - IDs of other RoleBindings this depends on
 * @property {string} explanation - Human-readable reasoning for this membership
 */

/**
 * @typedef {Object} RoleBindingCreateOptions
 * @property {string} [id] - Optional custom ID (UUID will be generated if not provided)
 * @property {string} thingId - ID of the Thing (required)
 * @property {string} prismId - ID of the Prism (required)
 * @property {string} roleId - ID of the Role (required)
 * @property {Object<string, any>} attributes - Attribute values (required)
 * @property {ValidationTrace[]} [validationTrace] - Validation trace
 * @property {string[]} [dependencies] - Dependent RoleBinding IDs
 * @property {string} [explanation] - Explanation for membership
 */

/**
 * Creates a new RoleBinding (Witness)
 *
 * This function creates a witness but does NOT validate invariants.
 * Use validateAndCreateRoleBinding() for automatic validation.
 *
 * @param {RoleBindingCreateOptions} options - Creation options
 * @returns {RoleBinding} The created RoleBinding
 *
 * @example
 * const binding = createRoleBinding({
 *   thingId: 'thing-123',
 *   prismId: 'prism-floweditor',
 *   roleId: 'role-processnode',
 *   attributes: {
 *     label: 'Transform Data',
 *     processingType: 'map'
 *   },
 *   explanation: 'Node is ProcessNode because it has valid label and type'
 * })
 */
export function createRoleBinding(options) {
  if (!options || !options.thingId) {
    throw new Error('RoleBinding thingId is required')
  }

  if (!options.prismId) {
    throw new Error('RoleBinding prismId is required')
  }

  if (!options.roleId) {
    throw new Error('RoleBinding roleId is required')
  }

  if (!options.attributes || typeof options.attributes !== 'object') {
    throw new Error('RoleBinding attributes are required')
  }

  const now = new Date()

  return {
    id: options.id || uuidv4(),
    thingId: options.thingId,
    prismId: options.prismId,
    roleId: options.roleId,
    proof: {
      attributes: options.attributes,
      invariantsSatisfied: true, // Assumed for now (validation happens separately)
      timestamp: now,
      validationTrace: options.validationTrace || []
    },
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now,
    version: options.version || 1,
    dependencies: options.dependencies || [],
    explanation: options.explanation || 'Membership witness created'
  }
}

/**
 * Validates that an object is a valid RoleBinding
 *
 * @param {any} obj - Object to validate
 * @returns {boolean} True if valid RoleBinding
 */
export function isValidRoleBinding(obj) {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    return false
  }

  if (typeof obj.thingId !== 'string' || obj.thingId.length === 0) {
    return false
  }

  if (typeof obj.prismId !== 'string' || obj.prismId.length === 0) {
    return false
  }

  if (typeof obj.roleId !== 'string' || obj.roleId.length === 0) {
    return false
  }

  if (!obj.proof || typeof obj.proof !== 'object') {
    return false
  }

  if (!obj.proof.attributes || typeof obj.proof.attributes !== 'object') {
    return false
  }

  if (typeof obj.proof.invariantsSatisfied !== 'boolean') {
    return false
  }

  if (!(obj.proof.timestamp instanceof Date) || isNaN(obj.proof.timestamp.getTime())) {
    return false
  }

  if (!Array.isArray(obj.proof.validationTrace)) {
    return false
  }

  if (!(obj.createdAt instanceof Date) || isNaN(obj.createdAt.getTime())) {
    return false
  }

  if (!Array.isArray(obj.dependencies)) {
    return false
  }

  return true
}

/**
 * Updates a RoleBinding's attributes
 *
 * @param {RoleBinding} binding - The RoleBinding to update
 * @param {Object<string, any>} attributes - New attribute values
 * @param {ValidationTrace[]} [validationTrace] - New validation trace
 * @returns {RoleBinding} New RoleBinding with updated attributes
 */
export function updateRoleBindingAttributes(binding, attributes, validationTrace) {
  if (!isValidRoleBinding(binding)) {
    throw new Error('Invalid RoleBinding')
  }

  const now = new Date()

  return {
    ...binding,
    proof: {
      ...binding.proof,
      attributes: {
        ...binding.proof.attributes,
        ...attributes
      },
      timestamp: now,
      validationTrace: validationTrace || binding.proof.validationTrace
    },
    updatedAt: now,
    version: binding.version + 1
  }
}

/**
 * Gets attribute value from a RoleBinding
 *
 * @param {RoleBinding} binding - The RoleBinding
 * @param {string} attributeName - Attribute name
 * @returns {any} The attribute value
 */
export function getRoleBindingAttribute(binding, attributeName) {
  if (!isValidRoleBinding(binding)) {
    throw new Error('Invalid RoleBinding')
  }

  return binding.proof.attributes[attributeName]
}

/**
 * Gets all attributes from a RoleBinding
 *
 * @param {RoleBinding} binding - The RoleBinding
 * @returns {Object<string, any>} All attributes
 */
export function getRoleBindingAttributes(binding) {
  if (!isValidRoleBinding(binding)) {
    throw new Error('Invalid RoleBinding')
  }

  return { ...binding.proof.attributes }
}

/**
 * Checks if RoleBinding has a specific attribute
 *
 * @param {RoleBinding} binding - The RoleBinding
 * @param {string} attributeName - Attribute name
 * @returns {boolean} True if attribute exists
 */
export function hasRoleBindingAttribute(binding, attributeName) {
  if (!isValidRoleBinding(binding)) {
    return false
  }

  return attributeName in binding.proof.attributes
}

/**
 * Adds a dependency to a RoleBinding
 *
 * @param {RoleBinding} binding - The RoleBinding
 * @param {string} dependencyId - ID of dependent RoleBinding
 * @returns {RoleBinding} Updated RoleBinding
 */
export function addDependency(binding, dependencyId) {
  if (!isValidRoleBinding(binding)) {
    throw new Error('Invalid RoleBinding')
  }

  if (!dependencyId || typeof dependencyId !== 'string') {
    throw new Error('Dependency ID must be a non-empty string')
  }

  if (binding.dependencies.includes(dependencyId)) {
    return binding // Already has this dependency
  }

  return {
    ...binding,
    dependencies: [...binding.dependencies, dependencyId],
    updatedAt: new Date()
  }
}

/**
 * Marks a RoleBinding as invalid (invariants not satisfied)
 *
 * @param {RoleBinding} binding - The RoleBinding
 * @param {string} reason - Reason for invalidation
 * @returns {RoleBinding} Updated RoleBinding with invariantsSatisfied=false
 */
export function invalidateRoleBinding(binding, reason) {
  if (!isValidRoleBinding(binding)) {
    throw new Error('Invalid RoleBinding')
  }

  return {
    ...binding,
    proof: {
      ...binding.proof,
      invariantsSatisfied: false,
      timestamp: new Date()
    },
    explanation: `${binding.explanation} | INVALIDATED: ${reason}`,
    updatedAt: new Date()
  }
}

/**
 * Checks if RoleBinding is valid (invariants satisfied)
 *
 * @param {RoleBinding} binding - The RoleBinding
 * @returns {boolean} True if invariants are satisfied
 */
export function isRoleBindingValid(binding) {
  if (!isValidRoleBinding(binding)) {
    return false
  }

  return binding.proof.invariantsSatisfied === true
}

/**
 * Serializes a RoleBinding to JSON-compatible object
 *
 * @param {RoleBinding} binding - The RoleBinding to serialize
 * @returns {Object} JSON-compatible object
 */
export function serializeRoleBinding(binding) {
  if (!isValidRoleBinding(binding)) {
    throw new Error('Invalid RoleBinding')
  }

  return {
    id: binding.id,
    thingId: binding.thingId,
    prismId: binding.prismId,
    roleId: binding.roleId,
    proof: {
      ...binding.proof,
      timestamp: binding.proof.timestamp.toISOString()
    },
    createdAt: binding.createdAt.toISOString(),
    updatedAt: binding.updatedAt ? binding.updatedAt.toISOString() : undefined,
    version: binding.version,
    dependencies: binding.dependencies,
    explanation: binding.explanation
  }
}

/**
 * Deserializes a RoleBinding from JSON-compatible object
 *
 * @param {Object} json - JSON-compatible object
 * @returns {RoleBinding} Deserialized RoleBinding
 */
export function deserializeRoleBinding(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid JSON: must be an object')
  }

  return createRoleBinding({
    id: json.id,
    thingId: json.thingId,
    prismId: json.prismId,
    roleId: json.roleId,
    attributes: json.proof.attributes,
    validationTrace: json.proof.validationTrace,
    dependencies: json.dependencies,
    explanation: json.explanation,
    createdAt: json.createdAt ? new Date(json.createdAt) : undefined,
    updatedAt: json.updatedAt ? new Date(json.updatedAt) : undefined,
    version: json.version
  })
}

// Export default for easier imports
export default {
  createRoleBinding,
  isValidRoleBinding,
  updateRoleBindingAttributes,
  getRoleBindingAttribute,
  getRoleBindingAttributes,
  hasRoleBindingAttribute,
  addDependency,
  invalidateRoleBinding,
  isRoleBindingValid,
  serializeRoleBinding,
  deserializeRoleBinding
}
