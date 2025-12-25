/**
 * Thing Entity - Role-Sets Paradigm (Backend Version)
 *
 * A Thing represents a stable entity from the real world with persistent identity.
 *
 * Key Principles (from Role-Sets Theory):
 * 1. Things have ONLY identity (id) - no intrinsic attributes
 * 2. All attributes belong to roles within prisms, not to Things
 * 3. Things are stable and universal across all conceptualizations
 * 4. Things exist independently of any prism or role
 *
 * @see /docs/conceptual-framework/role-sets-theory.md
 * @see /docs/conceptual-framework/plain-models-architecture.md
 */

import { v4 as uuidv4 } from 'uuid'

/**
 * @typedef {Object} Thing
 * @property {string} id - Unique identifier (UUID)
 * @property {Date} createdAt - Timestamp when Thing was created
 * @property {Date} [updatedAt] - Timestamp when Thing was last updated
 */

/**
 * @typedef {Object} ThingCreateOptions
 * @property {string} [id] - Optional custom ID (UUID will be generated if not provided)
 * @property {Date} [createdAt] - Optional creation timestamp (defaults to now)
 */

/**
 * Creates a new Thing with only identity
 *
 * @param {ThingCreateOptions} [options={}] - Creation options
 * @returns {Thing} The created Thing
 *
 * @example
 * const thing = createThing()
 * // { id: 'uuid-123...', createdAt: Date }
 *
 * @example
 * // With custom ID
 * const thing = createThing({ id: 'custom-thing-id' })
 */
export function createThing(options = {}) {
  const now = new Date()

  return {
    id: options.id || uuidv4(),
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now
  }
}

/**
 * Validates that an object is a valid Thing
 *
 * @param {any} obj - Object to validate
 * @returns {boolean} True if valid Thing
 *
 * @example
 * isValidThing({ id: 'abc', createdAt: new Date() }) // true
 * isValidThing({ name: 'foo' }) // false - no id
 */
export function isValidThing(obj) {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    return false
  }

  if (!(obj.createdAt instanceof Date) || isNaN(obj.createdAt.getTime())) {
    return false
  }

  return true
}

/**
 * Gets the identity of a Thing (just the ID)
 *
 * @param {Thing} thing - The Thing
 * @returns {string} The Thing's ID
 *
 * @example
 * const id = getThingIdentity(thing)
 */
export function getThingIdentity(thing) {
  if (!isValidThing(thing)) {
    throw new Error('Invalid Thing: must have id and createdAt')
  }

  return thing.id
}

/**
 * Compares two Things for equality (based on ID only)
 *
 * @param {Thing} thing1 - First Thing
 * @param {Thing} thing2 - Second Thing
 * @returns {boolean} True if Things have the same ID
 *
 * @example
 * areThingsSame(thing1, thing2) // true if thing1.id === thing2.id
 */
export function areThingsSame(thing1, thing2) {
  if (!isValidThing(thing1) || !isValidThing(thing2)) {
    return false
  }

  return thing1.id === thing2.id
}

/**
 * Updates a Thing's metadata (updatedAt timestamp)
 * Note: Things have no other attributes to update!
 *
 * @param {Thing} thing - The Thing to update
 * @returns {Thing} New Thing with updated timestamp
 *
 * @example
 * const updatedThing = touchThing(thing)
 */
export function touchThing(thing) {
  if (!isValidThing(thing)) {
    throw new Error('Invalid Thing: must have id and createdAt')
  }

  return {
    ...thing,
    updatedAt: new Date()
  }
}

/**
 * Clones a Thing (creates a new Thing with same ID)
 * Note: This creates a reference, not a new entity
 *
 * @param {Thing} thing - The Thing to clone
 * @returns {Thing} Cloned Thing
 *
 * @example
 * const cloned = cloneThing(thing)
 */
export function cloneThing(thing) {
  if (!isValidThing(thing)) {
    throw new Error('Invalid Thing: must have id and createdAt')
  }

  return {
    id: thing.id,
    createdAt: new Date(thing.createdAt.getTime()),
    updatedAt: thing.updatedAt ? new Date(thing.updatedAt.getTime()) : undefined
  }
}

/**
 * Serializes a Thing to JSON-compatible object
 *
 * @param {Thing} thing - The Thing to serialize
 * @returns {Object} JSON-compatible object
 *
 * @example
 * const json = serializeThing(thing)
 * // { id: 'uuid-123', createdAt: '2025-01-01T00:00:00.000Z' }
 */
export function serializeThing(thing) {
  if (!isValidThing(thing)) {
    throw new Error('Invalid Thing: must have id and createdAt')
  }

  return {
    id: thing.id,
    createdAt: thing.createdAt.toISOString(),
    updatedAt: thing.updatedAt ? thing.updatedAt.toISOString() : undefined
  }
}

/**
 * Deserializes a Thing from JSON-compatible object
 *
 * @param {Object} json - JSON-compatible object
 * @returns {Thing} Deserialized Thing
 *
 * @example
 * const thing = deserializeThing({ id: 'uuid-123', createdAt: '2025-01-01T...' })
 */
export function deserializeThing(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid JSON: must be an object')
  }

  if (!json.id || typeof json.id !== 'string') {
    throw new Error('Invalid JSON: must have string id')
  }

  if (!json.createdAt) {
    throw new Error('Invalid JSON: must have createdAt')
  }

  return {
    id: json.id,
    createdAt: new Date(json.createdAt),
    updatedAt: json.updatedAt ? new Date(json.updatedAt) : undefined
  }
}

// Export default for easier imports
export default {
  createThing,
  isValidThing,
  getThingIdentity,
  areThingsSame,
  touchThing,
  cloneThing,
  serializeThing,
  deserializeThing
}
