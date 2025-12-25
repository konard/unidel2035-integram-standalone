/**
 * Integram Table IDs for General Chat Feature
 * Created: 2025-12-24
 * Database: my
 */

export const CHAT_TABLES = {
  // Справочник типов чатов
  CHAT_TYPES: {
    TABLE_ID: 217731,
    VALUES: {
      PERSONAL: 217732,    // Личный чат
      GROUP: 217733,       // Групповой чат
      CHANNEL: 217734      // Канал
    }
  },

  // Основная таблица чат-румов
  CHAT_ROOMS: {
    TABLE_ID: 217735,
    REQUISITES: {
      NAME: 217736,           // Название
      DESCRIPTION: 217737,    // Описание
      CREATED_AT: 217739,     // Создан
      IS_ACTIVE: 217741,      // Активен
      TYPE_REF: 217771,       // Тип → Типы чат-румов
      CREATOR_REF: 217772,    // Создатель → User
      MESSAGES_REF: 217777,   // Сообщения → Сообщения чата
      MEMBERS_REF: 217781     // Участники → Участники чата
    }
  },

  // Таблица сообщений
  MESSAGES: {
    TABLE_ID: 217742,
    REQUISITES: {
      TEXT: 217744,           // Текст
      SENT_AT: 217746,        // Время отправки
      EDITED_AT: 217748,      // Изменено
      IS_DELETED: 217750,     // Удалено
      AUTHOR_REF: 217773,     // Автор → User (обязательное)
      REPLY_TO_REF: 217775,   // Ответ на → Сообщения чата
      FILES_REF: 217779       // Файлы → Файлы сообщений
    }
  },

  // Таблица файлов
  FILES: {
    TABLE_ID: 217751,
    REQUISITES: {
      FILENAME: 217753,       // Имя файла
      URL: 217755,            // URL
      SIZE: 217757,           // Размер (байты)
      MIME_TYPE: 217759,      // MIME тип
      UPLOADED_AT: 217761     // Загружен
    }
  },

  // Таблица участников
  MEMBERS: {
    TABLE_ID: 217762,
    REQUISITES: {
      ROLE: 217764,           // Роль
      JOINED_AT: 217766,      // Добавлен
      LAST_READ_AT: 217768,   // Последнее чтение
      IS_ACTIVE: 217769,      // Активен
      USER_REF: 217776        // Пользователь → User (обязательное)
    }
  }
}

export default CHAT_TABLES
