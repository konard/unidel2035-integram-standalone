#!/usr/bin/env node

/**
 * Setup script for GitHub Integration table in Integram
 *
 * This script creates the necessary table structure for storing
 * GitHub user authentication data in the Integram database.
 *
 * Usage:
 *   node setup-github-integration-table.js
 *
 * Required Environment Variables:
 *   - INTEGRAM_SERVER_URL (default: https://dronedoc.ru)
 *   - INTEGRAM_DATABASE (default: my)
 *   - INTEGRAM_LOGIN
 *   - INTEGRAM_PASSWORD
 */

const https = require('https')
const http = require('http')

// Configuration
const config = {
  serverURL: process.env.INTEGRAM_SERVER_URL || process.env.INTEGRAM_SERVER_URL || 'https://example.integram.io',
  database: process.env.INTEGRAM_DATABASE || 'my',
  login: process.env.INTEGRAM_LOGIN || 'd',
  password: process.env.INTEGRAM_PASSWORD || 'd'
}

// Table IDs (will be created)
const GITHUB_USER_TYPE_ID = 197100

// Requisite type IDs (standard Integram types)
const REQ_TYPE_SHORT = 3   // Short text
const REQ_TYPE_LONG = 2    // Long text
const REQ_TYPE_NUMBER = 13 // Number

// Session state
let sessionToken = null
let xsrfToken = null

/**
 * Make HTTP request to Integram API
 */
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, config.serverURL)
    const isHttps = url.protocol === 'https:'
    const httpModule = isHttps ? https : http

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      rejectUnauthorized: false // For self-signed certificates
    }

    // Add auth headers if we have a session
    if (sessionToken && xsrfToken) {
      options.headers['Cookie'] = `token=${sessionToken}`
      options.headers['X-XSRF-TOKEN'] = xsrfToken
    }

    const req = httpModule.request(options, (res) => {
      let body = ''

      res.on('data', (chunk) => {
        body += chunk
      })

      res.on('end', () => {
        try {
          const response = JSON.parse(body)
          resolve({ status: res.statusCode, data: response, headers: res.headers })
        } catch (error) {
          resolve({ status: res.statusCode, data: body, headers: res.headers })
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    if (data) {
      req.write(JSON.stringify(data))
    }

    req.end()
  })
}

/**
 * Authenticate with Integram
 */
async function authenticate() {
  console.log(`Authenticating with Integram at ${config.serverURL}...`)

  const response = await makeRequest('POST', `/api/auth/login`, {
    database: config.database,
    login: config.login,
    password: config.password
  })

  if (response.status !== 200) {
    throw new Error(`Authentication failed: ${JSON.stringify(response.data)}`)
  }

  // Extract session tokens from cookies
  const cookies = response.headers['set-cookie'] || []
  for (const cookie of cookies) {
    if (cookie.startsWith('token=')) {
      sessionToken = cookie.split(';')[0].split('=')[1]
    }
    if (cookie.startsWith('XSRF-TOKEN=')) {
      xsrfToken = cookie.split(';')[0].split('=')[1]
    }
  }

  if (!sessionToken || !xsrfToken) {
    throw new Error('Failed to obtain session tokens')
  }

  console.log('✓ Authentication successful')
}

/**
 * Create GitHub Users table
 */
async function createGitHubUsersTable() {
  console.log('\nCreating GitHub Users table...')

  try {
    // Create type
    const createTypeResponse = await makeRequest('POST', '/api/types', {
      name: 'GitHub Пользователи',
      baseTypeId: 1, // Independent type
      unique: false
    })

    if (createTypeResponse.status !== 200) {
      throw new Error(`Failed to create table: ${JSON.stringify(createTypeResponse.data)}`)
    }

    const typeId = createTypeResponse.data.id
    console.log(`✓ Created table with ID: ${typeId}`)

    // Add requisites (columns)
    const requisites = [
      { name: 'User ID', type: REQ_TYPE_NUMBER, description: 'DronDoc User ID' },
      { name: 'Login', type: REQ_TYPE_SHORT, description: 'GitHub username' },
      { name: 'Name', type: REQ_TYPE_SHORT, description: 'GitHub display name' },
      { name: 'Avatar URL', type: REQ_TYPE_SHORT, description: 'GitHub avatar URL' },
      { name: 'Bio', type: REQ_TYPE_LONG, description: 'GitHub bio' },
      { name: 'Followers', type: REQ_TYPE_NUMBER, description: 'Follower count' },
      { name: 'Public Repos', type: REQ_TYPE_NUMBER, description: 'Public repository count' },
      { name: 'Token', type: REQ_TYPE_SHORT, description: 'GitHub access token (encrypted)' },
      { name: 'Last Sync', type: REQ_TYPE_SHORT, description: 'Last synchronization date' }
    ]

    for (const req of requisites) {
      const addReqResponse = await makeRequest('POST', `/api/types/${typeId}/requisites`, {
        requisiteTypeId: req.type
      })

      if (addReqResponse.status !== 200) {
        throw new Error(`Failed to add requisite: ${JSON.stringify(addReqResponse.data)}`)
      }

      const reqId = addReqResponse.data.id

      // Set requisite alias
      await makeRequest('PUT', `/api/requisites/${reqId}/alias`, {
        alias: req.name
      })

      console.log(`✓ Added requisite: ${req.name} (ID: ${reqId})`)
    }

    console.log('\n✅ GitHub Users table created successfully!')
    console.log(`\nTable ID: ${typeId}`)
    console.log('You can now use this table to store GitHub user data.')

    return typeId

  } catch (error) {
    console.error('❌ Error creating table:', error.message)
    throw error
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('='.repeat(60))
    console.log('GitHub Integration Table Setup for Integram')
    console.log('='.repeat(60))

    await authenticate()
    await createGitHubUsersTable()

    console.log('\n' + '='.repeat(60))
    console.log('Setup completed successfully!')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message)
    process.exit(1)
  }
}

// Run the setup
main()
