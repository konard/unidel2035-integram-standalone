# Integram Playwright Tests

Автоматизированные тесты для Integram Standalone Application с использованием Playwright.

## Структура тестов

```
tests/
├── fixtures/
│   └── integram-fixtures.js    # Фикстуры для тестов (аутентификация, тестовые таблицы)
├── helpers/
│   └── integram-api.js         # Хелперы для работы с Integram API
├── table-create.spec.js        # Тесты на создание таблиц
├── table-columns.spec.js       # Тесты на редактирование колонок
├── table-cells.spec.js         # Тесты на редактирование ячеек (объектов)
├── table-subordinate.spec.js   # Тесты на подчиненность таблиц
└── table-references.spec.js    # Тесты на справочники (reference fields)
```

## Настройка

### Переменные окружения

Создайте файл `.env.test` или установите переменные окружения:

```bash
INTEGRAM_URL=https://dronedoc.ru
INTEGRAM_DB=a2025
INTEGRAM_LOGIN=your_login
INTEGRAM_PASSWORD=your_password
```

### Установка зависимостей

```bash
npm install
npx playwright install chromium
```

## Запуск тестов

### Все тесты
```bash
npm test
```

### Тесты с UI
```bash
npm run test:ui
```

### Тесты в headed режиме (с браузером)
```bash
npm run test:headed
```

### Отладка тестов
```bash
npm run test:debug
```

### Отчет по тестам
```bash
npm run test:report
```

### Запуск конкретного файла тестов
```bash
npx playwright test tests/table-create.spec.js
```

### Запуск конкретного теста
```bash
npx playwright test -g "should create a new table"
```

## Описание тестов

### 1. Table Creation Tests (table-create.spec.js)

Тесты на создание таблиц:
- Создание таблицы через UI
- Создание таблицы через API
- Навигация к созданной таблице
- Отображение колонок таблицы
- Проверка роута `/integram/my/table/:id`

### 2. Table Column Editing Tests (table-columns.spec.js)

Тесты на редактирование колонок:
- Добавление новой колонки в существующую таблицу
- Переименование alias колонки
- Добавление колонки через UI
- Добавление различных типов колонок (текст, число, дата, булево)
- Отображение добавленных колонок в представлении таблицы
- Порядок колонок

### 3. Table Cell Editing Tests (table-cells.spec.js)

Тесты на редактирование ячеек (объектов):
- Создание новой записи через API
- Создание записи с requisites
- Обновление requisites объекта
- Создание и редактирование объекта через UI
- Редактирование существующей ячейки
- Удаление объекта
- Создание множественных объектов
- Отображение созданных объектов в таблице

### 4. Table Subordinate Relationship Tests (table-subordinate.spec.js)

Тесты на подчиненность таблиц:
- Создание структуры родитель-ребенок
- Создание дочернего объекта с привязкой к родителю
- Создание множественных детей для одного родителя
- Отображение связей родитель-ребенок в UI
- Навигация от родителя к дочерней таблице
- Каскадное удаление (родитель удаляет детей)
- Многоуровневая иерархия (дедушка -> родитель -> ребенок)

### 5. Table Reference Field Tests (table-references.spec.js)

Тесты на справочники (reference fields):
- Создание таблицы со справочным полем
- Создание lookup (справочной) таблицы
- Привязка объекта к значению справочника
- Отображение справочного поля как dropdown в UI
- Фильтрация по справочному полю
- Создание множественных справочных полей в одной таблице
- Обработка циклических ссылок
- Отображение значений справочников в представлении таблицы
- Обновление значения справочного поля

## Фикстуры

### api
Предоставляет authenticated API helper для работы с Integram API.

Пример:
```javascript
test('example', async ({ api }) => {
  const tableId = await api.createTable('MyTable', [
    { typeId: 3, alias: 'Название' }
  ]);
});
```

### authenticatedPage
Предоставляет аутентифицированную страницу Playwright.

Пример:
```javascript
test('example', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/integram/my/table/123');
});
```

### testTable
Создает временную таблицу с предопределенными колонками для тестирования.

Пример:
```javascript
test('example', async ({ testTable }) => {
  const { tableId, tableName } = testTable;
  // Таблица автоматически удалится после теста
});
```

### testTableWithReference
Создает таблицу со справочником для тестирования reference fields.

### parentChildTables
Создает пару таблиц родитель-ребенок для тестирования подчиненности.

## Хелперы

### IntegramAPI

Класс для работы с Integram API:

- `authenticate(login, password)` - Аутентификация
- `createTable(tableName, columns)` - Создание таблицы
- `addColumn(tableId, requisiteTypeId, alias)` - Добавление колонки
- `setRequisiteAlias(requisiteId, alias)` - Установка alias колонки
- `deleteTable(tableId)` - Удаление таблицы
- `createObject(typeId, value, requisites)` - Создание объекта
- `updateObjectRequisites(objectId, requisites)` - Обновление requisites
- `deleteObject(objectId)` - Удаление объекта

## Типы полей (Requisite Types)

- `3` - Короткий текст (SHORT)
- `2` - Длинный текст (LONG)
- `13` - Число (NUMBER)
- `4` - Дата и время (DATETIME)
- `7` - Логическое (BOOL)
- `8` - Ссылка (REFERENCE)

## Отладка

### Скриншоты
Playwright автоматически делает скриншоты при падении тестов.

### Trace
Для просмотра trace файлов:
```bash
npx playwright show-trace trace.zip
```

### Медленное выполнение
Для замедления выполнения тестов:
```bash
npx playwright test --slow-mo=1000
```

## CI/CD

Тесты настроены для запуска в CI окружениях. В CI автоматически:
- Используется headless режим
- Применяются retries (2 попытки)
- Используется 1 worker

## Troubleshooting

### Тест падает из-за timeout
Увеличьте timeout в конфигурации или в конкретном тесте:
```javascript
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60 секунд
});
```

### Не могу найти элемент в UI
Используйте селектор Playwright:
```bash
npx playwright codegen http://localhost:5173
```

### API возвращает 401
Проверьте учетные данные в переменных окружения.

## Контрибуция

При добавлении новых тестов:
1. Используйте существующие фикстуры где возможно
2. Очищайте созданные данные в конце теста
3. Добавляйте описательные названия тестов
4. Обновляйте этот README при необходимости
