/**
 * HeadHunter Agent Service for Chat
 * Parses user messages and provides job market data
 */

import { hhRuService, HH_REGIONS } from './hhRuService.js'

/**
 * Parse HH request from user message
 * Supports:
 * - "вакансии python" / "вакансии python москва"
 * - "зарплата программист" / "зарплата менеджер спб"
 * - "работодатель сбербанк" / "компания яндекс"
 * - "сколько получает разработчик"
 * @param {string} message - User message
 * @returns {Object|null} Parsed request or null
 */
export function parseHHRequest(message) {
  const normalizedMessage = message.toLowerCase().trim()

  // Pattern 1: "вакансии {должность} [{город}]"
  const vacancyPatterns = [
    /(?:вакансии|вакансия|работа|ищу работу|найти работу)\s+(.+?)(?:\s+(?:в|во)\s+)?(\p{L}+)?$/iu,
    /(?:вакансии|вакансия|работа)\s+(.+)/iu
  ]

  for (const pattern of vacancyPatterns) {
    const match = normalizedMessage.match(pattern)
    if (match) {
      const query = match[1]?.trim()
      const city = match[2]?.trim()
      if (query && query.length > 2) {
        return {
          type: 'vacancies',
          query,
          city: city || null
        }
      }
    }
  }

  // Pattern 2: "зарплата {должность} [{город}]" / "сколько получает/зарабатывает"
  const salaryPatterns = [
    /(?:зарплата|зп|оклад|ставка)\s+(.+?)(?:\s+(?:в|во)\s+)?(\p{L}+)?$/iu,
    /(?:сколько\s+)?(?:получает|зарабатывает|платят)\s+(.+?)(?:\s+(?:в|во)\s+)?(\p{L}+)?$/iu,
    /(?:средняя\s+)?зарплата\s+(.+)/iu
  ]

  for (const pattern of salaryPatterns) {
    const match = normalizedMessage.match(pattern)
    if (match) {
      const query = match[1]?.trim()
      const city = match[2]?.trim()
      if (query && query.length > 2) {
        return {
          type: 'salary',
          query,
          city: city || null
        }
      }
    }
  }

  // Pattern 3: "работодатель {компания}" / "компания {название}"
  // IMPORTANT: Check that "компания" is at the beginning or after specific words to avoid false positives
  // Should NOT trigger on: "скоринг лида: компания Яндекс", "интерес к продукту компания X"
  const employerPatterns = [
    /^(?:работодатель|employer)\s+(.+)/iu, // Must start with "работодатель" or "employer"
    /^(?:компания|организация|фирма)\s+(.+)/iu, // Must start with company-related word
    /(?:инфо(?:рмация)?|данные|найди|покажи|расскажи)\s+(?:о\s+)?(?:компании|работодателе|организации)\s+(.+)/iu // Info about company
  ]

  for (const pattern of employerPatterns) {
    const match = normalizedMessage.match(pattern)
    if (match) {
      const query = match[1]?.trim()
      if (query && query.length > 1) {
        return {
          type: 'employer',
          query
        }
      }
    }
  }

  return null
}

/**
 * Get region ID from city name
 * @param {string} cityName - City name
 * @returns {number} Region ID
 */
function getRegionId(cityName) {
  if (!cityName) return HH_REGIONS.RUSSIA

  const cityLower = cityName.toLowerCase()
  const cityMap = {
    'москва': HH_REGIONS.MOSCOW,
    'мск': HH_REGIONS.MOSCOW,
    'питер': HH_REGIONS.SAINT_PETERSBURG,
    'спб': HH_REGIONS.SAINT_PETERSBURG,
    'санкт-петербург': HH_REGIONS.SAINT_PETERSBURG,
    'екатеринбург': HH_REGIONS.EKATERINBURG,
    'екб': HH_REGIONS.EKATERINBURG,
    'новосибирск': HH_REGIONS.NOVOSIBIRSK,
    'нск': HH_REGIONS.NOVOSIBIRSK,
    'казань': HH_REGIONS.KAZAN,
    'нижний новгород': HH_REGIONS.NIZHNY_NOVGOROD,
    'челябинск': HH_REGIONS.CHELYABINSK,
    'самара': HH_REGIONS.SAMARA,
    'ростов': HH_REGIONS.ROSTOV_ON_DON,
    'ростов-на-дону': HH_REGIONS.ROSTOV_ON_DON,
    'уфа': HH_REGIONS.UFA,
    'красноярск': HH_REGIONS.KRASNOYARSK,
    'воронеж': HH_REGIONS.VORONEZH,
    'пермь': HH_REGIONS.PERM,
    'волгоград': HH_REGIONS.VOLGOGRAD
  }

  return cityMap[cityLower] || HH_REGIONS.RUSSIA
}

/**
 * Search vacancies
 * @param {string} query - Search query
 * @param {string} city - City name (optional)
 * @returns {Promise<Object>} Search result
 */
export async function searchVacancies(query, city = null) {
  try {
    const regionId = getRegionId(city)
    const result = await hhRuService.searchVacancies({
      text: query,
      area: regionId,
      perPage: 10,
      onlyWithSalary: false
    })

    return {
      success: result.success,
      data: result,
      query,
      city
    }
  } catch (error) {
    console.error('[HH Agent] Error searching vacancies:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Estimate salary for a position
 * @param {string} query - Job title/description
 * @param {string} city - City name (optional)
 * @returns {Promise<Object>} Salary estimate
 */
export async function estimateSalary(query, city = null) {
  try {
    const regionId = getRegionId(city)
    const result = await hhRuService.estimateSalary({
      functionDescription: query,
      region: regionId,
      maxResults: 100
    })

    return {
      success: result.success,
      data: result.data,
      query,
      city
    }
  } catch (error) {
    console.error('[HH Agent] Error estimating salary:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Search employers
 * @param {string} query - Employer name
 * @returns {Promise<Object>} Search result
 */
export async function searchEmployers(query) {
  try {
    // Use direct API call since hhRuService doesn't have employer search
    const response = await fetch(`https://api.hh.ru/employers?text=${encodeURIComponent(query)}&per_page=5`, {
      headers: {
        'User-Agent': 'DronDoc/1.0 (https://drondoc.ru)',
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    return {
      success: true,
      data: data,
      query
    }
  } catch (error) {
    console.error('[HH Agent] Error searching employers:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Format vacancies result for display
 * @param {Object} result - Search result
 * @returns {string} Formatted markdown
 */
export function formatVacanciesResult(result) {
  if (!result.success) {
    return `❌ Ошибка поиска вакансий: ${result.error}`
  }

  const { data, query, city } = result
  const vacancies = data.items || []
  const total = data.found || 0

  if (vacancies.length === 0) {
    return `🔍 **Поиск вакансий: ${query}${city ? ` в ${city}` : ''}**

📋 Вакансий не найдено

_Попробуйте изменить запрос или город_`
  }

  let response = `🔍 **Вакансии: ${query}${city ? ` (${city})` : ''}**

📊 Найдено: **${total.toLocaleString('ru-RU')}** вакансий

---
`

  vacancies.slice(0, 7).forEach((vacancy, index) => {
    const salary = formatSalary(vacancy.salary)
    const employer = vacancy.employer?.name || 'Не указан'
    const area = vacancy.area?.name || ''

    response += `**${index + 1}. [${vacancy.name}](${vacancy.alternate_url})**
🏢 ${employer}${area ? ` • 📍 ${area}` : ''}
💰 ${salary}

`
  })

  if (total > 7) {
    response += `_...и ещё ${total - 7} вакансий на [hh.ru](https://hh.ru/search/vacancy?text=${encodeURIComponent(query)})_`
  }

  response += `\n\n_Источник: hh.ru_`

  return response
}

/**
 * Format salary object to string
 */
function formatSalary(salary) {
  if (!salary) return 'Зарплата не указана'

  const { from, to, currency } = salary
  const curr = currency === 'RUR' ? '₽' : currency

  if (from && to) {
    return `${from.toLocaleString('ru-RU')} – ${to.toLocaleString('ru-RU')} ${curr}`
  } else if (from) {
    return `от ${from.toLocaleString('ru-RU')} ${curr}`
  } else if (to) {
    return `до ${to.toLocaleString('ru-RU')} ${curr}`
  }

  return 'Зарплата не указана'
}

/**
 * Format salary estimate result for display
 * @param {Object} result - Salary estimate result
 * @returns {string} Formatted markdown
 */
export function formatSalaryResult(result) {
  if (!result.success) {
    return `❌ Ошибка оценки зарплаты: ${result.error}`
  }

  const { data, query, city } = result

  if (!data || data.count === 0) {
    return `💰 **Оценка зарплаты: ${query}${city ? ` в ${city}` : ''}**

📋 Недостаточно данных для оценки

_Попробуйте более общий запрос_`
  }

  const curr = data.currency === 'RUR' ? '₽' : data.currency

  return `💰 **Зарплата: ${query}${city ? ` (${city})` : ''}**

📊 **Статистика по ${data.count} вакансиям:**

| Показатель | Значение |
|------------|----------|
| 📈 Средняя | **${data.average.toLocaleString('ru-RU')} ${curr}** |
| 📊 Медиана | ${data.median.toLocaleString('ru-RU')} ${curr} |
| ⬇️ Минимум | ${data.min.toLocaleString('ru-RU')} ${curr} |
| ⬆️ Максимум | ${data.max.toLocaleString('ru-RU')} ${curr} |

📋 Проанализировано вакансий: ${data.totalVacancies || data.count}
💼 С указанной зарплатой: ${data.withSalary || data.count}

_Источник: hh.ru • ${new Date().toLocaleDateString('ru-RU')}_`
}

/**
 * Format employer search result for display
 * @param {Object} result - Search result
 * @returns {string} Formatted markdown
 */
export function formatEmployerResult(result) {
  if (!result.success) {
    return `❌ Ошибка поиска работодателя: ${result.error}`
  }

  const { data, query } = result
  const employers = data.items || []

  if (employers.length === 0) {
    return `🏢 **Поиск работодателя: ${query}**

📋 Компании не найдены

_Проверьте правильность названия_`
  }

  let response = `🏢 **Работодатели: ${query}**

📊 Найдено: **${data.found || employers.length}** компаний

---
`

  employers.slice(0, 5).forEach((employer, index) => {
    const vacancies = employer.open_vacancies || 0

    response += `**${index + 1}. [${employer.name}](${employer.alternate_url})**
📋 Открытых вакансий: ${vacancies}
${employer.area?.name ? `📍 ${employer.area.name}` : ''}

`
  })

  response += `\n_Источник: hh.ru_`

  return response
}

/**
 * Process HH request and return formatted response
 * @param {Object} request - Parsed request
 * @returns {Promise<string>} Formatted response
 */
export async function processHHRequest(request) {
  switch (request.type) {
    case 'vacancies': {
      const result = await searchVacancies(request.query, request.city)
      return formatVacanciesResult(result)
    }
    case 'salary': {
      const result = await estimateSalary(request.query, request.city)
      return formatSalaryResult(result)
    }
    case 'employer': {
      const result = await searchEmployers(request.query)
      return formatEmployerResult(result)
    }
    default:
      return null
  }
}

export default {
  parseHHRequest,
  searchVacancies,
  estimateSalary,
  searchEmployers,
  formatVacanciesResult,
  formatSalaryResult,
  formatEmployerResult,
  processHHRequest
}
