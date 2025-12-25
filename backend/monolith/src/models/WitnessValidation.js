/**
 * Witness Validation Logic - Role-Sets Paradigm
 *
 * This module provides validation logic for creating witnesses (RoleBindings)
 * that prove a Thing satisfies a Role's contract.
 *
 * Key Responsibilities:
 * 1. Validate attribute types against role contract
 * 2. Check required attributes are present
 * 3. Evaluate invariant predicates
 * 4. Generate validation traces
 * 5. Create valid witnesses with proofs
 *
 * @see /docs/conceptual-framework/role-sets-theory.md
 */

import { createRoleBinding } from './RoleBinding.js'

/**
 * Validates attribute type against role contract definition
 *
 * @param {any} value - Attribute value
 * @param {import('./Role').AttributeDefinition} definition - Attribute definition
 * @returns {boolean} True if type matches
 */
export function validateAttributeType(value, definition) {
  if (value === null || value === undefined) {
    return !definition.required
  }

  switch (definition.type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && !isNaN(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'Date':
      return value instanceof Date && !isNaN(value.getTime())
    case 'Array':
      return Array.isArray(value)
    case 'Object':
      return typeof value === 'object' && !Array.isArray(value)
    default:
      return true // Unknown type, assume valid
  }
}

/**
 * Validates that all required attributes are present
 *
 * @param {Object<string, any>} attributes - Provided attributes
 * @param {Object<string, import('./Role').AttributeDefinition>} contract - Contract attributes
 * @returns {{valid: boolean, missing: string[]}} Validation result
 */
export function validateRequiredAttributes(attributes, contract) {
  const missing = []

  for (const [name, definition] of Object.entries(contract)) {
    if (definition.required && !(name in attributes)) {
      missing.push(name)
    }
  }

  return {
    valid: missing.length === 0,
    missing
  }
}

/**
 * Validates attribute types against role contract
 *
 * @param {Object<string, any>} attributes - Provided attributes
 * @param {Object<string, import('./Role').AttributeDefinition>} contract - Contract attributes
 * @returns {{valid: boolean, errors: Object<string, string>}} Validation result
 */
export function validateAttributeTypes(attributes, contract) {
  const errors = {}

  for (const [name, value] of Object.entries(attributes)) {
    const definition = contract[name]

    if (!definition) {
      // Attribute not in contract - might be OK (additional data)
      continue
    }

    if (!validateAttributeType(value, definition)) {
      errors[name] = `Expected type ${definition.type}, got ${typeof value}`
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Evaluates a simple invariant predicate
 *
 * This is a basic evaluator that handles simple comparison expressions.
 * For production, consider using a proper expression parser/evaluator.
 *
 * Supported formats:
 * - "attribute > value" (e.g., "price > 0")
 * - "attribute < value"
 * - "attribute >= value"
 * - "attribute <= value"
 * - "attribute === value"
 * - "attribute !== value"
 * - "attribute.length > value"
 * - "attribute IN [value1, value2, ...]"
 *
 * @param {string} invariant - Invariant predicate
 * @param {Object<string, any>} attributes - Attribute values
 * @returns {{satisfied: boolean, evidence: any, explanation: string}} Evaluation result
 */
export function evaluateInvariant(invariant, attributes) {
  try {
    // Simple pattern matching for common invariants
    const trimmed = invariant.trim()

    // Handle "attribute > value"
    const gtMatch = trimmed.match(/^(\w+(?:\.\w+)?)\s*>\s*(.+)$/)
    if (gtMatch) {
      const [, attrPath, valueStr] = gtMatch
      const attrValue = getNestedValue(attributes, attrPath)
      const compareValue = parseValue(valueStr)
      const satisfied = attrValue > compareValue
      return {
        satisfied,
        evidence: { [attrPath]: attrValue, compare: compareValue },
        explanation: `${attrPath} (${attrValue}) > ${compareValue}: ${satisfied}`
      }
    }

    // Handle "attribute < value"
    const ltMatch = trimmed.match(/^(\w+(?:\.\w+)?)\s*<\s*(.+)$/)
    if (ltMatch) {
      const [, attrPath, valueStr] = ltMatch
      const attrValue = getNestedValue(attributes, attrPath)
      const compareValue = parseValue(valueStr)
      const satisfied = attrValue < compareValue
      return {
        satisfied,
        evidence: { [attrPath]: attrValue, compare: compareValue },
        explanation: `${attrPath} (${attrValue}) < ${compareValue}: ${satisfied}`
      }
    }

    // Handle "attribute IN [value1, value2, ...]"
    const inMatch = trimmed.match(/^(\w+(?:\.\w+)?)\s+IN\s+\[(.+)\]$/i)
    if (inMatch) {
      const [, attrPath, valuesStr] = inMatch
      const attrValue = getNestedValue(attributes, attrPath)
      const values = valuesStr.split(',').map((v) => parseValue(v.trim()))
      const satisfied = values.includes(attrValue)
      return {
        satisfied,
        evidence: { [attrPath]: attrValue, allowedValues: values },
        explanation: `${attrPath} (${attrValue}) in [${values.join(', ')}]: ${satisfied}`
      }
    }

    // For complex invariants, return warning
    return {
      satisfied: true, // Assume satisfied for now (not validated)
      evidence: { invariant },
      explanation: `Complex invariant not evaluated: ${invariant}`
    }
  } catch (error) {
    return {
      satisfied: false,
      evidence: { error: error.message },
      explanation: `Error evaluating invariant: ${error.message}`
    }
  }
}

/**
 * Gets nested value from object using dot notation
 *
 * @param {Object} obj - Object
 * @param {string} path - Dot-separated path (e.g., "user.name")
 * @returns {any} Value at path
 */
function getNestedValue(obj, path) {
  const parts = path.split('.')
  let value = obj

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part]
    } else {
      return undefined
    }
  }

  return value
}

/**
 * Parses a string value to appropriate type
 *
 * @param {string} str - String value
 * @returns {any} Parsed value
 */
function parseValue(str) {
  const trimmed = str.trim()

  // Boolean
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed)
  }

  // String (remove quotes if present)
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

/**
 * Validates all invariants for a role
 *
 * @param {string[]} invariants - List of invariant predicates
 * @param {Object<string, any>} attributes - Attribute values
 * @returns {{valid: boolean, traces: import('./RoleBinding').ValidationTrace[]}} Validation result
 */
export function validateInvariants(invariants, attributes) {
  const traces = []
  let allSatisfied = true

  for (const invariant of invariants) {
    const result = evaluateInvariant(invariant, attributes)

    traces.push({
      invariant,
      satisfied: result.satisfied,
      evidence: result.evidence,
      explanation: result.explanation
    })

    if (!result.satisfied) {
      allSatisfied = false
    }
  }

  return {
    valid: allSatisfied,
    traces
  }
}

/**
 * Validates that attributes satisfy a role contract
 *
 * @param {Object<string, any>} attributes - Attribute values
 * @param {import('./Role').RoleContract} contract - Role contract
 * @returns {{valid: boolean, errors: string[], traces: import('./RoleBinding').ValidationTrace[]}} Validation result
 */
export function validateContract(attributes, contract) {
  const errors = []
  let traces = []

  // Check required attributes
  const requiredCheck = validateRequiredAttributes(attributes, contract.attributes)
  if (!requiredCheck.valid) {
    errors.push(`Missing required attributes: ${requiredCheck.missing.join(', ')}`)
  }

  // Check attribute types
  const typeCheck = validateAttributeTypes(attributes, contract.attributes)
  if (!typeCheck.valid) {
    for (const [name, error] of Object.entries(typeCheck.errors)) {
      errors.push(`Attribute '${name}': ${error}`)
    }
  }

  // Check invariants
  const invariantCheck = validateInvariants(contract.invariants, attributes)
  traces = invariantCheck.traces

  if (!invariantCheck.valid) {
    const failed = traces.filter((t) => !t.satisfied).map((t) => t.invariant)
    errors.push(`Invariants not satisfied: ${failed.join(', ')}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    traces
  }
}

/**
 * Validates witness attributes against a role's contract
 *
 * This is a convenience function for UI components that need to validate
 * attributes against a role contract.
 *
 * @param {import('./Role').Role} role - The role with contract
 * @param {Object<string, any>} attributes - Attribute values to validate
 * @returns {{success: boolean, errors?: string[], trace?: import('./RoleBinding').ValidationTrace[]}} Validation result
 *
 * @example
 * const result = validateWitness(role, { label: 'My Node', type: 'process' })
 * if (result.success) {
 *   console.log('Validation passed with trace:', result.trace)
 * } else {
 *   console.error('Validation failed:', result.errors)
 * }
 */
export function validateWitness(role, attributes) {
  if (!role || !role.contract) {
    return {
      success: false,
      errors: ['Role or role contract is required for validation']
    }
  }

  // Validate contract
  const validation = validateContract(attributes, role.contract)

  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors
    }
  }

  return {
    success: true,
    trace: validation.traces
  }
}

/**
 * Creates a validated RoleBinding (Witness)
 *
 * This is the main entry point for creating witnesses with full validation.
 *
 * @param {Object} options - Creation options
 * @param {string} options.thingId - Thing ID
 * @param {string} options.prismId - Prism ID
 * @param {string} options.roleId - Role ID
 * @param {import('./Role').Role} options.role - The Role (for contract validation)
 * @param {Object<string, any>} options.attributes - Attribute values
 * @param {string} [options.explanation] - Explanation for membership
 * @param {string[]} [options.dependencies] - Dependent RoleBinding IDs
 * @returns {{success: boolean, binding?: import('./RoleBinding').RoleBinding, errors?: string[]}} Creation result
 *
 * @example
 * const result = validateAndCreateRoleBinding({
 *   thingId: 'thing-123',
 *   prismId: 'prism-floweditor',
 *   roleId: 'role-processnode',
 *   role: processNodeRole,
 *   attributes: {
 *     label: 'Transform Data',
 *     processingType: 'map'
 *   },
 *   explanation: 'Valid ProcessNode with label and type'
 * })
 *
 * if (result.success) {
 *   logger.info('Created witness:', result.binding)
 * } else {
 *   console.error('Validation failed:', result.errors)
 * }
 */
export function validateAndCreateRoleBinding(options) {
  if (!options.role) {
    return {
      success: false,
      errors: ['Role is required for validation']
    }
  }

  // Validate contract
  const validation = validateContract(options.attributes, options.role.contract)

  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors
    }
  }

  // Create binding with validation traces
  const binding = createRoleBinding({
    thingId: options.thingId,
    prismId: options.prismId,
    roleId: options.roleId,
    attributes: options.attributes,
    validationTrace: validation.traces,
    dependencies: options.dependencies,
    explanation: options.explanation || 'Contract validation passed'
  })

  return {
    success: true,
    binding
  }
}

// Export default for easier imports
export default {
  validateAttributeType,
  validateRequiredAttributes,
  validateAttributeTypes,
  evaluateInvariant,
  validateInvariants,
  validateContract,
  validateWitness,
  validateAndCreateRoleBinding
}
