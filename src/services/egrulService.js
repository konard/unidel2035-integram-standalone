import axios from 'axios'

/**
 * EGRUL Service
 *
 * Provides methods to fetch company data from official FNS EGRUL registry.
 * Supports search by INN, OGRN, or company name.
 * Data source: egrul.nalog.ru (official Federal Tax Service registry)
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8082/api'

/**
 * EGRUL Service Class
 * Uses backend EGRUL endpoint for official company data
 */
class EGRULService {
  constructor() {
    this.apiClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Add response interceptor for error handling
    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('EGRUL API Error:', error)
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
          return new Error(data?.error || 'Неверный формат запроса')
        case 404:
          return new Error('Организация не найдена в реестре ЕГРЮЛ')
        case 429:
          return new Error('Слишком много запросов. Попробуйте через минуту')
        case 500:
          return new Error(data?.error || 'Ошибка сервера ЕГРЮЛ. Попробуйте позже')
        default:
          return new Error(data?.error || `Ошибка API: ${status}`)
      }
    } else if (error.request) {
      return new Error('Нет ответа от сервера ЕГРЮЛ. Проверьте подключение')
    } else {
      return new Error(error.message || 'Произошла непредвиденная ошибка')
    }
  }

  /**
   * Search company in EGRUL by INN, OGRN, or name
   *
   * @param {string} query - INN, OGRN, or company name
   * @param {string} type - 'ul' (legal entity) or 'ip' (individual entrepreneur)
   * @returns {Promise<Object>} Search results from official EGRUL
   */
  async searchCompany(query, type = 'ul') {
    try {
      console.log(`[EGRUL Service] Searching company: ${query} (type: ${type})`)

      const response = await this.apiClient.post('/egrul/search', {
        query: query.trim(),
        type
      })

      if (response.data.success && response.data.data) {
        const companyName = response.data.data.company?.name || response.data.data.company?.shortName
        console.log(`[EGRUL Service] Company found:`, companyName)
        return response.data.data
      }

      throw new Error('Организация не найдена в ЕГРЮЛ')
    } catch (error) {
      console.error('[EGRUL Service] Search error:', error.message)
      throw error
    }
  }

  /**
   * Format company data for chat display
   *
   * @param {Object} egrulData - Raw EGRUL response
   * @returns {string} Formatted text for chat
   */
  formatCompanyForChat(egrulData) {
    if (!egrulData || !egrulData.company) {
      return '❌ Данные не найдены в ЕГРЮЛ'
    }

    const { company } = egrulData
    const lines = []

    lines.push('📋 **Данные из ЕГРЮЛ ФНС (официальный реестр)**')
    lines.push('')

    // Main info
    if (company.name) {
      lines.push(`**Наименование:** ${company.name}`)
    }
    if (company.shortName && company.shortName !== company.name) {
      lines.push(`**Краткое наименование:** ${company.shortName}`)
    }

    lines.push('')

    // Identifiers
    if (company.inn) {
      lines.push(`**ИНН:** ${company.inn}`)
    }
    if (company.ogrn) {
      lines.push(`**ОГРН:** ${company.ogrn}`)
    }
    if (company.kpp) {
      lines.push(`**КПП:** ${company.kpp}`)
    }

    lines.push('')

    // Director/CEO
    if (company.director) {
      lines.push(`**Руководитель:** ${company.director}`)
    }

    // Registration
    if (company.registrationDate) {
      lines.push(`**Дата регистрации:** ${company.registrationDate}`)
    }

    // Location
    if (company.region) {
      lines.push(`**Регион:** ${company.region}`)
    }
    if (company.address) {
      lines.push(`**Адрес:** ${company.address}`)
    }

    // Status
    if (company.status) {
      const statusIcon = company.status === 'Действующая' ? '✅' : '⚠️'
      lines.push(`**Статус:** ${statusIcon} ${company.status}`)
    }

    lines.push('')
    lines.push('---')
    lines.push(`🔍 *Источник: ${egrulData.source || 'egrul.nalog.ru'} (официальный реестр ФНС)*`)
    lines.push(`⏰ *Время запроса: ${new Date(egrulData.timestamp).toLocaleString('ru-RU')}*`)

    if (egrulData.official) {
      lines.push('✅ *Официальные проверенные данные*')
    }

    return lines.join('\n')
  }

  /**
   * Main method: Get company data from EGRUL
   *
   * @param {string} query - INN, OGRN, or company name
   * @param {string} type - 'ul' or 'ip'
   * @returns {Promise<Object>} Complete EGRUL data
   */
  async getCompanyData(query, type = 'ul') {
    try {
      // Basic validation
      if (!query || query.trim().length < 3) {
        throw new Error('Запрос должен содержать минимум 3 символа')
      }

      console.log(`[EGRUL Service] Getting company data for: ${query}`)

      const result = await this.searchCompany(query, type)

      if (!result || !result.found) {
        return {
          success: false,
          error: 'Организация не найдена в реестре ЕГРЮЛ',
          data: null,
          formatted: '❌ Организация не найдена в официальном реестре ЕГРЮЛ'
        }
      }

      // Format for chat display
      const formattedText = this.formatCompanyForChat(result)

      return {
        success: true,
        data: result,
        formatted: formattedText
      }
    } catch (error) {
      console.error('[EGRUL Service] Error fetching company data:', error)
      return {
        success: false,
        error: error.message || 'Не удалось получить данные из ЕГРЮЛ',
        data: null,
        formatted: `❌ Ошибка получения данных из ЕГРЮЛ: ${error.message}`
      }
    }
  }
}

// Export singleton instance
export const egrulService = new EGRULService()

// Export convenient wrapper functions
export const searchCompany = (query, type) => egrulService.searchCompany(query, type)
export const getCompanyData = (query, type) => egrulService.getCompanyData(query, type)

// Export class for testing/customization
export default EGRULService
