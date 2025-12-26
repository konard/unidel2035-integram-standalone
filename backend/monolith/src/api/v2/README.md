# API v2 Implementation

Демонстрационная реализация современного JSON:API формата для Integram Standalone.

## 📁 Структура

```
src/api/v2/
├── index.js                    # Главный роутер для API v2
├── middleware/
│   └── jsonapi.js             # JSON:API 1.1 middleware и helpers
├── routes/
│   ├── info.js                # Discovery endpoints (/api/v2, /health, /openapi.yaml)
│   └── integram.js            # Integram CRUD endpoints (demo)
└── README.md
```

## 🚀 Использование

### Подключение к основному приложению

Добавьте в `backend/monolith/src/index.js`:

```javascript
const apiV2Router = require('./api/v2');

// Mount API v2
app.use('/api/v2', apiV2Router);
```

### Доступные endpoints

#### API Discovery
- `GET /api/v2` - API metadata и endpoints
- `GET /api/v2/health` - Health check
- `GET /api/v2/openapi.yaml` - OpenAPI спецификация (YAML)
- `GET /api/v2/openapi.json` - OpenAPI спецификация (JSON)

#### Integram (Demo)
- `GET /api/v2/integram/databases/{database}/types` - Список таблиц
- `GET /api/v2/integram/databases/{database}/types/{typeId}/metadata` - Структура таблицы
- `GET /api/v2/integram/databases/{database}/types/{typeId}/objects` - Список объектов
- `POST /api/v2/integram/databases/{database}/types/{typeId}/objects` - Создать объект
- `GET /api/v2/integram/databases/{database}/objects/{objectId}` - Получить объект
- `PATCH /api/v2/integram/databases/{database}/objects/{objectId}` - Обновить объект
- `DELETE /api/v2/integram/databases/{database}/objects/{objectId}` - Удалить объект

## 🧪 Тестирование

### cURL примеры

#### API Discovery
```bash
curl http://localhost:8081/api/v2
```

#### Получить список таблиц
```bash
curl http://localhost:8081/api/v2/integram/databases/db1/types
```

#### Создать объект
```bash
curl -X POST http://localhost:8081/api/v2/integram/databases/db1/types/type_clients/objects \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "integram-object",
      "attributes": {
        "requisites": {
          "req_name": "ООО Тестовая",
          "req_email": "test@example.com",
          "req_status": "active"
        }
      }
    }
  }'
```

## 📝 Формат ответов

Все ответы соответствуют стандарту **JSON:API 1.1**:

### Успешный ответ
```json
{
  "jsonapi": {
    "version": "1.1",
    "meta": {
      "apiVersion": "2.0.0",
      "implementation": "integram-standalone"
    }
  },
  "data": {
    "type": "resource-type",
    "id": "resource-id",
    "attributes": { ... },
    "relationships": { ... },
    "links": { ... },
    "meta": { ... }
  },
  "meta": {
    "timestamp": "2025-12-25T10:30:00Z"
  },
  "links": { ... }
}
```

### Ошибка
```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "errors": [
    {
      "id": "err_a1b2c3",
      "status": "400",
      "code": "VALIDATION_ERROR",
      "title": "Validation Error",
      "detail": "Field is required",
      "source": {
        "pointer": "/data/attributes/name"
      }
    }
  ],
  "meta": {
    "timestamp": "2025-12-25T10:30:00Z"
  }
}
```

## 🔧 Middleware

### jsonApiMiddleware

Добавляет helper методы в `res` объект:

- `res.jsonApi.success(data, options)` - Успешный ответ (200)
- `res.jsonApi.error(errors, statusCode, options)` - Ответ с ошибкой
- `res.jsonApi.created(data, location, options)` - Создано (201)
- `res.jsonApi.noContent()` - Нет контента (204)

### jsonApiErrorHandler

Обрабатывает все ошибки и возвращает их в JSON:API формате.

## 🔒 Безопасность

### TODO: Добавить authentication middleware
```javascript
const { authenticate } = require('../middleware/auth/auth');

router.use(authenticate); // Требовать авторизацию для всех v2 endpoints
```

### TODO: Добавить rate limiting
```javascript
const { apiLimiter } = require('../middleware/security/rateLimiter');

router.use(apiLimiter); // Rate limiting
```

## 📚 Документация

Полная документация доступна в:

- `/docs/api/MODERN_API_FORMAT.md` - Спецификация формата
- `/docs/api/openapi-v2.yaml` - OpenAPI 3.1 схема
- `/docs/api/EXAMPLES.md` - Практические примеры

## ⚠️ Статус

**Статус**: Proof of Concept (Demo)

Текущая реализация использует **mock данные** для демонстрации формата API.

### Для production использования необходимо:

1. ✅ Интеграция с существующим Integram API
2. ✅ Добавить authentication middleware
3. ✅ Добавить rate limiting
4. ✅ Реализовать реальные CRUD операции
5. ✅ Добавить validation схемы
6. ✅ Добавить unit и integration тесты
7. ✅ Добавить routes для:
   - Authentication (`/api/v2/auth/*`)
   - Chat (`/api/v2/chat`)
   - Users (`/api/v2/users/*`)
   - AI Tokens (`/api/v2/ai-access-tokens/*`)

## 🤝 Вклад

При добавлении новых endpoints:

1. Следуйте JSON:API 1.1 спецификации
2. Используйте helper функции из `middleware/jsonapi.js`
3. Добавляйте `links` для HATEOAS
4. Включайте `meta` информацию
5. Обрабатывайте ошибки через `res.jsonApi.error()`
6. Обновляйте OpenAPI спецификацию

## 📖 Примеры использования helpers

### Создание resource
```javascript
const { createResource } = require('../middleware/jsonapi');

const user = createResource('users', userId, {
  username: 'john',
  email: 'john@example.com'
}, {
  links: {
    self: `/api/v2/users/${userId}`
  },
  meta: {
    createdAt: '2025-01-01T00:00:00Z'
  }
});
```

### Pagination links
```javascript
const { createPaginationLinks } = require('../middleware/jsonapi');

const links = createPaginationLinks('/api/v2/users', page, limit, total);
// => { self, first, prev, next, last }
```

### Relationships
```javascript
const { createRelationship } = require('../middleware/jsonapi');

const relationship = createRelationship('organizations', orgId, {
  links: {
    related: `/api/v2/organizations/${orgId}`
  }
});
```
