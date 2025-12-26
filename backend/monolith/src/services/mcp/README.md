# Integram MCP Server (API v2)

Model Context Protocol (MCP) server для работы с Integram API v2.

## Описание

Этот MCP сервер предоставляет инструменты для работы с Integram database через API v2. Сервер использует современную архитектуру с полной поддержкой всех возможностей Integram API.

## Особенности

- ✅ Полная поддержка Integram API v2
- ✅ 70+ инструментов для работы с базой данных
- ✅ Автоматическое определение формата URL (dronedoc.ru, app.integram.io)
- ✅ Поддержка аутентификации и управления сессиями
- ✅ DDL операции (создание таблиц, колонок)
- ✅ DML операции (CRUD для данных)
- ✅ Запросы и отчеты
- ✅ Работа с multiselect полями
- ✅ Высокоуровневые операции (batch создание, клонирование)
- ✅ Smart query и natural language query
- ✅ Корректная обработка datetime полей

## Установка

### Зависимости

Убедитесь, что установлены все необходимые пакеты:

```bash
npm install
```

Требуемые зависимости (уже включены в package.json):
- `@modelcontextprotocol/sdk` - MCP SDK
- `axios` - HTTP клиент

### Конфигурация MCP

Создайте файл `.mcp.json` в корне проекта:

```json
{
  "mcpServers": {
    "integram": {
      "command": "node",
      "args": ["backend/monolith/src/services/mcp/integram-server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Для Claude Desktop, добавьте конфигурацию в `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) или соответствующий файл для других ОС:

```json
{
  "mcpServers": {
    "integram": {
      "command": "node",
      "args": ["/absolute/path/to/backend/monolith/src/services/mcp/integram-server.js"]
    }
  }
}
```

## Использование

### Базовый workflow

1. **Аутентификация:**
```javascript
// Через integram_authenticate
{
  "serverURL": "https://dronedoc.ru",
  "database": "a2025",
  "login": "username",
  "password": "password"
}

// Или через integram_set_context (если уже есть токен)
{
  "serverURL": "https://dronedoc.ru",
  "database": "a2025",
  "token": "your-token",
  "xsrfToken": "your-xsrf"
}
```

2. **Получение списка таблиц:**
```javascript
// integram_get_dictionary
// Возвращает все таблицы в базе
```

3. **Получение структуры таблицы:**
```javascript
// integram_get_type_metadata
{
  "typeId": 123
}
```

4. **Создание объектов:**
```javascript
// integram_create_object
{
  "typeId": 123,
  "value": "Название объекта",
  "requisites": {
    "456": "Значение поля 1",
    "789": "Значение поля 2"
  }
}
```

### Основные инструменты

#### Аутентификация
- `integram_authenticate` - Аутентификация по логину/паролю
- `integram_set_context` - Установка контекста из существующей сессии

#### DDL (структура данных)
- `integram_create_type` - Создать таблицу
- `integram_add_requisite` - Добавить колонку
- `integram_save_requisite_alias` - Задать имя колонки
- `integram_create_table_with_columns` - Создать таблицу со всеми колонками за раз

#### DML (данные)
- `integram_create_object` - Создать запись
- `integram_set_object_requisites` - Обновить поля (рекомендуется)
- `integram_save_object` - Сохранить запись
- `integram_delete_object` - Удалить запись

#### Запросы
- `integram_get_dictionary` - Список всех таблиц
- `integram_get_type_metadata` - Структура таблицы
- `integram_get_object_list` - Получить страницу объектов
- `integram_get_all_objects` - Получить ВСЕ объекты (с пагинацией)
- `integram_execute_report` - Выполнить отчет

#### Высокоуровневые операции
- `integram_get_schema` - Получить компактную схему БД
- `integram_smart_query` - SQL-подобные запросы
- `integram_natural_query` - Запросы на естественном языке
- `integram_create_objects_batch` - Массовое создание
- `integram_create_parent_with_children` - Создать родителя с детьми

## Примеры использования

### Создание простой таблицы

```javascript
// 1. Создать таблицу с колонками
integram_create_table_with_columns({
  "tableName": "Клиенты",
  "columns": [
    {
      "requisiteTypeId": 3,  // SHORT (короткий текст)
      "alias": "Название"
    },
    {
      "requisiteTypeId": 13, // NUMBER
      "alias": "ИНН"
    },
    {
      "requisiteTypeId": 2,  // LONG (длинный текст)
      "alias": "Описание"
    }
  ]
})
```

### Поиск данных

```javascript
// Простой поиск
integram_natural_query({
  "question": "Найди всех клиентов с ИНН",
  "limit": 50
})

// Продвинутый поиск с WHERE
integram_smart_query({
  "tables": [{"id": 123, "alias": "c"}],
  "columns": [
    {"field": 123, "name": "Клиент"},
    {"field": 456, "name": "ИНН"}
  ],
  "where": "c.456 IS NOT NULL"
})
```

### Создание справочника с выпадающим списком

```javascript
// Создать справочник и добавить его как колонку
integram_create_lookup_with_reference({
  "targetTableId": 123,           // ID таблицы, куда добавляем колонку
  "lookupTableName": "Типы клиентов",
  "values": ["ИП", "ООО", "ПАО", "АО"],
  "columnAlias": "Тип клиента"
})
```

## Архитектура Integram

### Важные концепции

1. **Единая таблица данных**: Все данные хранятся в одной таблице с полями (id, up, t, val, ord)
   - `id` - уникальный ID объекта
   - `up` - ID родителя (0 = независимый, >0 = подчиненный)
   - `t` - ID типа (какой это объект)
   - `val` - значение/имя объекта
   - `ord` - порядок

2. **Типы (таблицы)**: Объекты с up=0, их t указывает на базовый тип

3. **Справочники (reference columns)**: Создаются через промежуточный тип с ref атрибутом

4. **baseTypeId**: ДОЛЖЕН быть системным типом (обычно 3), НЕ ID пользовательской таблицы!

### Системные типы requisites

- `3` - SHORT (короткий текст до 255 символов)
- `8` - CHARS (текст)
- `2` - LONG (длинный текст)
- `13` - NUMBER (число)
- `14` - SIGNED (число со знаком)
- `4` - DATETIME (дата и время)
- `9` - DATE (только дата)
- `7` - BOOL (логическое)
- `11` - BOOLEAN (альтернативное логическое)
- `12` - MEMO (большой текст)
- `10` - FILE (файл)

## Отладка

Сервер логирует ошибки в stderr:

```bash
# Запуск с логами
node backend/monolith/src/services/mcp/integram-server.js 2>integram-mcp.log
```

## Тестирование

Запустите тесты:

```bash
npm test
```

Тесты находятся в `backend/monolith/src/services/mcp/__tests__/`

## Связанные файлы

- `integram-server.js` - MCP сервер (этот файл)
- `IntegramMCPClient.js` - Клиент для Integram API
- `MCPBridge.js` - HTTP мост для MCP
- `MCPTools.js` - Инструменты для работы с MCP
- `integram-tools.js` - Определения инструментов для AI

## Лицензия

MIT

## Авторы

Integram Team
