/**
 * FSSP Service (Federal Bailiff Service / ФССП)
 * Checks for debts and enforcement proceedings by INN
 *
 * Uses backend proxy to access FSSP API
 * API docs: https://api-ip.fssp.gov.ru/
 */

const API_BASE_URL = import.meta.env.VITE_ORCHESTRATOR_URL || '/api'

/**
 * Search for debts by company INN
 * @param {string} inn - Company INN (10 digits)
 * @returns {Promise<Object>} Search result
 */
export async function searchByINN(inn) {
  try {
    const response = await fetch(`${API_BASE_URL}/fssp/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'legal',  // legal entity
        inn: inn
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    const data = await response.json()
    return {
      success: true,
      data: data
    }
  } catch (error) {
    console.error('[FSSP Service] Error:', error)
    return {
      success: false,
      error: error.message || 'Ошибка при проверке долгов в ФССП',
      data: null
    }
  }
}

/**
 * Search for debts by person (physical entity)
 * @param {string} lastName - Last name
 * @param {string} firstName - First name
 * @param {string} middleName - Middle name (optional)
 * @param {string} birthDate - Birth date (DD.MM.YYYY)
 * @param {string} region - Region code (optional)
 * @returns {Promise<Object>} Search result
 */
export async function searchByPerson(lastName, firstName, middleName = '', birthDate = '', region = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/fssp/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'physical',
        lastName,
        firstName,
        middleName,
        birthDate,
        region
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    const data = await response.json()
    return {
      success: true,
      data: data
    }
  } catch (error) {
    console.error('[FSSP Service] Error:', error)
    return {
      success: false,
      error: error.message || 'Ошибка при проверке долгов в ФССП',
      data: null
    }
  }
}

/**
 * Parse debt check request from user message
 * Supports:
 * - "долги ИНН 1234567890"
 * - "фссп 1234567890"
 * - "проверить долги 1234567890"
 * - "исполнительные производства ИНН"
 * @param {string} message - User message
 * @returns {Object|null} Parsed request or null
 */
export function parseDebtRequest(message) {
  const normalizedMessage = message.toLowerCase().trim()

  // Patterns for debt check (note: \w doesn't work with Cyrillic, use explicit patterns)
  const patterns = [
    // "долги 7707083893", "долг инн 7707083893", "фссп 7707083893"
    /(?:долг[иа]?|фссп|проверить\s*долг[иа]?|задолженност[ьи]?|исполнительн[ыое]+\s*производств[аоы]?)\s*(?:инн\s*)?(\d{10}|\d{12})/i,
    // "7707083893 долги", "инн 7707083893 долги"
    /(?:инн\s*)?(\d{10}|\d{12})\s*(?:долг[иа]?|фссп|задолженност[ьи]?)/i
  ]

  for (const pattern of patterns) {
    const match = normalizedMessage.match(pattern)
    if (match) {
      const inn = match[1]
      // Validate INN length (10 for legal, 12 for physical)
      if (inn.length === 10 || inn.length === 12) {
        return {
          type: inn.length === 10 ? 'legal' : 'physical',
          inn: inn
        }
      }
    }
  }

  return null
}

/**
 * Format debt search result for display
 * @param {Object} result - Search result from searchByINN
 * @param {string} inn - INN that was searched
 * @returns {string} Formatted markdown string
 */
export function formatDebtResult(result, inn) {
  if (!result.success) {
    return `❌ Ошибка проверки долгов по ИНН ${inn}: ${result.error}`
  }

  const data = result.data

  // No debts found
  if (!data.result || data.result.length === 0) {
    return `✅ **Проверка долгов ФССП**

🔍 **ИНН:** ${inn}
📋 **Результат:** Исполнительные производства не найдены

_Данные актуальны на момент запроса. Источник: ФССП России_`
  }

  // Debts found
  const debts = data.result
  const totalDebt = debts.reduce((sum, d) => sum + (parseFloat(d.ip_sum) || 0), 0)

  let response = `⚠️ **Проверка долгов ФССП**

🔍 **ИНН:** ${inn}
📊 **Найдено производств:** ${debts.length}
💰 **Общая сумма:** ${totalDebt.toLocaleString('ru-RU')} ₽

---
**Исполнительные производства:**
`

  debts.slice(0, 5).forEach((debt, index) => {
    response += `
**${index + 1}. ${debt.ip_subject || 'Без описания'}**
- Номер ИП: ${debt.ip_number || 'Н/Д'}
- Сумма: ${parseFloat(debt.ip_sum || 0).toLocaleString('ru-RU')} ₽
- Дата возбуждения: ${debt.ip_date || 'Н/Д'}
- Отдел: ${debt.department || 'Н/Д'}
`
  })

  if (debts.length > 5) {
    response += `\n_...и ещё ${debts.length - 5} производств_`
  }

  response += `\n\n_Источник: ФССП России (fssp.gov.ru)_`

  return response
}

/**
 * Check debts by INN with formatted response
 * @param {string} inn - INN to check
 * @returns {Promise<Object>} Result with formatted response
 */
export async function checkDebts(inn) {
  const result = await searchByINN(inn)
  return {
    ...result,
    formatted: formatDebtResult(result, inn)
  }
}

export const fsspService = {
  searchByINN,
  searchByPerson,
  parseDebtRequest,
  formatDebtResult,
  checkDebts
}

export default fsspService
