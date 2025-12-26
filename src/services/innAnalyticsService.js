import axios from 'axios'

/**
 * INN Analytics Service
 *
 * Provides methods to fetch company data using DataNewton API via backend proxy.
 * Supports both 10-digit (юрлицо) and 12-digit (ИП) INNs.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8082/api'

/**
 * INN Analytics Service Class
 * Uses backend DataNewton endpoint for company search
 */
class INNAnalyticsService {
  constructor() {
    this.apiClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 60000, // DataNewton may take longer
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Add response interceptor for error handling
    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('DataNewton API Error:', error)
        return Promise.reject(this.formatError(error))
      }
    )
  }

  /**
   * Format API errors for user-friendly messages
   */
  formatError(error) {
    if (error.response) {
      const status = error.response.status
      const data = error.response.data

      switch (status) {
        case 400:
          return new Error(data?.error || 'Invalid INN format')
        case 404:
          return new Error('Организация не найдена по указанному ИНН')
        case 500:
          return new Error(data?.error || 'Ошибка сервера. Попробуйте позже')
        default:
          return new Error(data?.error || `API error: ${status}`)
      }
    } else if (error.request) {
      return new Error('Нет ответа от сервера. Проверьте подключение к интернету')
    } else {
      return new Error(error.message || 'Произошла непредвиденная ошибка')
    }
  }

  /**
   * Search company by INN using DataNewton API
   *
   * @param {string} inn - INN (10 or 12 digits)
   * @returns {Promise<Object>} Search results
   */
  async searchByINN(inn) {
    try {
      console.log(`[INN Analytics] Searching company by INN: ${inn}`)

      const response = await this.apiClient.get(`/customer-journey/search-datanewton/${inn}`)

      if (response.data.success && response.data.data) {
        console.log(`[INN Analytics] Company found:`, response.data.data.items?.[0]?.НаимПолнЮЛ)
        return response.data.data
      }

      throw new Error('Организация не найдена')
    } catch (error) {
      console.error('[INN Analytics] Search error:', error.message)
      throw error
    }
  }

  /**
   * Parse company data from DataNewton response to internal format
   *
   * @param {Object} rawData - Raw DataNewton response
   * @returns {Object} Parsed company data
   */
  parseCompanyData(rawData) {
    if (!rawData || !rawData.items || rawData.items.length === 0) {
      return null
    }

    const item = rawData.items[0]

    // Determine if this is ИП (individual entrepreneur) or ЮЛ (legal entity)
    const inn = item.ИНН || ''
    const isIP = inn.length === 12

    return {
      // Basic information
      name: item.НаимПолнЮЛ || item.НаимСокрНаимЮЛ || null,
      shortName: item.НаимСокрНаимЮЛ || null,
      inn: item.ИНН || null,
      ogrn: item.ОГРН || null,
      kpp: item.КПП || null,
      registrationDate: item.ДатаРег || null,
      status: item.Статус || 'active',
      entityType: isIP ? 'ИП' : 'ЮЛ',

      // Address information
      address: item.АдрМНГосРег || null,
      region: item.Регион || null,

      // Activity
      okved: item.ОКВЭДОсн || null,
      activity: item.ВидДеят || null,

      // Source
      source: item.source || 'DataNewton API'
    }
  }

  /**
   * Main method: Get complete company analytics by INN
   * Uses DataNewton API via backend
   *
   * @param {string} inn - INN (10 or 12 digits)
   * @returns {Promise<Object>} Complete analytics data
   */
  async getCompanyByINN(inn) {
    try {
      // Validate INN format
      if (!/^\d{10}$|^\d{12}$/.test(inn)) {
        throw new Error('Неверный формат ИНН. ИНН должен содержать 10 или 12 цифр')
      }

      console.log(`[INN Analytics] Getting company data for INN: ${inn}`)

      const result = await this.searchByINN(inn)

      if (!result || !result.items || result.items.length === 0) {
        return {
          success: false,
          error: 'Организация не найдена по указанному ИНН',
          data: null,
          raw: null
        }
      }

      // Parse and structure the data
      const companyData = this.parseCompanyData(result)

      return {
        success: true,
        data: {
          company: companyData
        },
        raw: result
      }
    } catch (error) {
      console.error('[INN Analytics] Error fetching company data:', error)
      return {
        success: false,
        error: error.message || 'Не удалось получить данные об организации',
        data: null,
        raw: null
      }
    }
  }
}

// Export singleton instance
export const innAnalyticsService = new INNAnalyticsService()

// Export convenient wrapper functions for direct use
export const searchByINN = (inn) => innAnalyticsService.searchByINN(inn)
export const getCompanyByINN = (inn) => innAnalyticsService.getCompanyByINN(inn)

// Export class for testing/customization
export default INNAnalyticsService
