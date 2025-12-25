/**
 * Анализ структуры всех эндпоинтов DataNewton API
 * Извлекает все доступные поля из 10 эндпоинтов
 */

import axios from 'axios'
import fs from 'fs/promises'
import path from 'path'

const BASE_URL = 'https://api.datanewton.ru/v1'
const API_KEY = 'eStY3NadO5TA'
const TEST_INN = '7707083893' // Сбербанк

// Список всех эндпоинтов DataNewton
const ENDPOINTS = [
  { name: 'counterparty', params: { inn: TEST_INN } },
  { name: 'links', params: { ogrn: null } }, // OGRN получим из counterparty
  { name: 'risks', params: { ogrn: null } },
  { name: 'scoring', params: { ogrn: null } },
  { name: 'finance', params: { ogrn: null } },
  { name: 'taxInfo', params: { ogrn: null } },
  { name: 'bankruptcy', params: { ogrn: null, limit: 10 } },
  { name: 'inspections', params: { ogrn: null, limit: 10 } },
  { name: 'governmentContracts', params: { ogrn: null, limit: 10 } },
  { name: 'arbitration-cases', params: { ogrn: null, limit: 10 } }
]

/**
 * Рекурсивно извлекает все пути из объекта
 * @param {*} obj - объект для обхода
 * @param {string} prefix - текущий путь
 * @param {Set} paths - множество найденных путей
 * @param {number} depth - текущая глубина рекурсии
 */
function extractPaths(obj, prefix = '', paths = new Set(), depth = 0) {
  if (depth > 10) return paths // Защита от бесконечной рекурсии

  if (obj === null || obj === undefined) {
    paths.add(prefix)
    return paths
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      paths.add(`${prefix}[]`)
      return paths
    }
    // Анализируем первый элемент массива как пример
    obj.slice(0, 3).forEach((item, index) => {
      extractPaths(item, `${prefix}[${index}]`, paths, depth + 1)
    })
    return paths
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj)
    if (keys.length === 0) {
      paths.add(`${prefix}{}`)
      return paths
    }

    for (const key of keys) {
      const newPrefix = prefix ? `${prefix}.${key}` : key
      extractPaths(obj[key], newPrefix, paths, depth + 1)
    }
    return paths
  }

  // Простое значение (string, number, boolean)
  paths.add(`${prefix} (${typeof obj})`)
  return paths
}

/**
 * Получает данные из DataNewton API с обработкой ошибок
 */
async function fetchEndpoint(endpoint, params) {
  try {
    console.log(`\n📡 Запрос к эндпоинту: ${endpoint}`)
    console.log(`   Параметры:`, params)

    const response = await axios.get(`${BASE_URL}/${endpoint}`, {
      params: { ...params, key: API_KEY },
      timeout: 20000,
      headers: {
        'User-Agent': 'Integram/1.0',
        'Accept': 'application/json'
      }
    })

    console.log(`   ✅ Получено: ${JSON.stringify(response.data).length} байт`)
    return response.data
  } catch (error) {
    console.error(`   ❌ Ошибка: ${error.message}`)
    if (error.response) {
      console.error(`   Статус: ${error.response.status}`)
      console.error(`   Данные: ${JSON.stringify(error.response.data).substring(0, 200)}`)
    }
    return null
  }
}

/**
 * Основная функция анализа
 */
async function analyzeDataNewtonAPI() {
  console.log('🔍 Анализ структуры DataNewton API')
  console.log('=====================================\n')

  const results = {}
  let ogrn = null

  // Сначала получаем counterparty для извлечения OGRN
  const counterpartyData = await fetchEndpoint('counterparty', { inn: TEST_INN })
  if (counterpartyData && counterpartyData.ogrn) {
    ogrn = counterpartyData.ogrn
    console.log(`\n📌 Получен OGRN: ${ogrn}`)
    results.counterparty = counterpartyData
  } else {
    console.error('\n❌ Не удалось получить OGRN из counterparty')
    return
  }

  // Обновляем параметры эндпоинтов с полученным OGRN
  for (const endpoint of ENDPOINTS) {
    if (endpoint.params.ogrn === null) {
      endpoint.params.ogrn = ogrn
    }
  }

  // Запрашиваем остальные эндпоинты
  for (const endpoint of ENDPOINTS.slice(1)) {
    const data = await fetchEndpoint(endpoint.name, endpoint.params)
    if (data) {
      results[endpoint.name] = data
    }
  }

  console.log('\n\n📊 Анализ структуры полей')
  console.log('=========================\n')

  const allPaths = {}
  const fieldStats = {
    totalEndpoints: 0,
    totalPaths: 0,
    byEndpoint: {}
  }

  for (const [endpointName, data] of Object.entries(results)) {
    console.log(`\n🔹 Эндпоинт: ${endpointName}`)
    const paths = new Set()
    extractPaths(data, endpointName, paths)

    allPaths[endpointName] = Array.from(paths).sort()
    fieldStats.totalEndpoints++
    fieldStats.totalPaths += paths.size
    fieldStats.byEndpoint[endpointName] = paths.size

    console.log(`   Найдено полей: ${paths.size}`)
    console.log(`   Примеры:`)
    Array.from(paths).slice(0, 10).forEach(p => console.log(`     - ${p}`))
  }

  console.log('\n\n📈 Статистика')
  console.log('==============')
  console.log(`Всего эндпоинтов: ${fieldStats.totalEndpoints}`)
  console.log(`Всего уникальных путей: ${fieldStats.totalPaths}`)
  console.log('\nРаспределение по эндпоинтам:')
  for (const [endpoint, count] of Object.entries(fieldStats.byEndpoint)) {
    console.log(`  ${endpoint.padEnd(25)} ${count} полей`)
  }

  // Сохраняем результаты
  const outputDir = path.join(process.cwd(), 'data', 'datanewton-analysis')
  await fs.mkdir(outputDir, { recursive: true })

  const outputFile = path.join(outputDir, 'field-analysis.json')
  await fs.writeFile(outputFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    testINN: TEST_INN,
    testOGRN: ogrn,
    statistics: fieldStats,
    allPaths,
    sampleData: results
  }, null, 2))

  console.log(`\n✅ Результаты сохранены: ${outputFile}`)

  // Создаем упрощенный маппинг для использования в коде
  const flatPaths = []
  for (const [endpoint, paths] of Object.entries(allPaths)) {
    paths.forEach(path => {
      // Убираем индексы массивов и типы
      const cleanPath = path
        .replace(/\[\d+\]/g, '[]')
        .replace(/ \(.*?\)$/, '')
      if (!flatPaths.includes(cleanPath)) {
        flatPaths.push(cleanPath)
      }
    })
  }

  const mappingFile = path.join(outputDir, 'field-paths.txt')
  await fs.writeFile(mappingFile, flatPaths.sort().join('\n'))
  console.log(`✅ Список путей сохранен: ${mappingFile}`)
  console.log(`\nВсего уникальных путей (без индексов): ${flatPaths.length}`)
}

// Запуск
analyzeDataNewtonAPI().catch(console.error)
