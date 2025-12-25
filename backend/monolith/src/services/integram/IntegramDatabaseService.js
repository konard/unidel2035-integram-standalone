/**
 * Integram Database Service
 *
 * Abstraction layer for Integram database operations.
 * Currently uses file-based storage for Phase 0, designed to be easily
 * swapped with real Integram HTTP API in Phase 1.
 *
 * Issue #3112 - Phase 0: Infrastructure preparation
 *
 * Features:
 * - Create organization databases
 * - Run migrations (create system tables)
 * - Deploy agent tables dynamically
 * - CRUD operations on tables
 * - Query with filtering
 *
 * Architecture:
 * - Each organization gets a "database" (directory structure)
 * - System tables: organizations, teams, agents, agent_instances, data_sources, health_checks
 * - Agent tables: agent_{agent_id}_{table_name}
 * - Data stored as JSON files
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Base directory for all Integram data
const INTEGRAM_BASE_DIR = process.env.INTEGRAM_BASE_DIR ||
  path.join(__dirname, '../../../data/integram')

// System table definitions
const SYSTEM_TABLES = {
  organizations: {
    name: 'organizations',
    schema: {
      id: { type: 'uuid', primaryKey: true },
      name: { type: 'string', required: true },
      owner_email: { type: 'string', required: true },
      icon: { type: 'string', nullable: true },
      color: { type: 'string', nullable: true },
      specification: { type: 'text', nullable: true },
      created_at: { type: 'timestamp', default: 'now' },
      updated_at: { type: 'timestamp', default: 'now' }
    }
  },
  teams: {
    name: 'teams',
    schema: {
      id: { type: 'uuid', primaryKey: true },
      organization_id: { type: 'uuid', required: true },
      name: { type: 'string', required: true },
      email: { type: 'string', required: true, unique: true },
      role: { type: 'string', required: true }, // admin, manager, member, guest
      status: { type: 'string', default: 'invited' }, // invited, active, suspended
      joined_at: { type: 'timestamp', default: 'now' },
      invited_by: { type: 'string', nullable: true },
      custom_permissions: { type: 'jsonb', nullable: true }
    }
  },
  agents: {
    name: 'agents',
    schema: {
      id: { type: 'uuid', primaryKey: true },
      name: { type: 'string', required: true },
      description: { type: 'text', nullable: true },
      icon: { type: 'string', nullable: true },
      category: { type: 'string', nullable: true },
      color: { type: 'string', nullable: true },
      code_template: { type: 'text', nullable: true },
      config_schema: { type: 'jsonb', nullable: true },
      table_schemas: { type: 'jsonb', nullable: true },
      dependencies: { type: 'jsonb', nullable: true },
      created_at: { type: 'timestamp', default: 'now' },
      version: { type: 'string', default: '1.0.0' }
    }
  },
  agent_instances: {
    name: 'agent_instances',
    schema: {
      id: { type: 'uuid', primaryKey: true },
      organization_id: { type: 'uuid', required: true },
      agent_id: { type: 'uuid', required: true },
      instance_name: { type: 'string', nullable: true },
      status: { type: 'string', default: 'inactive' }, // inactive, active, error, paused
      config: { type: 'jsonb', nullable: true },
      custom_code: { type: 'text', nullable: true },
      last_run_at: { type: 'timestamp', nullable: true },
      last_error: { type: 'text', nullable: true },
      created_at: { type: 'timestamp', default: 'now' },
      created_by: { type: 'string', nullable: true }
    }
  },
  data_sources: {
    name: 'data_sources',
    schema: {
      id: { type: 'uuid', primaryKey: true },
      organization_id: { type: 'uuid', required: true },
      agent_instance_id: { type: 'uuid', nullable: true },
      name: { type: 'string', required: true },
      type: { type: 'string', required: true }, // api, webhook, database, file, telegram, email
      config: { type: 'jsonb', nullable: true },
      status: { type: 'string', default: 'active' },
      last_sync_at: { type: 'timestamp', nullable: true },
      created_at: { type: 'timestamp', default: 'now' }
    }
  },
  health_checks: {
    name: 'health_checks',
    schema: {
      id: { type: 'uuid', primaryKey: true },
      organization_id: { type: 'uuid', required: true },
      agent_instance_id: { type: 'uuid', nullable: true },
      check_type: { type: 'string', required: true }, // availability, performance, errors
      status: { type: 'string', required: true }, // healthy, warning, critical
      message: { type: 'text', nullable: true },
      metrics: { type: 'jsonb', nullable: true },
      checked_at: { type: 'timestamp', default: 'now' }
    }
  }
}

/**
 * Integram Database Service
 */
class IntegramDatabaseService {
  constructor({ logger } = {}) {
    this.logger = logger || console
    this.initialized = false
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (this.initialized) return

    try {
      await fs.mkdir(INTEGRAM_BASE_DIR, { recursive: true })
      this.initialized = true
      this.logger.info('[IntegramDatabaseService] Initialized successfully')
    } catch (error) {
      this.logger.error('[IntegramDatabaseService] Initialization failed:', error)
      throw new Error(`Failed to initialize IntegramDatabaseService: ${error.message}`)
    }
  }

  /**
   * Ensure service is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * Create a new database for an organization
   * Simulates creating a new Integram database instance
   */
  async createOrganizationDatabase(organizationId, organizationData = {}) {
    await this.ensureInitialized()

    const dbPath = path.join(INTEGRAM_BASE_DIR, organizationId)

    // Check if database already exists
    try {
      await fs.access(dbPath)
      throw new Error(`Database for organization ${organizationId} already exists`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }

    // Create database directory structure
    await fs.mkdir(dbPath, { recursive: true })
    await fs.mkdir(path.join(dbPath, 'tables'), { recursive: true })

    // Run migrations (create system tables)
    for (const tableName of Object.keys(SYSTEM_TABLES)) {
      await this.createTable(organizationId, tableName, SYSTEM_TABLES[tableName].schema)
    }

    // Insert organization record
    if (organizationData.name) {
      await this.insert(organizationId, 'organizations', {
        id: organizationId,
        name: organizationData.name,
        owner_email: organizationData.owner_email || 'unknown',
        icon: organizationData.icon || null,
        color: organizationData.color || null,
        specification: organizationData.specification || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    }

    this.logger.info(`[IntegramDatabaseService] Created database for org: ${organizationId}`)

    return {
      organizationId,
      databasePath: dbPath,
      systemTables: Object.keys(SYSTEM_TABLES),
      created: true
    }
  }

  /**
   * Delete an organization's database
   */
  async deleteOrganizationDatabase(organizationId) {
    await this.ensureInitialized()

    const dbPath = path.join(INTEGRAM_BASE_DIR, organizationId)

    try {
      await fs.rm(dbPath, { recursive: true, force: true })
      this.logger.info(`[IntegramDatabaseService] Deleted database for org: ${organizationId}`)
      return { deleted: true, organizationId }
    } catch (error) {
      this.logger.error(`[IntegramDatabaseService] Failed to delete database:`, error)
      throw new Error(`Failed to delete database for organization ${organizationId}: ${error.message}`)
    }
  }

  /**
   * Check if organization database exists
   */
  async databaseExists(organizationId) {
    await this.ensureInitialized()

    const dbPath = path.join(INTEGRAM_BASE_DIR, organizationId)

    try {
      await fs.access(dbPath)
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Create a new table in the organization's database
   */
  async createTable(organizationId, tableName, schema = {}) {
    await this.ensureInitialized()

    const tablePath = this.getTablePath(organizationId, tableName)

    // Create tables directory if it doesn't exist
    await fs.mkdir(path.dirname(tablePath), { recursive: true })

    // Initialize empty table with schema metadata
    const tableData = {
      _meta: {
        tableName,
        schema,
        created: new Date().toISOString(),
        rowCount: 0
      },
      rows: []
    }

    await fs.writeFile(tablePath, JSON.stringify(tableData, null, 2), 'utf-8')

    this.logger.info(`[IntegramDatabaseService] Created table ${tableName} in org ${organizationId}`)

    return { tableName, created: true }
  }

  /**
   * Deploy agent tables (used when creating agent instances)
   */
  async deployAgentTables(organizationId, agentId, tableSchemas) {
    await this.ensureInitialized()

    const deployedTables = []

    for (const tableSchema of tableSchemas) {
      const tableName = `agent_${agentId}_${tableSchema.name}`

      try {
        await this.createTable(organizationId, tableName, tableSchema.schema || {})
        deployedTables.push(tableName)
      } catch (error) {
        this.logger.error(`[IntegramDatabaseService] Failed to deploy table ${tableName}:`, error)
        throw error
      }
    }

    this.logger.info(`[IntegramDatabaseService] Deployed ${deployedTables.length} tables for agent ${agentId}`)

    return { deployedTables }
  }

  /**
   * Insert a record into a table
   */
  async insert(organizationId, tableName, data) {
    await this.ensureInitialized()

    const tableData = await this.loadTable(organizationId, tableName)

    // Generate ID if not provided
    if (!data.id) {
      data.id = uuidv4()
    }

    // Add timestamps if schema has them
    const now = new Date().toISOString()
    if (tableData._meta.schema?.created_at) {
      data.created_at = data.created_at || now
    }
    if (tableData._meta.schema?.updated_at) {
      data.updated_at = now
    }

    tableData.rows.push(data)
    tableData._meta.rowCount = tableData.rows.length

    await this.saveTable(organizationId, tableName, tableData)

    this.logger.info(`[IntegramDatabaseService] Inserted record into ${tableName}`)

    return data
  }

  /**
   * Find records in a table with optional filtering
   */
  async find(organizationId, tableName, filter = {}) {
    await this.ensureInitialized()

    const tableData = await this.loadTable(organizationId, tableName)

    let results = tableData.rows

    // Apply filters
    for (const [key, value] of Object.entries(filter)) {
      results = results.filter(row => row[key] === value)
    }

    return results
  }

  /**
   * Find a single record by ID
   */
  async findById(organizationId, tableName, id) {
    const results = await this.find(organizationId, tableName, { id })
    return results.length > 0 ? results[0] : null
  }

  /**
   * Update a record
   */
  async update(organizationId, tableName, id, updates) {
    await this.ensureInitialized()

    const tableData = await this.loadTable(organizationId, tableName)

    const index = tableData.rows.findIndex(row => row.id === id)
    if (index === -1) {
      throw new Error(`Record with ID ${id} not found in table ${tableName}`)
    }

    // Update fields
    tableData.rows[index] = {
      ...tableData.rows[index],
      ...updates
    }

    // Update timestamp if schema has it
    if (tableData._meta.schema?.updated_at) {
      tableData.rows[index].updated_at = new Date().toISOString()
    }

    await this.saveTable(organizationId, tableName, tableData)

    this.logger.info(`[IntegramDatabaseService] Updated record ${id} in ${tableName}`)

    return tableData.rows[index]
  }

  /**
   * Delete a record
   */
  async delete(organizationId, tableName, id) {
    await this.ensureInitialized()

    const tableData = await this.loadTable(organizationId, tableName)

    const initialLength = tableData.rows.length
    tableData.rows = tableData.rows.filter(row => row.id !== id)

    if (tableData.rows.length === initialLength) {
      throw new Error(`Record with ID ${id} not found in table ${tableName}`)
    }

    tableData._meta.rowCount = tableData.rows.length

    await this.saveTable(organizationId, tableName, tableData)

    this.logger.info(`[IntegramDatabaseService] Deleted record ${id} from ${tableName}`)

    return { deleted: true, id }
  }

  /**
   * Get table path
   */
  getTablePath(organizationId, tableName) {
    return path.join(INTEGRAM_BASE_DIR, organizationId, 'tables', `${tableName}.json`)
  }

  /**
   * Load table data from file
   */
  async loadTable(organizationId, tableName) {
    const tablePath = this.getTablePath(organizationId, tableName)

    try {
      const data = await fs.readFile(tablePath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Table ${tableName} not found in organization ${organizationId}`)
      }
      throw error
    }
  }

  /**
   * Save table data to file
   */
  async saveTable(organizationId, tableName, tableData) {
    const tablePath = this.getTablePath(organizationId, tableName)
    await fs.writeFile(tablePath, JSON.stringify(tableData, null, 2), 'utf-8')
  }

  /**
   * List all tables in an organization's database
   */
  async listTables(organizationId) {
    await this.ensureInitialized()

    const tablesDir = path.join(INTEGRAM_BASE_DIR, organizationId, 'tables')

    try {
      const files = await fs.readdir(tablesDir)
      const tables = files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))

      return tables
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(organizationId) {
    await this.ensureInitialized()

    const tables = await this.listTables(organizationId)
    const stats = {
      organizationId,
      tableCount: tables.length,
      tables: {}
    }

    for (const tableName of tables) {
      const tableData = await this.loadTable(organizationId, tableName)
      stats.tables[tableName] = {
        rowCount: tableData._meta.rowCount,
        created: tableData._meta.created
      }
    }

    return stats
  }
}

export default IntegramDatabaseService
export { SYSTEM_TABLES }
