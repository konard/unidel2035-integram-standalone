#!/usr/bin/env node
/**
 * Setup Integram Schema for Code Analyzer
 *
 * This script creates the necessary Integram types and requisites
 * for the Code Analyzer Agent.
 *
 * Usage:
 *   node backend/monolith/scripts/setup-code-analyzer-integram.js
 *
 * Requirements:
 *   - Integram server running at https://dronedoc.ru
 *   - Database: a2025
 *   - Credentials: d/d (or set via INTEGRAM_LOGIN/INTEGRAM_PASSWORD env vars)
 */

import IntegramMCPClient from '../src/services/mcp/IntegramMCPClient.js'

const SERVER_URL = process.env.INTEGRAM_SERVER_URL || process.env.INTEGRAM_SERVER_URL || 'https://example.integram.io'
const DATABASE = process.env.INTEGRAM_DATABASE || 'a2025'
const LOGIN = process.env.INTEGRAM_LOGIN || 'd'
const PASSWORD = process.env.INTEGRAM_PASSWORD || 'd'

async function setupSchema() {
  console.log('🚀 Setting up Code Analyzer Integram schema...')
  console.log(`Server: ${SERVER_URL}`)
  console.log(`Database: ${DATABASE}`)
  console.log('')

  // Step 1: Authenticate
  console.log('Step 1: Authenticating...')
  const client = new IntegramMCPClient({ serverURL: SERVER_URL, database: DATABASE })
  const authenticated = await client.authenticate(LOGIN, PASSWORD)

  if (!authenticated) {
    console.error('❌ Authentication failed!')
    process.exit(1)
  }
  console.log('✅ Authenticated successfully\n')

  // Step 2: Check existing types to avoid duplicates
  console.log('Step 2: Checking existing types...')
  const dictionary = await client.getDictionary()

  const existingAnalysisType = dictionary.types.find(t => t.name === 'Анализ кода')
  const existingIssueType = dictionary.types.find(t => t.name === 'Проблема в коде')
  const existingSessionType = dictionary.types.find(t => t.name === 'Сессия анализа')

  if (existingAnalysisType) {
    console.log(`⚠️  Type "Анализ кода" already exists (ID: ${existingAnalysisType.id})`)
  }
  if (existingIssueType) {
    console.log(`⚠️  Type "Проблема в коде" already exists (ID: ${existingIssueType.id})`)
  }
  if (existingSessionType) {
    console.log(`⚠️  Type "Сессия анализа" already exists (ID: ${existingSessionType.id})`)
  }
  console.log('')

  // Step 3: Create Type 1 - Анализ кода
  let analysisTypeId
  if (existingAnalysisType) {
    analysisTypeId = existingAnalysisType.id
    console.log(`Step 3: Using existing "Анализ кода" type (ID: ${analysisTypeId})`)
  } else {
    console.log('Step 3: Creating type "Анализ кода"...')
    const analysisType = await client.createType({
      name: 'Анализ кода',
      baseTypeId: 1,
      unique: false
    })
    analysisTypeId = analysisType.id
    console.log(`✅ Created "Анализ кода" type (ID: ${analysisTypeId})`)

    // Add requisites
    console.log('  Adding requisites...')
    const req1 = await client.addRequisite({ typeId: analysisTypeId, requisiteTypeId: 3 })
    await client.saveRequisiteAlias({ requisiteId: req1.id, alias: 'Хеш кода' })
    console.log(`  ✅ Хеш кода (${req1.id})`)

    const req2 = await client.addRequisite({ typeId: analysisTypeId, requisiteTypeId: 3 })
    await client.saveRequisiteAlias({ requisiteId: req2.id, alias: 'Язык' })
    console.log(`  ✅ Язык (${req2.id})`)

    const req3 = await client.addRequisite({ typeId: analysisTypeId, requisiteTypeId: 3 })
    await client.saveRequisiteAlias({ requisiteId: req3.id, alias: 'Имя файла' })
    console.log(`  ✅ Имя файла (${req3.id})`)

    const req4 = await client.addRequisite({ typeId: analysisTypeId, requisiteTypeId: 13 })
    await client.saveRequisiteAlias({ requisiteId: req4.id, alias: 'Длина кода' })
    console.log(`  ✅ Длина кода (${req4.id})`)

    const req5 = await client.addRequisite({ typeId: analysisTypeId, requisiteTypeId: 13 })
    await client.saveRequisiteAlias({ requisiteId: req5.id, alias: 'Найдено проблем' })
    console.log(`  ✅ Найдено проблем (${req5.id})`)

    const req6 = await client.addRequisite({ typeId: analysisTypeId, requisiteTypeId: 2 })
    await client.saveRequisiteAlias({ requisiteId: req6.id, alias: 'Статистика' })
    console.log(`  ✅ Статистика (${req6.id})`)

    const req7 = await client.addRequisite({ typeId: analysisTypeId, requisiteTypeId: 3 })
    await client.saveRequisiteAlias({ requisiteId: req7.id, alias: 'ID модели' })
    console.log(`  ✅ ID модели (${req7.id})`)

    const req8 = await client.addRequisite({ typeId: analysisTypeId, requisiteTypeId: 13 })
    await client.saveRequisiteAlias({ requisiteId: req8.id, alias: 'Использовано токенов' })
    console.log(`  ✅ Использовано токенов (${req8.id})`)

    const req9 = await client.addRequisite({ typeId: analysisTypeId, requisiteTypeId: 13 })
    await client.saveRequisiteAlias({ requisiteId: req9.id, alias: 'Стоимость USD' })
    console.log(`  ✅ Стоимость USD (${req9.id})`)

    const req10 = await client.addRequisite({ typeId: analysisTypeId, requisiteTypeId: 13 })
    await client.saveRequisiteAlias({ requisiteId: req10.id, alias: 'Длительность мс' })
    console.log(`  ✅ Длительность мс (${req10.id})`)

    const req11 = await client.addRequisite({ typeId: analysisTypeId, requisiteTypeId: 4 })
    await client.saveRequisiteAlias({ requisiteId: req11.id, alias: 'Дата создания' })
    console.log(`  ✅ Дата создания (${req11.id})`)
  }
  console.log('')

  // Step 4: Create Type 2 - Проблема в коде
  let issueTypeId
  if (existingIssueType) {
    issueTypeId = existingIssueType.id
    console.log(`Step 4: Using existing "Проблема в коде" type (ID: ${issueTypeId})`)
  } else {
    console.log('Step 4: Creating type "Проблема в коде"...')
    const issueType = await client.createType({
      name: 'Проблема в коде',
      baseTypeId: 1,
      unique: false
    })
    issueTypeId = issueType.id
    console.log(`✅ Created "Проблема в коде" type (ID: ${issueTypeId})`)

    // Add requisites
    console.log('  Adding requisites...')

    // Reference to Анализ кода
    const req1 = await client.addRequisite({ typeId: issueTypeId, requisiteTypeId: analysisTypeId })
    await client.saveRequisiteAlias({ requisiteId: req1.id, alias: 'Анализ' })
    console.log(`  ✅ Анализ (${req1.id}) [REF → ${analysisTypeId}]`)

    const req2 = await client.addRequisite({ typeId: issueTypeId, requisiteTypeId: 3 })
    await client.saveRequisiteAlias({ requisiteId: req2.id, alias: 'Серьезность' })
    console.log(`  ✅ Серьезность (${req2.id})`)

    const req3 = await client.addRequisite({ typeId: issueTypeId, requisiteTypeId: 3 })
    await client.saveRequisiteAlias({ requisiteId: req3.id, alias: 'Тип' })
    console.log(`  ✅ Тип (${req3.id})`)

    const req4 = await client.addRequisite({ typeId: issueTypeId, requisiteTypeId: 13 })
    await client.saveRequisiteAlias({ requisiteId: req4.id, alias: 'Строка' })
    console.log(`  ✅ Строка (${req4.id})`)

    const req5 = await client.addRequisite({ typeId: issueTypeId, requisiteTypeId: 2 })
    await client.saveRequisiteAlias({ requisiteId: req5.id, alias: 'Описание' })
    console.log(`  ✅ Описание (${req5.id})`)

    const req6 = await client.addRequisite({ typeId: issueTypeId, requisiteTypeId: 2 })
    await client.saveRequisiteAlias({ requisiteId: req6.id, alias: 'Рекомендация' })
    console.log(`  ✅ Рекомендация (${req6.id})`)

    const req7 = await client.addRequisite({ typeId: issueTypeId, requisiteTypeId: 2 })
    await client.saveRequisiteAlias({ requisiteId: req7.id, alias: 'Пример кода' })
    console.log(`  ✅ Пример кода (${req7.id})`)
  }
  console.log('')

  // Step 5: Create Type 3 - Сессия анализа
  let sessionTypeId
  if (existingSessionType) {
    sessionTypeId = existingSessionType.id
    console.log(`Step 5: Using existing "Сессия анализа" type (ID: ${sessionTypeId})`)
  } else {
    console.log('Step 5: Creating type "Сессия анализа"...')
    const sessionType = await client.createType({
      name: 'Сессия анализа',
      baseTypeId: 1,
      unique: false
    })
    sessionTypeId = sessionType.id
    console.log(`✅ Created "Сессия анализа" type (ID: ${sessionTypeId})`)

    // Add requisites
    console.log('  Adding requisites...')
    const req1 = await client.addRequisite({ typeId: sessionTypeId, requisiteTypeId: 3 })
    await client.saveRequisiteAlias({ requisiteId: req1.id, alias: 'Название' })
    console.log(`  ✅ Название (${req1.id})`)

    const req2 = await client.addRequisite({ typeId: sessionTypeId, requisiteTypeId: 13 })
    await client.saveRequisiteAlias({ requisiteId: req2.id, alias: 'Всего файлов' })
    console.log(`  ✅ Всего файлов (${req2.id})`)

    const req3 = await client.addRequisite({ typeId: sessionTypeId, requisiteTypeId: 13 })
    await client.saveRequisiteAlias({ requisiteId: req3.id, alias: 'Успешно' })
    console.log(`  ✅ Успешно (${req3.id})`)

    const req4 = await client.addRequisite({ typeId: sessionTypeId, requisiteTypeId: 13 })
    await client.saveRequisiteAlias({ requisiteId: req4.id, alias: 'Ошибок' })
    console.log(`  ✅ Ошибок (${req4.id})`)

    const req5 = await client.addRequisite({ typeId: sessionTypeId, requisiteTypeId: 13 })
    await client.saveRequisiteAlias({ requisiteId: req5.id, alias: 'Всего проблем' })
    console.log(`  ✅ Всего проблем (${req5.id})`)

    const req6 = await client.addRequisite({ typeId: sessionTypeId, requisiteTypeId: 4 })
    await client.saveRequisiteAlias({ requisiteId: req6.id, alias: 'Дата создания' })
    console.log(`  ✅ Дата создания (${req6.id})`)
  }
  console.log('')

  // Step 6: Verify structure
  console.log('Step 6: Verifying types...')
  const analysisMetadata = await client.getTypeMetadata({ typeId: analysisTypeId })
  const issueMetadata = await client.getTypeMetadata({ typeId: issueTypeId })
  const sessionMetadata = await client.getTypeMetadata({ typeId: sessionTypeId })

  console.log(`✅ "Анализ кода" (${analysisTypeId}): ${analysisMetadata.requisites.length} requisites`)
  console.log(`✅ "Проблема в коде" (${issueTypeId}): ${issueMetadata.requisites.length} requisites`)
  console.log(`✅ "Сессия анализа" (${sessionTypeId}): ${sessionMetadata.requisites.length} requisites`)
  console.log('')

  // Step 7: Save type IDs to config file
  console.log('Step 7: Saving type IDs to config...')
  const config = {
    analysisTypeId,
    issueTypeId,
    sessionTypeId,
    analysisRequisites: analysisMetadata.requisites.reduce((acc, req) => {
      acc[req.alias] = req.id
      return acc
    }, {}),
    issueRequisites: issueMetadata.requisites.reduce((acc, req) => {
      acc[req.alias] = req.id
      return acc
    }, {}),
    sessionRequisites: sessionMetadata.requisites.reduce((acc, req) => {
      acc[req.alias] = req.id
      return acc
    }, {})
  }

  const fs = await import('fs/promises')
  const path = await import('path')
  const { fileURLToPath } = await import('url')
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const configPath = path.join(__dirname, '../src/config/code-analyzer-integram.json')

  await fs.writeFile(configPath, JSON.stringify(config, null, 2))
  console.log(`✅ Saved config to: ${configPath}`)
  console.log('')

  console.log('🎉 Schema setup completed successfully!')
  console.log('')
  console.log('Type IDs:')
  console.log(`  Анализ кода: ${analysisTypeId}`)
  console.log(`  Проблема в коде: ${issueTypeId}`)
  console.log(`  Сессия анализа: ${sessionTypeId}`)
  console.log('')
  console.log('Next steps:')
  console.log('  1. Update backend/monolith/src/api/routes/code-analyzer.js to use these type IDs')
  console.log('  2. Replace pool.query() calls with Integram client calls')
  console.log('  3. Test the updated implementation')
}

// Run setup
setupSchema().catch(error => {
  console.error('❌ Setup failed:', error.message)
  console.error(error.stack)
  process.exit(1)
})
