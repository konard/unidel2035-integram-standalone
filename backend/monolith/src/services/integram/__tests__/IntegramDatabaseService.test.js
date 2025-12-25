/**
 * Unit tests for IntegramDatabaseService
 *
 * Issue #3112 - Phase 0: Infrastructure preparation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import IntegramDatabaseService from '../IntegramDatabaseService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Use test-specific data directory
const TEST_DATA_DIR = path.join(__dirname, '../../../../data/integram_test')
process.env.INTEGRAM_BASE_DIR = TEST_DATA_DIR

describe('IntegramDatabaseService', () => {
  let service

  beforeEach(async () => {
    service = new IntegramDatabaseService()
    await service.initialize()
  })

  afterEach(async () => {
    // Cleanup test data
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true })
    } catch (error) {
      // Ignore errors
    }
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      expect(service.initialized).toBe(true)
    })

    it('should not reinitialize if already initialized', async () => {
      const firstInit = service.initialized
      await service.initialize()
      expect(service.initialized).toBe(firstInit)
    })
  })

  describe('createOrganizationDatabase', () => {
    it('should create organization database with system tables', async () => {
      const orgId = 'test-org-123'
      const orgData = {
        name: 'Test Organization',
        owner_email: 'test@example.com'
      }

      const result = await service.createOrganizationDatabase(orgId, orgData)

      expect(result.created).toBe(true)
      expect(result.organizationId).toBe(orgId)
      expect(result.systemTables).toContain('organizations')
      expect(result.systemTables).toContain('teams')
      expect(result.systemTables).toContain('agents')
      expect(result.systemTables).toContain('agent_instances')
    })

    it('should throw error if database already exists', async () => {
      const orgId = 'test-org-456'
      await service.createOrganizationDatabase(orgId, { name: 'Test' })

      await expect(
        service.createOrganizationDatabase(orgId, { name: 'Test' })
      ).rejects.toThrow('already exists')
    })
  })

  describe('databaseExists', () => {
    it('should return true for existing database', async () => {
      const orgId = 'test-org-789'
      await service.createOrganizationDatabase(orgId, { name: 'Test' })

      const exists = await service.databaseExists(orgId)
      expect(exists).toBe(true)
    })

    it('should return false for non-existing database', async () => {
      const exists = await service.databaseExists('non-existing-org')
      expect(exists).toBe(false)
    })
  })

  describe('createTable', () => {
    beforeEach(async () => {
      await service.createOrganizationDatabase('test-org', { name: 'Test' })
    })

    it('should create table successfully', async () => {
      const result = await service.createTable('test-org', 'test_table', {
        id: { type: 'uuid', primaryKey: true },
        name: { type: 'string', required: true }
      })

      expect(result.created).toBe(true)
      expect(result.tableName).toBe('test_table')
    })

    it('should load created table', async () => {
      await service.createTable('test-org', 'test_table', {})

      const tableData = await service.loadTable('test-org', 'test_table')

      expect(tableData._meta.tableName).toBe('test_table')
      expect(tableData.rows).toEqual([])
    })
  })

  describe('insert', () => {
    beforeEach(async () => {
      await service.createOrganizationDatabase('test-org', { name: 'Test' })
      await service.createTable('test-org', 'users', {
        id: { type: 'uuid', primaryKey: true },
        name: { type: 'string', required: true },
        created_at: { type: 'timestamp', default: 'now' }
      })
    })

    it('should insert record successfully', async () => {
      const data = { name: 'John Doe' }

      const inserted = await service.insert('test-org', 'users', data)

      expect(inserted.id).toBeDefined()
      expect(inserted.name).toBe('John Doe')
      expect(inserted.created_at).toBeDefined()
    })

    it('should generate UUID if id not provided', async () => {
      const data = { name: 'Jane Doe' }

      const inserted = await service.insert('test-org', 'users', data)

      expect(inserted.id).toBeDefined()
      expect(typeof inserted.id).toBe('string')
    })
  })

  describe('find', () => {
    beforeEach(async () => {
      await service.createOrganizationDatabase('test-org', { name: 'Test' })
      await service.createTable('test-org', 'products', {})
      await service.insert('test-org', 'products', { name: 'Product 1', price: 100 })
      await service.insert('test-org', 'products', { name: 'Product 2', price: 200 })
      await service.insert('test-org', 'products', { name: 'Product 3', price: 100 })
    })

    it('should find all records without filter', async () => {
      const results = await service.find('test-org', 'products')

      expect(results.length).toBe(3)
    })

    it('should filter records by attribute', async () => {
      const results = await service.find('test-org', 'products', { price: 100 })

      expect(results.length).toBe(2)
      expect(results.every(r => r.price === 100)).toBe(true)
    })
  })

  describe('findById', () => {
    beforeEach(async () => {
      await service.createOrganizationDatabase('test-org', { name: 'Test' })
      await service.createTable('test-org', 'items', {})
    })

    it('should find record by ID', async () => {
      const inserted = await service.insert('test-org', 'items', { name: 'Item 1' })

      const found = await service.findById('test-org', 'items', inserted.id)

      expect(found).toBeDefined()
      expect(found.id).toBe(inserted.id)
      expect(found.name).toBe('Item 1')
    })

    it('should return null if not found', async () => {
      const found = await service.findById('test-org', 'items', 'non-existing-id')

      expect(found).toBeNull()
    })
  })

  describe('update', () => {
    beforeEach(async () => {
      await service.createOrganizationDatabase('test-org', { name: 'Test' })
      await service.createTable('test-org', 'posts', {
        updated_at: { type: 'timestamp', default: 'now' }
      })
    })

    it('should update record successfully', async () => {
      const inserted = await service.insert('test-org', 'posts', { title: 'Original' })

      const updated = await service.update('test-org', 'posts', inserted.id, { title: 'Updated' })

      expect(updated.title).toBe('Updated')
      expect(updated.updated_at).toBeDefined()
    })

    it('should throw error if record not found', async () => {
      await expect(
        service.update('test-org', 'posts', 'non-existing-id', { title: 'Test' })
      ).rejects.toThrow('not found')
    })
  })

  describe('delete', () => {
    beforeEach(async () => {
      await service.createOrganizationDatabase('test-org', { name: 'Test' })
      await service.createTable('test-org', 'comments', {})
    })

    it('should delete record successfully', async () => {
      const inserted = await service.insert('test-org', 'comments', { text: 'Hello' })

      const result = await service.delete('test-org', 'comments', inserted.id)

      expect(result.deleted).toBe(true)
      expect(result.id).toBe(inserted.id)
    })

    it('should throw error if record not found', async () => {
      await expect(
        service.delete('test-org', 'comments', 'non-existing-id')
      ).rejects.toThrow('not found')
    })

    it('should reduce row count after deletion', async () => {
      const inserted = await service.insert('test-org', 'comments', { text: 'Hello' })

      await service.delete('test-org', 'comments', inserted.id)

      const tableData = await service.loadTable('test-org', 'comments')
      expect(tableData._meta.rowCount).toBe(0)
    })
  })

  describe('deleteOrganizationDatabase', () => {
    it('should delete organization database', async () => {
      const orgId = 'test-org-to-delete'
      await service.createOrganizationDatabase(orgId, { name: 'Test' })

      const result = await service.deleteOrganizationDatabase(orgId)

      expect(result.deleted).toBe(true)
      expect(await service.databaseExists(orgId)).toBe(false)
    })
  })

  describe('listTables', () => {
    beforeEach(async () => {
      await service.createOrganizationDatabase('test-org', { name: 'Test' })
    })

    it('should list all tables in database', async () => {
      const tables = await service.listTables('test-org')

      expect(tables).toContain('organizations')
      expect(tables).toContain('teams')
      expect(tables).toContain('agents')
    })
  })

  describe('deployAgentTables', () => {
    beforeEach(async () => {
      await service.createOrganizationDatabase('test-org', { name: 'Test' })
    })

    it('should deploy multiple agent tables', async () => {
      const tableSchemas = [
        { name: 'data', schema: { id: { type: 'uuid' } } },
        { name: 'config', schema: { key: { type: 'string' } } }
      ]

      const result = await service.deployAgentTables('test-org', 'agent-123', tableSchemas)

      expect(result.deployedTables).toHaveLength(2)
      expect(result.deployedTables[0]).toContain('agent_agent-123_data')
      expect(result.deployedTables[1]).toContain('agent_agent-123_config')
    })
  })

  describe('getDatabaseStats', () => {
    beforeEach(async () => {
      await service.createOrganizationDatabase('test-org', { name: 'Test' })
      await service.insert('test-org', 'organizations', { name: 'Test Org' })
      await service.insert('test-org', 'agents', { name: 'Agent 1' })
      await service.insert('test-org', 'agents', { name: 'Agent 2' })
    })

    it('should return database statistics', async () => {
      const stats = await service.getDatabaseStats('test-org')

      expect(stats.organizationId).toBe('test-org')
      expect(stats.tableCount).toBeGreaterThan(0)
      expect(stats.tables.organizations.rowCount).toBe(1)
      expect(stats.tables.agents.rowCount).toBe(2)
    })
  })
})
