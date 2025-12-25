/**
 * Setup Script for Integram Notification Tables
 *
 * This script creates the necessary tables and requisites in Integram
 * for the notification system.
 *
 * Usage: node scripts/setup-integram-notifications.js
 */

import IntegramMCPClient from '../src/services/mcp/IntegramMCPClient.js'

const SERVER_URL = process.env.INTEGRAM_SERVER_URL || 'https://dronedoc.ru'
const DATABASE = process.env.INTEGRAM_DATABASE || 'my'
const LOGIN = process.env.INTEGRAM_LOGIN || 'd'
const PASSWORD = process.env.INTEGRAM_PASSWORD || 'd'

console.log('🚀 Integram Notification System Setup')
console.log('=====================================\n')
console.log(`Server: ${SERVER_URL}`)
console.log(`Database: ${DATABASE}`)
console.log(`Login: ${LOGIN}\n`)

async function setupNotificationTables() {
  const client = new IntegramMCPClient({
    serverURL: SERVER_URL,
    database: DATABASE
  })

  try {
    // Step 1: Authenticate
    console.log('📝 Step 1: Authenticating with Integram...')
    await client.authenticate(LOGIN, PASSWORD)
    console.log('✅ Authenticated successfully\n')

    // Step 2: Create Уведомления (Notifications) table
    console.log('📝 Step 2: Creating Уведомления (Notifications) table...')
    const notificationTypeResult = await client.createType({
      name: 'Уведомления',
      baseTypeId: 1, // Independent type
      unique: false
    })
    const notificationTypeId = notificationTypeResult.id
    console.log(`✅ Created table with ID: ${notificationTypeId}\n`)

    // Step 3: Add requisites to Notifications table
    console.log('📝 Step 3: Adding requisites to Notifications table...')
    const requisites = [
      { name: 'user_id', alias: 'ID пользователя', typeId: 3 },      // SHORT
      { name: 'type', alias: 'Тип', typeId: 3 },                     // SHORT
      { name: 'title', alias: 'Заголовок', typeId: 3 },              // SHORT
      { name: 'message', alias: 'Сообщение', typeId: 2 },            // LONG
      { name: 'priority', alias: 'Приоритет', typeId: 3 },           // SHORT
      { name: 'read', alias: 'Прочитано', typeId: 7 },               // BOOL
      { name: 'link', alias: 'Ссылка', typeId: 3 },                  // SHORT
      { name: 'icon', alias: 'Иконка', typeId: 3 },                  // SHORT
      { name: 'icon_color', alias: 'Цвет иконки', typeId: 3 },       // SHORT
      { name: 'metadata', alias: 'Метаданные', typeId: 2 },          // LONG (JSON)
      { name: 'created_at', alias: 'Создано', typeId: 4 },           // DATETIME
      { name: 'updated_at', alias: 'Обновлено', typeId: 4 },         // DATETIME
      { name: 'deleted', alias: 'Удалено', typeId: 7 },              // BOOL
      { name: 'deleted_at', alias: 'Дата удаления', typeId: 4 }      // DATETIME
    ]

    const requisiteIds = {}
    for (const req of requisites) {
      const result = await client.addRequisite({
        typeId: notificationTypeId,
        requisiteTypeId: req.typeId
      })
      const requisiteId = result.id

      await client.saveRequisiteAlias({
        requisiteId,
        alias: req.alias
      })

      requisiteIds[req.name] = requisiteId
      console.log(`  ✅ Added ${req.alias} (${req.name}): ID ${requisiteId}`)
    }
    console.log('')

    // Step 4: Create Настройки уведомлений (Notification Preferences) table
    console.log('📝 Step 4: Creating Настройки уведомлений (Preferences) table...')
    const preferencesTypeResult = await client.createType({
      name: 'Настройки уведомлений',
      baseTypeId: 1,
      unique: false
    })
    const preferencesTypeId = preferencesTypeResult.id
    console.log(`✅ Created table with ID: ${preferencesTypeId}\n`)

    // Step 5: Add requisites to Preferences table
    console.log('📝 Step 5: Adding requisites to Preferences table...')
    const prefRequisites = [
      { name: 'user_id', alias: 'ID пользователя', typeId: 3 },        // SHORT
      { name: 'channels', alias: 'Каналы', typeId: 2 },                // LONG (JSON)
      { name: 'email_settings', alias: 'Настройки email', typeId: 2 }, // LONG (JSON)
      { name: 'push_settings', alias: 'Настройки push', typeId: 2 },   // LONG (JSON)
      { name: 'do_not_disturb', alias: 'Не беспокоить', typeId: 2 },   // LONG (JSON)
      { name: 'metadata', alias: 'Метаданные', typeId: 2 },            // LONG (JSON)
      { name: 'created_at', alias: 'Создано', typeId: 4 },             // DATETIME
      { name: 'updated_at', alias: 'Обновлено', typeId: 4 }            // DATETIME
    ]

    const prefRequisiteIds = {}
    for (const req of prefRequisites) {
      const result = await client.addRequisite({
        typeId: preferencesTypeId,
        requisiteTypeId: req.typeId
      })
      const requisiteId = result.id

      await client.saveRequisiteAlias({
        requisiteId,
        alias: req.alias
      })

      prefRequisiteIds[req.name] = requisiteId
      console.log(`  ✅ Added ${req.alias} (${req.name}): ID ${requisiteId}`)
    }
    console.log('')

    // Step 6: Generate environment configuration
    console.log('📝 Step 6: Generating environment configuration...\n')
    console.log('=' .repeat(70))
    console.log('✅ Setup Complete! Add the following to your .env file:')
    console.log('=' .repeat(70))
    console.log('')
    console.log('# Integram Connection')
    console.log(`INTEGRAM_SERVER_URL=${SERVER_URL}`)
    console.log(`INTEGRAM_DATABASE=${DATABASE}`)
    console.log(`INTEGRAM_LOGIN=${LOGIN}`)
    console.log(`INTEGRAM_PASSWORD=${PASSWORD}`)
    console.log('')
    console.log('# Notification Table Configuration')
    console.log(`NOTIFICATION_TYPE_ID=${notificationTypeId}`)
    console.log('')
    console.log('# Notification Requisite IDs')
    console.log(`NOTIF_REQ_USER_ID=${requisiteIds.user_id}`)
    console.log(`NOTIF_REQ_TYPE=${requisiteIds.type}`)
    console.log(`NOTIF_REQ_TITLE=${requisiteIds.title}`)
    console.log(`NOTIF_REQ_MESSAGE=${requisiteIds.message}`)
    console.log(`NOTIF_REQ_PRIORITY=${requisiteIds.priority}`)
    console.log(`NOTIF_REQ_READ=${requisiteIds.read}`)
    console.log(`NOTIF_REQ_LINK=${requisiteIds.link}`)
    console.log(`NOTIF_REQ_ICON=${requisiteIds.icon}`)
    console.log(`NOTIF_REQ_ICON_COLOR=${requisiteIds.icon_color}`)
    console.log(`NOTIF_REQ_METADATA=${requisiteIds.metadata}`)
    console.log(`NOTIF_REQ_CREATED_AT=${requisiteIds.created_at}`)
    console.log(`NOTIF_REQ_UPDATED_AT=${requisiteIds.updated_at}`)
    console.log(`NOTIF_REQ_DELETED=${requisiteIds.deleted}`)
    console.log(`NOTIF_REQ_DELETED_AT=${requisiteIds.deleted_at}`)
    console.log('')
    console.log('# Preferences Table Configuration')
    console.log(`PREFERENCES_TYPE_ID=${preferencesTypeId}`)
    console.log('')
    console.log('# Preferences Requisite IDs')
    console.log(`PREF_REQ_USER_ID=${prefRequisiteIds.user_id}`)
    console.log(`PREF_REQ_CHANNELS=${prefRequisiteIds.channels}`)
    console.log(`PREF_REQ_EMAIL_SETTINGS=${prefRequisiteIds.email_settings}`)
    console.log(`PREF_REQ_PUSH_SETTINGS=${prefRequisiteIds.push_settings}`)
    console.log(`PREF_REQ_DO_NOT_DISTURB=${prefRequisiteIds.do_not_disturb}`)
    console.log(`PREF_REQ_METADATA=${prefRequisiteIds.metadata}`)
    console.log(`PREF_REQ_CREATED_AT=${prefRequisiteIds.created_at}`)
    console.log(`PREF_REQ_UPDATED_AT=${prefRequisiteIds.updated_at}`)
    console.log('')
    console.log('=' .repeat(70))
    console.log('\n✨ Next steps:')
    console.log('1. Copy the configuration above to backend/monolith/.env')
    console.log('2. Restart the backend server')
    console.log('3. Test the notification API endpoints')
    console.log('')

  } catch (error) {
    console.error('\n❌ Error during setup:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

setupNotificationTables()
