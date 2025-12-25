/**
 * Создание новых параметров в Integram таблице 209590
 * Использует прямой Integram API (без MCP)
 */

import axios from 'axios'
import fs from 'fs/promises'
import path from 'path'

const INTEGRAM_CONFIG = {
  serverURL: 'https://dronedoc.ru',
  database: 'my',
  login: 'd',
  password: 'd',
  paramApiTableId: 209590,  // Таблица "Параметр API"
  descriptionReqId: 209600   // Реквизит "Описание"
}

// Маппинг новых параметров с описаниями на русском
const NEW_PARAMETERS = {
  '209831': { apiKey: 'company.address', description: 'Адрес организации (объект)' },
  '209832': { apiKey: 'company.owners', description: 'Владельцы/учредители' },
  '209833': { apiKey: 'links.available_count', description: 'Количество доступных связей' },
  '209834': { apiKey: 'links.edges[].inn_source', description: 'ИНН источника связи' },
  '209835': { apiKey: 'links.edges[].inn_target', description: 'ИНН цели связи' },
  '209836': { apiKey: 'links.edges[].level', description: 'Уровень связи' },
  '209837': { apiKey: 'links.edges[].type', description: 'Тип связи' },
  '209838': { apiKey: 'links.edges[].value', description: 'Значение связи (доля владения)' },
  '209839': { apiKey: 'links.nodes[].activity_kind', description: 'Вид деятельности (код)' },
  '209840': { apiKey: 'links.nodes[].activity_kind_dsc', description: 'Вид деятельности (описание)' },
  '209841': { apiKey: 'links.nodes[].inn', description: 'ИНН связанной организации' },
  '209842': { apiKey: 'links.nodes[].name', description: 'Название связанной организации' },
  '209843': { apiKey: 'links.nodes[].ogrn', description: 'ОГРН связанной организации' },
  '209844': { apiKey: 'links.nodes[].status', description: 'Статус связанной организации' },
  '209845': { apiKey: 'links.nodes[].type', description: 'Тип связанной организации' }
}

/**
 * Авторизация в Integram
 */
async function authenticateIntegram() {
  const authUrl = `${INTEGRAM_CONFIG.serverURL}/${INTEGRAM_CONFIG.database}/auth?JSON_KV`

  console.log(`[Integram] Авторизация: ${authUrl}`)

  const formData = new URLSearchParams()
  formData.append('login', INTEGRAM_CONFIG.login)
  formData.append('pwd', INTEGRAM_CONFIG.password)

  const response = await axios.post(authUrl, formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })

  console.log('[Integram] ✅ Авторизация успешна\n')

  return {
    token: response.data.token,
    xsrf: response.data._xsrf
  }
}

/**
 * Создание объекта "Параметр API" в таблице 209590
 */
async function createParameter(auth, paramId, apiKey, description) {
  const url = `${INTEGRAM_CONFIG.serverURL}/${INTEGRAM_CONFIG.database}/_m_new/${INTEGRAM_CONFIG.paramApiTableId}?JSON_KV`

  const formData = new URLSearchParams()
  formData.append(`t${INTEGRAM_CONFIG.paramApiTableId}`, apiKey)  // Название = API ключ
  formData.append(`t${INTEGRAM_CONFIG.descriptionReqId}`, description)  // Описание
  formData.append('up', '1')  // Parent ID (1 = независимый объект)
  formData.append('_xsrf', auth.xsrf)

  console.log(`[Создание] ID ${paramId}: ${apiKey}`)
  console.log(`           Описание: ${description}`)

  try {
    const response = await axios.post(url, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Authorization': auth.token
      }
    })

    const createdId = response.data?.id
    console.log(`           ✅ Создан объект: ${createdId}`)

    if (createdId !== paramId) {
      console.warn(`           ⚠️  ВНИМАНИЕ: Ожидался ID ${paramId}, но получен ${createdId}`)
    }

    return { success: true, expectedId: paramId, actualId: createdId, apiKey, description }

  } catch (error) {
    console.error(`           ❌ Ошибка: ${error.message}`)
    if (error.response) {
      console.error(`           Статус: ${error.response.status}`)
      console.error(`           Данные: ${JSON.stringify(error.response.data)}`)
    }
    return { success: false, expectedId: paramId, apiKey, description, error: error.message }
  }
}

/**
 * Основная функция
 */
async function createNewParameters() {
  console.log('🆕 Создание новых параметров DataNewton API в Integram')
  console.log('='.repeat(60))
  console.log()

  // Авторизуемся
  const auth = await authenticateIntegram()

  // Создаем параметры
  const results = []

  for (const [expectedId, data] of Object.entries(NEW_PARAMETERS)) {
    const result = await createParameter(auth, expectedId, data.apiKey, data.description)
    results.push(result)

    // Небольшая задержка между запросами
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // Статистика
  console.log()
  console.log('='.repeat(60))
  console.log('📊 Итоговая статистика:')
  console.log()

  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)

  console.log(`Всего параметров: ${results.length}`)
  console.log(`Успешно создано: ${successful.length}`)
  console.log(`Ошибок: ${failed.length}`)

  if (failed.length > 0) {
    console.log()
    console.log('❌ Не удалось создать:')
    failed.forEach(f => console.log(`   - ${f.apiKey} (ID ${f.expectedId}): ${f.error}`))
  }

  // Сохраняем результаты
  const outputFile = path.join(process.cwd(), 'data/datanewton-analysis/creation-results.json')
  await fs.writeFile(outputFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalAttempted: results.length,
    successful: successful.length,
    failed: failed.length,
    results
  }, null, 2))

  console.log()
  console.log(`✅ Результаты сохранены: ${outputFile}`)
}

// Запуск
createNewParameters().catch(console.error)
