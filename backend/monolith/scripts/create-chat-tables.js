/**
 * Создание структуры БД для Общего чата в Integram
 * Использует Integram Client для создания таблиц с правильной структурой
 */

import { IntegramClient, REQUISITE_TYPES } from '../src/services/integram/integram-client.js'

const INTEGRAM_CONFIG = {
  serverURL: 'https://dronedoc.ru',
  database: 'my',
  login: 'd',
  password: 'd'
}

async function createChatStructure() {
  console.log('🚀 Создание структуры БД для Общего чата...\n')

  const client = new IntegramClient(INTEGRAM_CONFIG.serverURL, INTEGRAM_CONFIG.database)

  try {
    // Authenticate
    console.log('🔐 Авторизация...')
    await client.authenticate(INTEGRAM_CONFIG.login, INTEGRAM_CONFIG.password)
    console.log('✅ Авторизация успешна\n')

    // Test: Get dictionary to verify auth works
    console.log('🧪 Проверка доступа к словарю...')
    const dictRes = await client.getDictionary()
    console.log(`✅ Словарь получен, количество типов: ${dictRes.types?.length || 0}\n`)

    // ============= 1. СПРАВОЧНИК: Типы чат-румов =============
    console.log('📖 Создание справочника "Типы чат-румов"...')
    const chatTypeRes = await client.createType('Типы чат-румов', { baseTypeId: 1, unique: true })
    console.log('DEBUG: chatTypeRes =', JSON.stringify(chatTypeRes, null, 2))
    const chatTypeId = chatTypeRes.ID || chatTypeRes.id
    console.log(`✅ Создан справочник ID: ${chatTypeId}\n`)

    // Заполняем справочник типами
    await client.createObject(chatTypeId, 'Личный чат')
    await client.createObject(chatTypeId, 'Групповой чат')
    await client.createObject(chatTypeId, 'Канал')
    console.log('✅ Добавлены типы чатов\n')

    // ============= 2. ОСНОВНАЯ ТАБЛИЦА: Чат-румы =============
    console.log('📁 Создание таблицы "Чат-румы"...')
    const chatRoomRes = await client.createType('Чат-румы', { baseTypeId: 1 })
    const chatRoomId = chatRoomRes.ID || chatRoomRes.id
    console.log(`✅ Создана таблица ID: ${chatRoomId}`)

    // Реквизиты чат-рума
    const titleReq = await client.addRequisite(chatRoomId, REQUISITE_TYPES.SHORT)
    await client.saveRequisiteAlias(titleReq.ID || titleReq.id, 'Название')

    const descReq = await client.addRequisite(chatRoomId, REQUISITE_TYPES.LONG)
    await client.saveRequisiteAlias(descReq.ID || descReq.id, 'Описание')

    // Тип чата (ссылка на справочник)
    await client.addReferenceColumn(chatRoomId, chatTypeId, 'Тип', { allowNull: true })

    const createdReq = await client.addRequisite(chatRoomId, REQUISITE_TYPES.DATETIME)
    await client.saveRequisiteAlias(createdReq.ID || createdReq.id, 'Создан')

    const activeReq = await client.addRequisite(chatRoomId, REQUISITE_TYPES.BOOL)
    await client.saveRequisiteAlias(activeReq.ID || activeReq.id, 'Активен')

    // Создатель (ссылка на таблицу Пользователи ID=18)
    await client.addReferenceColumn(chatRoomId, 18, 'Создатель', { allowNull: true })

    console.log('✅ Добавлены реквизиты чат-рума\n')

    // ============= 3. ПОДЧИНЕННАЯ ТАБЛИЦА: Сообщения =============
    console.log('📄 Создание подчиненной таблицы "Сообщения"...')
    const messageRes = await client.createType('Сообщения чата', { baseTypeId: 1 })
    const messageId = messageRes.ID || messageRes.id
    console.log(`✅ Создана таблица ID: ${messageId}`)

    // Реквизиты сообщения
    const textReq = await client.addRequisite(messageId, REQUISITE_TYPES.LONG)
    await client.saveRequisiteAlias(textReq.ID || textReq.id, 'Текст')

    // Автор (ссылка на Пользователи)
    await client.addReferenceColumn(messageId, 18, 'Автор', { allowNull: false })

    const sentReq = await client.addRequisite(messageId, REQUISITE_TYPES.DATETIME)
    await client.saveRequisiteAlias(sentReq.ID || sentReq.id, 'Время отправки')

    const editedReq = await client.addRequisite(messageId, REQUISITE_TYPES.DATETIME)
    await client.saveRequisiteAlias(editedReq.ID || editedReq.id, 'Изменено')

    const deletedReq = await client.addRequisite(messageId, REQUISITE_TYPES.BOOL)
    await client.saveRequisiteAlias(deletedReq.ID || deletedReq.id, 'Удалено')

    // Ответ на сообщение (ссылка на другое сообщение)
    await client.addReferenceColumn(messageId, messageId, 'Ответ на', { allowNull: true })

    console.log('✅ Добавлены реквизиты сообщения')

    // Связываем Сообщения с Чат-румами как подчиненную таблицу
    console.log('🔗 Связываем Сообщения с Чат-румами...')
    await client.addReferenceColumn(chatRoomId, messageId, 'Сообщения', { allowNull: true })
    console.log('✅ Подчиненная таблица связана\n')

    // ============= 4. ПОДЧИНЕННАЯ ТАБЛИЦА: Файлы =============
    console.log('📎 Создание подчиненной таблицы "Файлы сообщений"...')
    const fileRes = await client.createType('Файлы сообщений', { baseTypeId: 1 })
    const fileId = fileRes.ID || fileRes.id
    console.log(`✅ Создана таблица ID: ${fileId}`)

    // Реквизиты файла
    const filenameReq = await client.addRequisite(fileId, REQUISITE_TYPES.SHORT)
    await client.saveRequisiteAlias(filenameReq.ID || filenameReq.id, 'Имя файла')

    const urlReq = await client.addRequisite(fileId, REQUISITE_TYPES.SHORT)
    await client.saveRequisiteAlias(urlReq.ID || urlReq.id, 'URL')

    const sizeReq = await client.addRequisite(fileId, REQUISITE_TYPES.NUMBER)
    await client.saveRequisiteAlias(sizeReq.ID || sizeReq.id, 'Размер (байты)')

    const mimeReq = await client.addRequisite(fileId, REQUISITE_TYPES.SHORT)
    await client.saveRequisiteAlias(mimeReq.ID || mimeReq.id, 'MIME тип')

    const uploadedReq = await client.addRequisite(fileId, REQUISITE_TYPES.DATETIME)
    await client.saveRequisiteAlias(uploadedReq.ID || uploadedReq.id, 'Загружен')

    console.log('✅ Добавлены реквизиты файла')

    // Связываем Файлы с Сообщениями
    console.log('🔗 Связываем Файлы с Сообщениями...')
    await client.addReferenceColumn(messageId, fileId, 'Файлы', { allowNull: true })
    console.log('✅ Подчиненная таблица связана\n')

    // ============= 5. ПОДЧИНЕННАЯ ТАБЛИЦА: Участники чата =============
    console.log('👥 Создание подчиненной таблицы "Участники чата"...')
    const memberRes = await client.createType('Участники чата', { baseTypeId: 1 })
    const memberId = memberRes.ID || memberRes.id
    console.log(`✅ Создана таблица ID: ${memberId}`)

    // Реквизиты участника
    await client.addReferenceColumn(memberId, 18, 'Пользователь', { allowNull: false })

    const roleReq = await client.addRequisite(memberId, REQUISITE_TYPES.SHORT)
    await client.saveRequisiteAlias(roleReq.ID || roleReq.id, 'Роль')

    const joinedReq = await client.addRequisite(memberId, REQUISITE_TYPES.DATETIME)
    await client.saveRequisiteAlias(joinedReq.ID || joinedReq.id, 'Добавлен')

    const lastReadReq = await client.addRequisite(memberId, REQUISITE_TYPES.DATETIME)
    await client.saveRequisiteAlias(lastReadReq.ID || lastReadReq.id, 'Последнее чтение')

    const memberActiveReq = await client.addRequisite(memberId, REQUISITE_TYPES.BOOL)
    await client.saveRequisiteAlias(memberActiveReq.ID || memberActiveReq.id, 'Активен')

    console.log('✅ Добавлены реквизиты участника')

    // Связываем Участников с Чат-румами
    console.log('🔗 Связываем Участников с Чат-румами...')
    await client.addReferenceColumn(chatRoomId, memberId, 'Участники', { allowNull: true })
    console.log('✅ Подчиненная таблица связана\n')

    // ============= ИТОГОВАЯ ИНФОРМАЦИЯ =============
    console.log('\n✨ СТРУКТУРА СОЗДАНА УСПЕШНО!\n')
    console.log('📊 Созданные таблицы:')
    console.log(`  1. Типы чат-румов (${chatTypeId}) - Справочник`)
    console.log(`  2. Чат-румы (${chatRoomId}) - Основная таблица`)
    console.log(`  3. Сообщения чата (${messageId}) - Подчиненная к Чат-румам`)
    console.log(`  4. Файлы сообщений (${fileId}) - Подчиненная к Сообщениям`)
    console.log(`  5. Участники чата (${memberId}) - Подчиненная к Чат-румам`)
    console.log('\n🔗 Связи:')
    console.log('  • Чат-румы → Сообщения (1:N)')
    console.log('  • Сообщения → Файлы (1:N)')
    console.log('  • Чат-румы → Участники (1:N)')
    console.log('  • Сообщения → Ответ на сообщение (N:1)')
    console.log('\n📝 Поля:')
    console.log('  Chat Room: Название, Описание, Тип, Создан, Активен, Создатель')
    console.log('  Message: Текст, Автор, Время отправки, Изменено, Удалено, Ответ на')
    console.log('  File: Имя файла, URL, Размер (байты), MIME тип, Загружен')
    console.log('  Member: Пользователь, Роль, Добавлен, Последнее чтение, Активен')

    console.log('\n🎯 Следующий шаг: Создайте chatService.js для работы с этими таблицами')

    return {
      chatTypeId,
      chatRoomId,
      messageId,
      fileId,
      memberId
    }

  } catch (error) {
    console.error('❌ Ошибка при создании структуры:', error.message)
    if (error.response) {
      console.error('Response data:', error.response.data)
    }
    throw error
  }
}

// Запуск
createChatStructure()
  .then(() => {
    console.log('\n✅ Готово!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Провал:', error)
    process.exit(1)
  })
