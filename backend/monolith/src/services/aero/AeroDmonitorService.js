/**
 * AeroDmonitor Integration Service
 *
 * Integrates aero-monitoring application with dmonitor Integram database.
 * Issue #5263 - Интегрируй https://proxy.drondoc.ru/aero-monitoring с базой данных
 *
 * Database: dmonitor
 * Table: Дроны (ID: 298)
 * Credentials: login=d, password=d
 *
 * Table Structure:
 * - ID 299 (Серийный номер) - Serial Number - type SHORT
 * - ID 300 (Модель) - Model - type SHORT
 * - ID 301 (Статус) - Status - type SHORT
 * - ID 302 (Дата регистрации) - Registration Date - type DATETIME
 */

import axios from 'axios'
import logger from '../../utils/logger.js'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'

const INTEGRAM_BASE_URL = process.env.INTEGRAM_API_URL || 'https://dronedoc.ru'
const DATABASE = 'dmonitor'
const DRONES_TABLE_ID = 298

// Requisite IDs from database structure
const REQUISITES = {
  SERIAL_NUMBER: '299',  // Серийный номер
  MODEL: '300',          // Модель
  STATUS: '301',         // Статус
  REGISTRATION_DATE: '302' // Дата регистрации
}

export class AeroDmonitorService {
  constructor() {
    this.baseUrl = INTEGRAM_BASE_URL
    this.database = DATABASE
    this.session = null

    // Create axios client with cookie support
    this.jar = new CookieJar()
    this.client = wrapper(axios.create({ jar: this.jar, withCredentials: true }))
  }

  /**
   * Build Integram API URL
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @returns {string} Complete URL
   */
  buildUrl(endpoint, params = {}) {
    const url = `${this.baseUrl}/${this.database}/${endpoint}`
    const queryParams = new URLSearchParams({ JSON_KV: '', ...params })
    return `${url}?${queryParams.toString()}`
  }

  /**
   * Authenticate with Integram
   * @param {string} username - Username (default: 'd')
   * @param {string} password - Password (default: 'd')
   * @returns {Promise<Object>} Session data
   */
  async authenticate(username = 'd', password = 'd') {
    try {
      const url = this.buildUrl('auth')

      logger.info({ database: this.database, username }, 'Authenticating with Integram dmonitor')

      const formData = new URLSearchParams()
      formData.append('login', username)
      formData.append('pwd', password)

      const response = await this.client.post(url, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

      if (response.data && response.data.failed) {
        throw new Error(`Wrong credentials for user ${username} in ${this.database}. Please send login and password as POST-parameters.`)
      }

      this.session = {
        token: response.data.token,
        xsrf: response.data._xsrf,
        userId: response.data.id,
        user: response.data.user || username,
        cookies: response.headers['set-cookie']
      }

      logger.info({ userId: this.session.userId }, 'Successfully authenticated with dmonitor')
      return this.session
    } catch (error) {
      logger.error({ error: error.message }, 'Integram authentication failed')
      throw new Error(`Integram authentication failed: ${error.message}`)
    }
  }

  /**
   * Ensure authenticated (auto-authenticate if needed)
   */
  async ensureAuthenticated() {
    if (!this.session) {
      await this.authenticate()
    }
  }

  /**
   * Get headers for authenticated requests
   * @returns {Object} Request headers
   */
  getAuthHeaders() {
    if (!this.session) {
      throw new Error('Not authenticated. Call authenticate() first.')
    }

    const headers = {}

    // Add token if available
    if (this.session.token) {
      headers['X-Authorization'] = this.session.token
    }

    // Add cookies if available
    if (this.session.cookies && this.session.cookies.length > 0) {
      headers['Cookie'] = this.session.cookies.join('; ')
    }

    return headers
  }

  /**
   * Get all drones from Integram database
   * @param {Object} params - Query parameters
   * @returns {Promise<Array>} Array of drones
   */
  async getDrones(params = {}) {
    await this.ensureAuthenticated()

    try {
      const url = this.buildUrl(`object/${DRONES_TABLE_ID}`, {
        offset: params.offset || 0,
        limit: params.limit || 100
      })

      const response = await this.client.get(url, {
        headers: this.getAuthHeaders()
      })

      const data = response.data
      const drones = []

      // Parse Integram response format
      if (data.object && Array.isArray(data.object)) {
        for (const obj of data.object) {
          const reqs = data.reqs?.[obj.id] || {}

          const drone = {
            id: parseInt(obj.id),
            name: obj.val, // Drone name from main value
            model: reqs[REQUISITES.MODEL] || '',
            serial_number: reqs[REQUISITES.SERIAL_NUMBER] || '',
            status: reqs[REQUISITES.STATUS] || 'Active',
            registration_date: reqs[REQUISITES.REGISTRATION_DATE] || null,
            // Additional fields for compatibility with frontend
            battery_level: 100, // Not in database yet
            flight_time: 0, // Not in database yet
            last_latitude: null, // Not in database yet
            last_longitude: null, // Not in database yet
            last_maintenance: reqs[REQUISITES.REGISTRATION_DATE] || null,
            created_at: reqs[REQUISITES.REGISTRATION_DATE] || new Date().toISOString()
          }

          drones.push(drone)
        }
      }

      logger.info({ count: drones.length }, 'Fetched drones from dmonitor')
      return drones
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get drones from Integram')
      throw error
    }
  }

  /**
   * Get single drone by ID
   * @param {number|string} id - Drone ID
   * @returns {Promise<Object>} Drone data
   */
  async getDrone(id) {
    await this.ensureAuthenticated()

    try {
      const url = this.buildUrl(`_m_get/${id}`)

      const response = await this.client.get(url, {
        headers: this.getAuthHeaders()
      })

      const data = response.data

      if (!data || !data.obj) {
        throw new Error('Drone not found')
      }

      const obj = data.obj
      const reqs = data.reqs || {}

      const drone = {
        id: parseInt(obj.id),
        name: obj.val,
        model: reqs[REQUISITES.MODEL]?.value || '',
        serial_number: reqs[REQUISITES.SERIAL_NUMBER]?.value || '',
        status: reqs[REQUISITES.STATUS]?.value || 'Active',
        registration_date: reqs[REQUISITES.REGISTRATION_DATE]?.value || null,
        battery_level: 100,
        flight_time: 0,
        last_latitude: null,
        last_longitude: null,
        last_maintenance: reqs[REQUISITES.REGISTRATION_DATE]?.value || null,
        created_at: reqs[REQUISITES.REGISTRATION_DATE]?.value || new Date().toISOString()
      }

      return drone
    } catch (error) {
      logger.error({ error: error.message, id }, 'Failed to get drone from Integram')
      throw error
    }
  }

  /**
   * Create new drone
   * @param {Object} droneData - Drone information
   * @returns {Promise<Object>} Created drone
   */
  async createDrone(droneData) {
    await this.ensureAuthenticated()

    try {
      const url = this.buildUrl('_m_new')

      const formData = new URLSearchParams()
      formData.append('type', DRONES_TABLE_ID)
      formData.append('value', droneData.name)
      formData.append('_xsrf', this.session.xsrf)
      formData.append('up', '1') // Independent object

      const response = await this.client.post(url, formData, {
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      // Extract ID from response (could be response.data.id or response.data)
      const newId = response.data.id || response.data

      // Set requisites
      await this.updateDroneRequisites(newId, droneData)

      logger.info({ id: newId, name: droneData.name }, 'Created drone in dmonitor')

      // Fetch the created drone to get complete data
      const createdDrone = await this.getDrone(newId)

      return createdDrone
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to create drone in Integram')
      throw error
    }
  }

  /**
   * Update drone requisites
   * @param {number|string} id - Drone ID
   * @param {Object} droneData - Drone data
   * @returns {Promise<void>}
   */
  async updateDroneRequisites(id, droneData) {
    await this.ensureAuthenticated()

    try {
      const url = this.buildUrl('_m_save')

      const formData = new URLSearchParams()
      formData.append('id', id)
      formData.append('_xsrf', this.session.xsrf)

      // Set requisites if provided
      if (droneData.serial_number || droneData.serialNumber) {
        formData.append(REQUISITES.SERIAL_NUMBER, droneData.serial_number || droneData.serialNumber)
      }
      if (droneData.model) {
        formData.append(REQUISITES.MODEL, droneData.model)
      }
      if (droneData.status) {
        formData.append(REQUISITES.STATUS, droneData.status)
      }
      if (droneData.registration_date || droneData.registrationDate) {
        formData.append(REQUISITES.REGISTRATION_DATE, droneData.registration_date || droneData.registrationDate)
      } else {
        // Set current date if not provided
        formData.append(REQUISITES.REGISTRATION_DATE, new Date().toISOString())
      }

      await this.client.post(url, formData, {
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      logger.info({ id }, 'Updated drone requisites in dmonitor')
    } catch (error) {
      logger.error({ error: error.message, id }, 'Failed to update drone requisites')
      throw error
    }
  }

  /**
   * Update existing drone
   * @param {number|string} id - Drone ID
   * @param {Object} droneData - Updated drone information
   * @returns {Promise<Object>} Updated drone
   */
  async updateDrone(id, droneData) {
    await this.ensureAuthenticated()

    try {
      // Update main value if name changed
      if (droneData.name) {
        const url = this.buildUrl('_d_save')

        const formData = new URLSearchParams()
        formData.append('id', id)
        formData.append('value', droneData.name)
        formData.append('_xsrf', this.session.xsrf)

        await this.client.post(url, formData, {
          headers: {
            ...this.getAuthHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      }

      // Update requisites
      await this.updateDroneRequisites(id, droneData)

      logger.info({ id }, 'Updated drone in dmonitor')

      return {
        id,
        ...droneData
      }
    } catch (error) {
      logger.error({ error: error.message, id }, 'Failed to update drone in Integram')
      throw error
    }
  }

  /**
   * Delete drone
   * @param {number|string} id - Drone ID
   * @returns {Promise<Object>} Success response
   */
  async deleteDrone(id) {
    await this.ensureAuthenticated()

    try {
      const url = this.buildUrl('_d_del')

      const formData = new URLSearchParams()
      formData.append('id', id)
      formData.append('_xsrf', this.session.xsrf)

      await this.client.post(url, formData, {
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      logger.info({ id }, 'Deleted drone from dmonitor')

      return {
        success: true,
        message: 'Drone deleted successfully'
      }
    } catch (error) {
      logger.error({ error: error.message, id }, 'Failed to delete drone from Integram')
      throw error
    }
  }

  /**
   * Get fleet statistics
   * @returns {Promise<Object>} Fleet statistics
   */
  async getFleetStats() {
    const drones = await this.getDrones({ limit: 1000 })

    const stats = {
      total: drones.length,
      active: drones.filter(d => d.status === 'Active' || d.status === 'Активен').length,
      maintenance: drones.filter(d => d.status === 'Maintenance' || d.status === 'На обслуживании').length,
      retired: drones.filter(d => d.status === 'Retired' || d.status === 'Списан').length,
      totalFlightTime: drones.reduce((sum, d) => sum + (d.flight_time || 0), 0)
    }

    return stats
  }
}

export default AeroDmonitorService
