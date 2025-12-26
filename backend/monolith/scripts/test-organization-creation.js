/**
 * Тестирование создания организации с полным сохранением данных DataNewton
 */

import {
  authenticateIntegram,
  fetchAllCompanyData,
  saveCompanyDataToIntegram
} from '../src/services/dataNewtonIntegram.js'

async function testOrganizationCreation() {
  console.log('🧪 Тест создания организации с расширенным сохранением данных')
  console.log('='.repeat(70))
  console.log()

  const TEST_INN = '7707083893'  // Сбербанк
  const TEST_ORG_NAME = 'Тест DataNewton API (Сбербанк)'

  try {
    // 1. Авторизация
    console.log('[1/5] Авторизация в Integram...')

    const username = process.env.INTEGRAM_REGISTRATION_USERNAME || process.env.INTEGRAM_SYSTEM_USERNAME
    const password = process.env.INTEGRAM_REGISTRATION_PASSWORD || process.env.INTEGRAM_SYSTEM_PASSWORD

    if (!username || !password) {
      throw new Error('INTEGRAM_REGISTRATION credentials not configured. Please set INTEGRAM_REGISTRATION_USERNAME and INTEGRAM_REGISTRATION_PASSWORD environment variables.')
    }

    const auth = await authenticateIntegram(username, password)
    console.log('✅ Авторизация успешна\n')

    // 2. Получение всех данных из DataNewton
    console.log(`[2/5] Получение данных из DataNewton API для ИНН: ${TEST_INN}...`)
    const companyData = await fetchAllCompanyData(TEST_INN, auth)

    console.log('\nПолученные данные:')
    console.log(`  - counterparty: ${!!companyData.counterparty ? '✅' : '❌'}`)
    console.log(`  - links: ${!!companyData.links ? '✅' : '❌'}`)
    if (companyData.links) {
      console.log(`    - nodes: ${companyData.links.nodes?.length || 0} узлов`)
      console.log(`    - edges: ${companyData.links.edges?.length || 0} ребер`)
    }
    console.log(`  - risks: ${!!companyData.risks ? '✅' : '❌ (требуется premium)'}`)
    console.log(`  - scoring: ${!!companyData.scoring ? '✅' : '❌ (требуется premium)'}`)
    console.log(`  - finance: ${!!companyData.finance ? '✅' : '❌ (требуется premium)'}`)
    console.log()

    // 3. Создание организации в Integram
    console.log('[3/5] Создание организации в Integram...')
    const createUrl = `https://dronedoc.ru/my/_m_new/197000?JSON_KV`
    const formData = new URLSearchParams()
    formData.append('_xsrf', auth.xsrf)
    formData.append('t197000', TEST_ORG_NAME)
    formData.append('t198195', TEST_INN)  // ИНН
    formData.append('up', '1')

    const axios = (await import('axios')).default
    const createResponse = await axios.post(createUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Authorization': auth.token
      }
    })

    const orgId = createResponse.data?.id
    if (!orgId) {
      throw new Error('Не удалось создать организацию - нет ID в ответе')
    }

    console.log(`✅ Организация создана с ID: ${orgId}\n`)

    // 4. Сохранение всех данных DataNewton в реквизиты
    console.log('[4/5] Сохранение всех данных в реквизиты...')
    console.log('Это может занять некоторое время...\n')

    const saveResult = await saveCompanyDataToIntegram(orgId, companyData, auth)

    console.log('\n📊 Результаты сохранения:')
    console.log(`  Сохранено реквизитов: ${saveResult.savedRequisites.length}`)
    console.log(`  Ошибок: ${saveResult.errors.length}`)

    if (saveResult.errors.length > 0) {
      console.log('\n⚠️  Ошибки при сохранении:')
      saveResult.errors.slice(0, 10).forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.field}: ${err.error}`)
      })
      if (saveResult.errors.length > 10) {
        console.log(`  ... и еще ${saveResult.errors.length - 10} ошибок`)
      }
    }

    // Группируем сохраненные реквизиты по типам
    const byType = {}
    saveResult.savedRequisites.forEach(req => {
      const type = req.field.split('.')[0]
      if (!byType[type]) byType[type] = 0
      byType[type]++
    })

    console.log('\nСтатистика по разделам:')
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} реквизитов`)
    })

    // 5. Проверка сохраненных данных
    console.log('\n[5/5] Проверка сохраненных данных...')
    const checkUrl = `https://dronedoc.ru/my/object/209592?JSON_KV&F_U=${orgId}&LIMIT=500`
    const checkResponse = await axios.get(checkUrl, {
      headers: { 'X-Authorization': auth.token }
    })

    const savedObjects = checkResponse.data?.object || []
    console.log(`✅ Найдено реквизитов в Integram: ${savedObjects.length}`)

    // Ссылки для просмотра
    console.log('\n' + '='.repeat(70))
    console.log('🎉 Тест завершен успешно!')
    console.log('\nСсылки для просмотра:')
    console.log(`  Организация: https://dronedoc.ru/my/object/197000/_o_${orgId}`)
    console.log(`  Реквизиты: https://dronedoc.ru/my/object/209592/?&F_U=${orgId}&pg=1`)
    console.log(`  DataNewton: https://datanewton.ru/contragents/${TEST_INN}`)
    console.log('='.repeat(70))

  } catch (error) {
    console.error('\n❌ Ошибка в тесте:', error.message)
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
  }
}

// Запуск
testOrganizationCreation().catch(console.error)
