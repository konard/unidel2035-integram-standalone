#!/usr/bin/env node
/**
 * Manifest Validation Script
 *
 * Validates all agent manifests for:
 * - Correct YAML structure
 * - Required fields present
 * - No cyclic dependencies
 * - Valid criticality levels
 * - Consistent naming conventions
 */

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import graphlib from 'graphlib'
const { Graph, alg } = graphlib

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Support running from either scripts/ or backend/monolith/
const MANIFESTS_DIR = process.cwd().includes('backend/monolith')
  ? path.join(process.cwd(), 'src/agents/manifests')
  : path.join(__dirname, '../backend/monolith/src/agents/manifests')

const VALID_CRITICALITY_LEVELS = ['low', 'medium', 'high', 'critical']

class ManifestValidator {
  constructor() {
    this.manifests = new Map()
    this.errors = []
    this.warnings = []
    this.graph = new Graph()
  }

  /**
   * Load all manifest files
   */
  async loadManifests() {
    console.log(`📁 Loading manifests from: ${MANIFESTS_DIR}\n`)

    const files = await fs.readdir(MANIFESTS_DIR)
    const yamlFiles = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))

    console.log(`Found ${yamlFiles.length} manifest files\n`)

    for (const file of yamlFiles) {
      // Skip example and README files
      if (file === 'example-agent.yml' || file === 'README.md') {
        continue
      }

      const filePath = path.join(MANIFESTS_DIR, file)
      const content = await fs.readFile(filePath, 'utf8')

      try {
        const manifest = yaml.load(content)

        if (!manifest || !manifest.agent) {
          this.errors.push(`${file}: Missing 'agent' root key`)
          continue
        }

        this.manifests.set(file, manifest.agent)
        console.log(`✅ Loaded: ${file}`)
      } catch (error) {
        this.errors.push(`${file}: YAML parse error - ${error.message}`)
      }
    }

    console.log(`\n📊 Loaded ${this.manifests.size} manifests successfully\n`)
  }

  /**
   * Validate individual manifest structure
   */
  validateManifestStructure() {
    console.log('🔍 Validating manifest structure...\n')

    for (const [file, manifest] of this.manifests) {
      // Required fields
      if (!manifest.id) {
        this.errors.push(`${file}: Missing required field 'agent.id'`)
      }

      if (!manifest.name) {
        this.errors.push(`${file}: Missing required field 'agent.name'`)
      }

      if (!manifest.version) {
        this.errors.push(`${file}: Missing required field 'agent.version'`)
      }

      // Criticality level
      if (manifest.criticality && !VALID_CRITICALITY_LEVELS.includes(manifest.criticality)) {
        this.errors.push(
          `${file}: Invalid criticality '${manifest.criticality}'. ` +
          `Must be one of: ${VALID_CRITICALITY_LEVELS.join(', ')}`
        )
      }

      // Dependencies structure
      if (manifest.dependencies) {
        if (!Array.isArray(manifest.dependencies.required)) {
          this.warnings.push(`${file}: dependencies.required should be an array`)
        }
        if (!Array.isArray(manifest.dependencies.optional)) {
          this.warnings.push(`${file}: dependencies.optional should be an array`)
        }
      }

      // Capabilities
      if (manifest.provides && manifest.provides.capabilities) {
        if (!Array.isArray(manifest.provides.capabilities)) {
          this.errors.push(`${file}: provides.capabilities must be an array`)
        }
      }

      // Config validation
      if (manifest.config) {
        if (manifest.config.startup && typeof manifest.config.startup.timeout !== 'number') {
          this.warnings.push(`${file}: config.startup.timeout should be a number`)
        }

        if (manifest.config.resources && typeof manifest.config.resources.maxConcurrentTasks !== 'number') {
          this.warnings.push(`${file}: config.resources.maxConcurrentTasks should be a number`)
        }
      }

      // Self-healing
      if (manifest.selfHealing && typeof manifest.selfHealing.enabled !== 'boolean') {
        this.warnings.push(`${file}: selfHealing.enabled should be a boolean`)
      }
    }

    if (this.errors.length === 0) {
      console.log('✅ All manifests have valid structure\n')
    }
  }

  /**
   * Build dependency graph and check for cycles
   */
  validateDependencies() {
    console.log('🔗 Building dependency graph...\n')

    // Add all agents as nodes
    for (const [file, manifest] of this.manifests) {
      this.graph.setNode(manifest.id, { file, manifest })
    }

    // Add dependency edges
    for (const [file, manifest] of this.manifests) {
      const requiredDeps = manifest.dependencies?.required || []
      const optionalDeps = manifest.dependencies?.optional || []

      for (const depId of requiredDeps) {
        if (!this.graph.hasNode(depId)) {
          this.errors.push(
            `${file}: Required dependency '${depId}' not found in manifests`
          )
          continue
        }

        // Edge from dependency to dependent (dependency must start first)
        this.graph.setEdge(depId, manifest.id)
      }

      for (const depId of optionalDeps) {
        if (!this.graph.hasNode(depId)) {
          this.warnings.push(
            `${file}: Optional dependency '${depId}' not found in manifests`
          )
        }
      }
    }

    console.log(`Graph: ${this.graph.nodeCount()} nodes, ${this.graph.edgeCount()} edges\n`)

    // Check for cycles
    if (!alg.isAcyclic(this.graph)) {
      const cycles = alg.findCycles(this.graph)
      this.errors.push(
        `❌ CYCLIC DEPENDENCIES DETECTED:\n` +
        cycles.map(cycle => `   ${cycle.join(' -> ')}`).join('\n')
      )
    } else {
      console.log('✅ No cyclic dependencies found\n')
    }

    // Calculate topological sort (start order)
    try {
      const startOrder = alg.topsort(this.graph)
      console.log('📋 Suggested start order (topological sort):')
      startOrder.forEach((agentId, index) => {
        const node = this.graph.node(agentId)
        const criticality = node.manifest.criticality || 'unknown'
        console.log(`   ${index + 1}. ${agentId} (${criticality})`)
      })
      console.log()
    } catch (error) {
      this.errors.push(`Failed to calculate start order: ${error.message}`)
    }
  }

  /**
   * Generate report
   */
  generateReport() {
    console.log('\n' + '='.repeat(80))
    console.log('📊 VALIDATION REPORT')
    console.log('='.repeat(80) + '\n')

    console.log(`Total manifests: ${this.manifests.size}`)
    console.log(`Errors: ${this.errors.length}`)
    console.log(`Warnings: ${this.warnings.length}\n`)

    if (this.errors.length > 0) {
      console.log('❌ ERRORS:\n')
      this.errors.forEach(error => console.log(`   ${error}`))
      console.log()
    }

    if (this.warnings.length > 0) {
      console.log('⚠️  WARNINGS:\n')
      this.warnings.forEach(warning => console.log(`   ${warning}`))
      console.log()
    }

    // Criticality distribution
    const criticalityCount = { low: 0, medium: 0, high: 0, critical: 0 }
    for (const [, manifest] of this.manifests) {
      const level = manifest.criticality || 'medium'
      criticalityCount[level]++
    }

    console.log('📈 Criticality Distribution:')
    console.log(`   Critical: ${criticalityCount.critical}`)
    console.log(`   High:     ${criticalityCount.high}`)
    console.log(`   Medium:   ${criticalityCount.medium}`)
    console.log(`   Low:      ${criticalityCount.low}\n`)

    // Final result
    if (this.errors.length === 0) {
      console.log('✅ ALL VALIDATIONS PASSED!\n')
      return 0
    } else {
      console.log('❌ VALIDATION FAILED - Please fix the errors above\n')
      return 1
    }
  }

  /**
   * Run all validations
   */
  async run() {
    try {
      await this.loadManifests()
      this.validateManifestStructure()
      this.validateDependencies()
      return this.generateReport()
    } catch (error) {
      console.error('❌ Validation failed with error:', error.message)
      console.error(error.stack)
      return 1
    }
  }
}

// Run validation
const validator = new ManifestValidator()
validator.run().then(exitCode => {
  process.exit(exitCode)
})
