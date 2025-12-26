# Современный формат API Интеграм

## 📋 Обзор

Данный документ описывает **современный альтернативный формат JSON API** для Integram Standalone, разработанный специально для однозначного понимания моделями искусственного интеллекта.

**Версия спецификации**: 1.0.0
**Дата**: 2025-12-25
**Статус**: Предложение (Proposal)

---

## 🎯 Цели и принципы

### Цели
1. **AI-First дизайн** - формат должен быть легко понятен моделям ИИ без дополнительных пояснений
2. **Однозначность** - каждый элемент API имеет четкое, недвусмысленное значение
3. **Самодокументируемость** - структура данных содержит метаинформацию о типах и ограничениях
4. **Обратная совместимость** - новый формат существует параллельно с текущим API

### Принципы проектирования
- **JSON:API совместимость** - следует стандарту [JSON:API](https://jsonapi.org/) для структурирования ответов
- **OpenAPI 3.1** - полная спецификация доступна в машиночитаемом формате
- **REST maturity level 3** - использование HATEOAS для навигации по API
- **Строгая типизация** - все поля имеют явные типы данных
- **Predictable структура** - унифицированный формат для всех endpoint'ов

---

## 🔐 Модель авторизации

### 1. Формат передачи токенов

#### 1.1 JWT Token Structure

```json
{
  "type": "jwt",
  "version": "1.0",
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "integram-key-2025-01"
  },
  "payload": {
    "iss": "integram-auth-service",
    "sub": "user:550e8400-e29b-41d4-a716-446655440000",
    "aud": ["integram-api", "integram-ws"],
    "exp": 1735200000,
    "iat": 1735199100,
    "nbf": 1735199100,
    "jti": "tok_a1b2c3d4e5f6",
    "scope": ["read:objects", "write:objects", "admin:types"],
    "context": {
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "username": "user@example.com",
      "email": "user@example.com",
      "displayName": "Иван Иванов",
      "roles": ["user", "developer"],
      "organizationId": "org_123456",
      "databases": ["db1", "db2"],
      "sessionId": "ses_987654321"
    }
  }
}
```

#### 1.2 Token Transmission Methods

**Приоритет методов (от более безопасного к менее):**

1. **HTTP-Only Cookie** (рекомендуется)
   ```http
   Cookie: integram_access_token=eyJhbGc...
   ```
   - Защита от XSS атак
   - Автоматическая отправка браузером
   - Настройки: `Secure; SameSite=Strict; HttpOnly`

2. **Authorization Header** (для API клиентов)
   ```http
   Authorization: Bearer eyJhbGc...
   ```
   - Стандартный метод для REST API
   - Используется мобильными приложениями и сервисами

3. **Custom Header** (альтернатива)
   ```http
   X-Integram-Token: eyJhbGc...
   ```
   - Для особых случаев (WebSocket, SSE)

**Неподдерживаемые методы:**
- ❌ Query параметры (`?token=...`) - уязвимо к логированию
- ❌ Request body - неправильное использование HTTP семантики

#### 1.3 Token Types

```typescript
enum TokenType {
  ACCESS = "access",          // Короткоживущий токен доступа (15 минут)
  REFRESH = "refresh",        // Токен обновления (7 дней)
  API_KEY = "api_key",        // Постоянный API ключ
  SESSION = "session",        // Токен сессии для unified auth
  TEMP = "temp"              // Временный токен (верификация email)
}
```

### 2. Модель ключей API

#### 2.1 AI Access Token Schema

```json
{
  "id": "tok_a1b2c3d4e5f6g7h8",
  "type": "ai_access_token",
  "attributes": {
    "name": "Production API Key - ChatBot Service",
    "tokenHash": "sha256:1a2b3c4d...",
    "tokenPrefix": "sk_prod_",
    "scopes": [
      "chat:read",
      "chat:write",
      "integram:read",
      "integram:write"
    ],
    "allowedModels": [
      "openai/gpt-4o",
      "anthropic/claude-3.5-sonnet",
      "polza/*"
    ],
    "allowedApplications": [
      "app_chatbot_prod",
      "app_analytics_dashboard"
    ],
    "rateLimits": {
      "requestsPerMinute": 60,
      "tokensPerMinute": 100000,
      "requestsPerDay": 10000,
      "tokensPerDay": 5000000
    },
    "quotas": {
      "tokenBalance": 10000000,
      "dailyLimit": 500000,
      "monthlyLimit": 10000000,
      "resetDay": 1
    },
    "security": {
      "ipWhitelist": ["192.168.1.0/24", "10.0.0.5"],
      "ipBlacklist": [],
      "requireHttps": true,
      "allowedOrigins": ["https://integram.example.com"]
    },
    "metadata": {
      "environment": "production",
      "department": "engineering",
      "costCenter": "CC-2025-AI",
      "owner": "user@example.com"
    },
    "status": {
      "isActive": true,
      "isSuspended": false,
      "suspensionReason": null,
      "lastUsedAt": "2025-12-25T10:30:00Z",
      "usageCount": 15234
    },
    "timestamps": {
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-12-25T09:00:00Z",
      "expiresAt": "2026-01-01T00:00:00Z",
      "lastRotatedAt": "2025-11-01T00:00:00Z"
    }
  },
  "relationships": {
    "user": {
      "data": {
        "type": "users",
        "id": "550e8400-e29b-41d4-a716-446655440000"
      }
    },
    "organization": {
      "data": {
        "type": "organizations",
        "id": "org_123456"
      }
    }
  },
  "links": {
    "self": "/api/v2/ai-access-tokens/tok_a1b2c3d4e5f6g7h8",
    "usage": "/api/v2/ai-access-tokens/tok_a1b2c3d4e5f6g7h8/usage",
    "rotate": "/api/v2/ai-access-tokens/tok_a1b2c3d4e5f6g7h8/rotate"
  }
}
```

#### 2.2 AI Provider Key Schema

```json
{
  "id": "pkey_anthropic_default",
  "type": "ai_provider_key",
  "attributes": {
    "provider": "anthropic",
    "displayName": "Anthropic (Claude)",
    "keyName": "default",
    "apiKeyEncrypted": "enc:AES256:iv:aabbccdd...:data:11223344...",
    "encryptionAlgorithm": "AES-256-GCM",
    "isDefault": true,
    "isActive": true,
    "capabilities": [
      "chat",
      "streaming",
      "tools",
      "vision"
    ],
    "limits": {
      "maxTokens": 200000,
      "maxRequestsPerMinute": 50,
      "tier": "tier-4"
    },
    "metadata": {
      "addedBy": "admin@example.com",
      "purpose": "production-ai-chat",
      "budget": "unlimited"
    },
    "status": {
      "isVerified": true,
      "lastVerifiedAt": "2025-12-25T08:00:00Z",
      "errorCount": 0,
      "lastError": null
    },
    "timestamps": {
      "createdAt": "2025-11-07T10:00:00Z",
      "updatedAt": "2025-12-25T08:00:00Z",
      "expiresAt": null
    }
  },
  "links": {
    "self": "/api/v2/ai-provider-keys/pkey_anthropic_default",
    "verify": "/api/v2/ai-provider-keys/pkey_anthropic_default/verify",
    "rotate": "/api/v2/ai-provider-keys/pkey_anthropic_default/rotate"
  }
}
```

#### 2.3 Session Token Schema (Unified Auth)

```json
{
  "id": "ses_xyz789abc123",
  "type": "session",
  "attributes": {
    "sessionId": "ses_xyz789abc123",
    "databases": {
      "db1": {
        "token": "db1_token_encrypted",
        "xsrf": "xsrf_token_123",
        "userId": "user_id_in_db1",
        "userName": "Иван Иванов",
        "userRole": "administrator",
        "connectedAt": "2025-12-25T10:00:00Z",
        "lastActivity": "2025-12-25T10:30:00Z",
        "status": "active"
      },
      "db2": {
        "token": "db2_token_encrypted",
        "xsrf": "xsrf_token_456",
        "userId": "user_id_in_db2",
        "userName": "Иван Иванов",
        "userRole": "user",
        "connectedAt": "2025-12-25T10:00:00Z",
        "lastActivity": "2025-12-25T10:25:00Z",
        "status": "active"
      }
    },
    "config": {
      "mfaEnabled": true,
      "ssoProvider": "google",
      "persistTokens": true,
      "autoRenew": true
    },
    "security": {
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "mfaVerified": true,
      "mfaVerifiedAt": "2025-12-25T10:00:00Z"
    },
    "timestamps": {
      "createdAt": "2025-12-25T10:00:00Z",
      "expiresAt": "2025-12-25T18:00:00Z",
      "lastActivity": "2025-12-25T10:30:00Z"
    }
  },
  "links": {
    "self": "/api/v2/unified-auth/sessions/ses_xyz789abc123",
    "tokens": "/api/v2/unified-auth/sessions/ses_xyz789abc123/tokens",
    "refresh": "/api/v2/unified-auth/sessions/ses_xyz789abc123/refresh",
    "logout": "/api/v2/unified-auth/sessions/ses_xyz789abc123/logout"
  }
}
```

---

## 📡 Унифицированный формат ответов

### 1. Структура успешного ответа (JSON:API)

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
    "attributes": {
      "field1": "value1",
      "field2": 123
    },
    "relationships": {
      "related": {
        "data": {
          "type": "related-type",
          "id": "related-id"
        },
        "links": {
          "self": "/api/v2/resources/resource-id/relationships/related",
          "related": "/api/v2/related-type/related-id"
        }
      }
    },
    "links": {
      "self": "/api/v2/resources/resource-id"
    },
    "meta": {
      "createdAt": "2025-12-25T10:00:00Z",
      "updatedAt": "2025-12-25T10:30:00Z"
    }
  },
  "included": [
    {
      "type": "related-type",
      "id": "related-id",
      "attributes": {
        "name": "Related Resource"
      }
    }
  ],
  "meta": {
    "requestId": "req_a1b2c3d4",
    "timestamp": "2025-12-25T10:30:00Z",
    "processingTime": 45,
    "cached": false,
    "cacheExpiry": null
  },
  "links": {
    "self": "/api/v2/resources?page=1&limit=10",
    "first": "/api/v2/resources?page=1&limit=10",
    "prev": null,
    "next": "/api/v2/resources?page=2&limit=10",
    "last": "/api/v2/resources?page=10&limit=10"
  }
}
```

### 2. Структура ошибки

```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "errors": [
    {
      "id": "err_a1b2c3d4",
      "status": "400",
      "code": "VALIDATION_ERROR",
      "title": "Ошибка валидации данных",
      "detail": "Поле 'email' должно содержать валидный email адрес",
      "source": {
        "pointer": "/data/attributes/email",
        "parameter": "email",
        "header": null
      },
      "meta": {
        "field": "email",
        "value": "invalid-email",
        "constraint": "email",
        "expectedFormat": "user@example.com"
      }
    }
  ],
  "meta": {
    "requestId": "req_x1y2z3",
    "timestamp": "2025-12-25T10:30:00Z",
    "documentation": "https://docs.integram.example.com/errors/VALIDATION_ERROR"
  }
}
```

### 3. Коды ошибок

```typescript
enum ErrorCode {
  // Authentication (1xxx)
  INVALID_TOKEN = "AUTH_1001",
  TOKEN_EXPIRED = "AUTH_1002",
  TOKEN_REVOKED = "AUTH_1003",
  INSUFFICIENT_PERMISSIONS = "AUTH_1004",
  MFA_REQUIRED = "AUTH_1005",

  // Validation (2xxx)
  VALIDATION_ERROR = "VAL_2001",
  MISSING_REQUIRED_FIELD = "VAL_2002",
  INVALID_FORMAT = "VAL_2003",
  VALUE_OUT_OF_RANGE = "VAL_2004",

  // Resource (3xxx)
  RESOURCE_NOT_FOUND = "RES_3001",
  RESOURCE_ALREADY_EXISTS = "RES_3002",
  RESOURCE_CONFLICT = "RES_3003",

  // Rate Limit (4xxx)
  RATE_LIMIT_EXCEEDED = "RATE_4001",
  QUOTA_EXCEEDED = "RATE_4002",

  // Server (5xxx)
  INTERNAL_SERVER_ERROR = "SRV_5001",
  SERVICE_UNAVAILABLE = "SRV_5002",
  GATEWAY_TIMEOUT = "SRV_5003"
}
```

---

## 🤖 AI Chat API v2

### 1. Endpoint

```
POST /api/v2/chat
```

### 2. Request Schema

```json
{
  "data": {
    "type": "chat-request",
    "attributes": {
      "message": {
        "role": "user",
        "content": "Какая погода сегодня?",
        "contentType": "text"
      },
      "conversation": {
        "history": [
          {
            "role": "system",
            "content": "Ты — полезный ассистент",
            "contentType": "text"
          },
          {
            "role": "user",
            "content": "Привет!",
            "contentType": "text"
          },
          {
            "role": "assistant",
            "content": "Здравствуйте! Чем могу помочь?",
            "contentType": "text"
          }
        ],
        "conversationId": "conv_abc123",
        "userId": "user_xyz789"
      },
      "model": {
        "provider": "openai",
        "modelId": "gpt-4o",
        "fullName": "openai/gpt-4o"
      },
      "parameters": {
        "temperature": 0.7,
        "maxTokens": 4096,
        "topP": 1.0,
        "frequencyPenalty": 0.0,
        "presencePenalty": 0.0,
        "stream": false
      },
      "tools": {
        "enabled": true,
        "toolChoice": "auto",
        "allowedTools": [
          "integram_get_dictionary",
          "integram_get_object_list"
        ],
        "maxIterations": 10
      },
      "context": {
        "systemPrompt": "Ты работаешь с базой данных Integram",
        "applicationId": "app_chatbot_001",
        "sessionId": "ses_123456"
      }
    }
  },
  "meta": {
    "requestId": "req_a1b2c3d4",
    "clientVersion": "1.0.0",
    "debug": false
  }
}
```

### 3. Response Schema (Non-Streaming)

```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "data": {
    "type": "chat-response",
    "id": "resp_x1y2z3",
    "attributes": {
      "message": {
        "role": "assistant",
        "content": "Сегодня солнечная погода, +15°C",
        "contentType": "text"
      },
      "finishReason": "stop",
      "toolCalls": [],
      "usage": {
        "promptTokens": 150,
        "completionTokens": 25,
        "totalTokens": 175,
        "cost": {
          "amount": 0.00525,
          "currency": "USD"
        }
      },
      "model": {
        "provider": "openai",
        "modelId": "gpt-4o",
        "fullName": "openai/gpt-4o",
        "version": "gpt-4o-2024-11-20"
      },
      "performance": {
        "latency": 450,
        "tokensPerSecond": 55.5,
        "timeToFirstToken": 120
      }
    },
    "meta": {
      "requestId": "req_a1b2c3d4",
      "timestamp": "2025-12-25T10:30:00Z",
      "processingTime": 450,
      "cached": false
    }
  },
  "links": {
    "self": "/api/v2/chat",
    "conversation": "/api/v2/conversations/conv_abc123"
  }
}
```

### 4. Response Schema (With Tool Calls)

```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "data": {
    "type": "chat-response",
    "id": "resp_tool_call",
    "attributes": {
      "message": {
        "role": "assistant",
        "content": null,
        "contentType": "tool_calls"
      },
      "finishReason": "tool_calls",
      "toolCalls": [
        {
          "id": "call_abc123",
          "type": "function",
          "function": {
            "name": "integram_get_dictionary",
            "arguments": {
              "database": "db1"
            }
          },
          "status": "completed",
          "result": {
            "success": true,
            "data": [
              {
                "typeId": "type1",
                "typeName": "Клиенты"
              }
            ]
          },
          "performance": {
            "executionTime": 120
          }
        }
      ],
      "usage": {
        "promptTokens": 200,
        "completionTokens": 50,
        "totalTokens": 250,
        "cost": {
          "amount": 0.0075,
          "currency": "USD"
        }
      },
      "iterations": {
        "current": 1,
        "max": 10,
        "hasMore": true
      }
    },
    "meta": {
      "requestId": "req_tool_001",
      "timestamp": "2025-12-25T10:30:00Z",
      "processingTime": 650
    }
  }
}
```

### 5. Streaming Response (SSE)

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: metadata
data: {"requestId":"req_stream_001","model":"openai/gpt-4o","timestamp":"2025-12-25T10:30:00Z"}

event: content
data: {"type":"content_delta","delta":"Сегодня"}

event: content
data: {"type":"content_delta","delta":" солнечная"}

event: content
data: {"type":"content_delta","delta":" погода"}

event: usage
data: {"promptTokens":150,"completionTokens":25,"totalTokens":175}

event: done
data: {"finishReason":"stop","totalTime":450}
```

---

## 🗂️ Integram Resources API v2

### 1. Get Dictionary (List Types)

**Request:**
```
GET /api/v2/integram/databases/{database}/types
```

**Response:**
```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "data": [
    {
      "type": "integram-type",
      "id": "type_clients",
      "attributes": {
        "typeId": "type_clients",
        "typeName": "Клиенты",
        "typeAlias": "clients",
        "description": "Справочник клиентов компании",
        "icon": "users",
        "color": "#3B82F6",
        "objectCount": 150,
        "isSystem": false,
        "isDeleted": false,
        "permissions": {
          "canRead": true,
          "canCreate": true,
          "canUpdate": true,
          "canDelete": false
        }
      },
      "relationships": {
        "requisites": {
          "links": {
            "related": "/api/v2/integram/databases/db1/types/type_clients/requisites"
          }
        },
        "objects": {
          "links": {
            "related": "/api/v2/integram/databases/db1/types/type_clients/objects"
          }
        }
      },
      "links": {
        "self": "/api/v2/integram/databases/db1/types/type_clients"
      },
      "meta": {
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-12-20T15:30:00Z"
      }
    }
  ],
  "meta": {
    "total": 15,
    "database": "db1",
    "requestId": "req_dict_001"
  },
  "links": {
    "self": "/api/v2/integram/databases/db1/types"
  }
}
```

### 2. Get Type Metadata

**Request:**
```
GET /api/v2/integram/databases/{database}/types/{typeId}/metadata
```

**Response:**
```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "data": {
    "type": "integram-type-metadata",
    "id": "type_clients",
    "attributes": {
      "typeInfo": {
        "typeId": "type_clients",
        "typeName": "Клиенты",
        "typeAlias": "clients"
      },
      "requisites": [
        {
          "requisiteId": "req_name",
          "requisiteName": "Название",
          "requisiteAlias": "name",
          "dataType": "string",
          "isRequired": true,
          "isUnique": false,
          "isIndexed": true,
          "defaultValue": null,
          "constraints": {
            "minLength": 1,
            "maxLength": 255,
            "pattern": null
          },
          "uiSettings": {
            "order": 1,
            "visible": true,
            "editable": true,
            "width": "medium"
          }
        },
        {
          "requisiteId": "req_email",
          "requisiteName": "Email",
          "requisiteAlias": "email",
          "dataType": "email",
          "isRequired": true,
          "isUnique": true,
          "isIndexed": true,
          "defaultValue": null,
          "constraints": {
            "pattern": "^[^@]+@[^@]+\\.[^@]+$"
          },
          "uiSettings": {
            "order": 2,
            "visible": true,
            "editable": true,
            "width": "medium"
          }
        },
        {
          "requisiteId": "req_status",
          "requisiteName": "Статус",
          "requisiteAlias": "status",
          "dataType": "reference",
          "isRequired": true,
          "isUnique": false,
          "isIndexed": true,
          "defaultValue": "active",
          "constraints": {
            "referenceType": "type_statuses",
            "allowedValues": ["active", "inactive", "suspended"]
          },
          "uiSettings": {
            "order": 3,
            "visible": true,
            "editable": true,
            "width": "small"
          }
        }
      ],
      "subordinates": [
        {
          "typeId": "type_contacts",
          "typeName": "Контакты",
          "linkRequisiteId": "req_client_id"
        }
      ]
    },
    "meta": {
      "requisiteCount": 15,
      "subordinateCount": 3
    }
  },
  "links": {
    "self": "/api/v2/integram/databases/db1/types/type_clients/metadata",
    "objects": "/api/v2/integram/databases/db1/types/type_clients/objects"
  }
}
```

### 3. Get Object List

**Request:**
```
GET /api/v2/integram/databases/{database}/types/{typeId}/objects?page=1&limit=50&sort=-updatedAt&filter[status]=active
```

**Response:**
```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "data": [
    {
      "type": "integram-object",
      "id": "obj_client_001",
      "attributes": {
        "objectId": "obj_client_001",
        "typeId": "type_clients",
        "requisites": {
          "req_name": "ООО \"Ромашка\"",
          "req_email": "info@romashka.ru",
          "req_status": "active",
          "req_created_at": "2025-01-15T10:00:00Z",
          "req_updated_at": "2025-12-20T15:30:00Z"
        },
        "displayName": "ООО \"Ромашка\"",
        "isDeleted": false
      },
      "relationships": {
        "type": {
          "data": {
            "type": "integram-type",
            "id": "type_clients"
          }
        },
        "contacts": {
          "links": {
            "related": "/api/v2/integram/databases/db1/types/type_contacts/objects?filter[clientId]=obj_client_001"
          },
          "meta": {
            "count": 5
          }
        }
      },
      "links": {
        "self": "/api/v2/integram/databases/db1/objects/obj_client_001"
      },
      "meta": {
        "version": 3,
        "createdAt": "2025-01-15T10:00:00Z",
        "updatedAt": "2025-12-20T15:30:00Z",
        "createdBy": "user_admin",
        "updatedBy": "user_manager"
      }
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 150,
      "totalPages": 3
    },
    "sort": "-updatedAt",
    "filter": {
      "status": "active"
    }
  },
  "links": {
    "self": "/api/v2/integram/databases/db1/types/type_clients/objects?page=1&limit=50",
    "first": "/api/v2/integram/databases/db1/types/type_clients/objects?page=1&limit=50",
    "prev": null,
    "next": "/api/v2/integram/databases/db1/types/type_clients/objects?page=2&limit=50",
    "last": "/api/v2/integram/databases/db1/types/type_clients/objects?page=3&limit=50"
  }
}
```

### 4. Create Object

**Request:**
```
POST /api/v2/integram/databases/{database}/types/{typeId}/objects
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "integram-object",
    "attributes": {
      "requisites": {
        "req_name": "ООО \"Василёк\"",
        "req_email": "info@vasilek.ru",
        "req_status": "active"
      }
    }
  }
}
```

**Response:**
```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "data": {
    "type": "integram-object",
    "id": "obj_client_002",
    "attributes": {
      "objectId": "obj_client_002",
      "typeId": "type_clients",
      "requisites": {
        "req_name": "ООО \"Василёк\"",
        "req_email": "info@vasilek.ru",
        "req_status": "active",
        "req_created_at": "2025-12-25T10:30:00Z",
        "req_updated_at": "2025-12-25T10:30:00Z"
      },
      "displayName": "ООО \"Василёк\"",
      "isDeleted": false
    },
    "links": {
      "self": "/api/v2/integram/databases/db1/objects/obj_client_002"
    },
    "meta": {
      "version": 1,
      "createdAt": "2025-12-25T10:30:00Z",
      "updatedAt": "2025-12-25T10:30:00Z",
      "createdBy": "user_current"
    }
  },
  "meta": {
    "requestId": "req_create_001",
    "timestamp": "2025-12-25T10:30:00Z"
  }
}
```

---

## 🔍 Filtering, Sorting, Pagination

### Query Parameters

```
GET /api/v2/integram/databases/{db}/types/{typeId}/objects?
  page=2
  &limit=25
  &sort=-updatedAt,name
  &filter[status]=active
  &filter[createdAt][gte]=2025-01-01T00:00:00Z
  &filter[name][contains]=ООО
  &include=type,subordinates
  &fields[integram-object]=objectId,requisites.req_name,requisites.req_email
```

### Filter Operators

```typescript
enum FilterOperator {
  // Comparison
  EQ = "eq",              // equal
  NE = "ne",              // not equal
  GT = "gt",              // greater than
  GTE = "gte",            // greater than or equal
  LT = "lt",              // less than
  LTE = "lte",            // less than or equal

  // String
  CONTAINS = "contains",  // contains substring
  STARTS_WITH = "startsWith",
  ENDS_WITH = "endsWith",
  REGEX = "regex",        // regex match

  // Arrays
  IN = "in",              // value in array
  NOT_IN = "notIn",       // value not in array

  // Null checks
  IS_NULL = "isNull",
  IS_NOT_NULL = "isNotNull"
}
```

### Sort Format

```
?sort=field1,-field2,field3
```
- `field1` - ascending order
- `-field2` - descending order (minus prefix)

---

## 🔗 HATEOAS Links

Все ресурсы содержат `links` секцию для навигации:

```json
{
  "links": {
    "self": "/api/v2/resources/123",
    "related": "/api/v2/resources/123/related",
    "first": "/api/v2/resources?page=1",
    "prev": "/api/v2/resources?page=1",
    "next": "/api/v2/resources?page=3",
    "last": "/api/v2/resources?page=10",
    "parent": "/api/v2/resources",
    "children": "/api/v2/resources/123/children",
    "actions": {
      "edit": {
        "href": "/api/v2/resources/123",
        "method": "PATCH"
      },
      "delete": {
        "href": "/api/v2/resources/123",
        "method": "DELETE"
      }
    }
  }
}
```

---

## 📊 Metadata & Introspection

### API Discovery Endpoint

```
GET /api/v2
```

**Response:**
```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "data": {
    "type": "api-info",
    "id": "integram-api-v2",
    "attributes": {
      "version": "2.0.0",
      "name": "Integram Standalone API",
      "description": "Modern AI-friendly JSON API for Integram",
      "status": "stable",
      "features": [
        "json-api-1.1",
        "openapi-3.1",
        "hateoas",
        "streaming",
        "webhooks",
        "graphql"
      ],
      "authentication": {
        "methods": ["jwt", "api-key", "oauth2"],
        "defaultMethod": "jwt"
      },
      "rateLimits": {
        "default": {
          "requestsPerMinute": 60,
          "requestsPerHour": 3600
        },
        "authenticated": {
          "requestsPerMinute": 300,
          "requestsPerHour": 18000
        }
      }
    },
    "meta": {
      "buildVersion": "2.0.0-20251225.1",
      "buildDate": "2025-12-25T00:00:00Z",
      "environment": "production"
    }
  },
  "links": {
    "self": "/api/v2",
    "documentation": "https://docs.integram.example.com",
    "openapi": "/api/v2/openapi.json",
    "graphql": "/api/v2/graphql",
    "health": "/api/v2/health",
    "endpoints": {
      "auth": "/api/v2/auth",
      "chat": "/api/v2/chat",
      "integram": "/api/v2/integram",
      "users": "/api/v2/users",
      "organizations": "/api/v2/organizations"
    }
  }
}
```

---

## 🎯 Примеры использования для AI моделей

### Пример 1: Аутентификация и получение токена

**Запрос:**
```http
POST /api/v2/auth/login HTTP/1.1
Host: api.integram.example.com
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "auth-login",
    "attributes": {
      "identifier": "user@example.com",
      "password": "secure_password_123",
      "mfa": {
        "code": "123456"
      }
    }
  }
}
```

**Ответ:**
```json
{
  "jsonapi": {"version": "1.1"},
  "data": {
    "type": "auth-session",
    "id": "ses_abc123",
    "attributes": {
      "tokens": {
        "access": {
          "token": "eyJhbGciOiJSUzI1NiIs...",
          "type": "Bearer",
          "expiresIn": 900,
          "expiresAt": "2025-12-25T10:45:00Z"
        },
        "refresh": {
          "token": "eyJhbGciOiJSUzI1NiIs...",
          "type": "Bearer",
          "expiresIn": 604800,
          "expiresAt": "2026-01-01T10:30:00Z"
        }
      },
      "user": {
        "userId": "user_123",
        "username": "user@example.com",
        "displayName": "Иван Иванов",
        "roles": ["user", "developer"]
      }
    },
    "links": {
      "self": "/api/v2/auth/me",
      "refresh": "/api/v2/auth/refresh",
      "logout": "/api/v2/auth/logout"
    }
  }
}
```

### Пример 2: AI чат с инструментами

**Запрос:**
```http
POST /api/v2/chat HTTP/1.1
Host: api.integram.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "chat-request",
    "attributes": {
      "message": {
        "role": "user",
        "content": "Покажи всех клиентов со статусом 'активный'"
      },
      "model": {
        "provider": "anthropic",
        "modelId": "claude-3.5-sonnet"
      },
      "tools": {
        "enabled": true,
        "allowedTools": ["integram_get_object_list"]
      }
    }
  }
}
```

**Ответ (с вызовом инструмента):**
```json
{
  "jsonapi": {"version": "1.1"},
  "data": {
    "type": "chat-response",
    "id": "resp_xyz789",
    "attributes": {
      "message": {
        "role": "assistant",
        "content": "Вот список активных клиентов:\n\n1. ООО \"Ромашка\" - info@romashka.ru\n2. ООО \"Василёк\" - info@vasilek.ru\n\nВсего найдено: 2 клиента"
      },
      "toolCalls": [
        {
          "id": "call_001",
          "function": {
            "name": "integram_get_object_list",
            "arguments": {
              "database": "db1",
              "typeId": "type_clients",
              "filter": {
                "status": "active"
              }
            }
          },
          "result": {
            "data": [
              {
                "objectId": "obj_001",
                "requisites": {
                  "req_name": "ООО \"Ромашка\"",
                  "req_email": "info@romashka.ru",
                  "req_status": "active"
                }
              },
              {
                "objectId": "obj_002",
                "requisites": {
                  "req_name": "ООО \"Василёк\"",
                  "req_email": "info@vasilek.ru",
                  "req_status": "active"
                }
              }
            ]
          }
        }
      ],
      "usage": {
        "totalTokens": 450,
        "cost": {"amount": 0.015, "currency": "USD"}
      }
    }
  }
}
```

### Пример 3: Работа с Integram объектами

**Создание нового клиента:**
```http
POST /api/v2/integram/databases/db1/types/type_clients/objects HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "integram-object",
    "attributes": {
      "requisites": {
        "req_name": "ИП Петров",
        "req_email": "petrov@example.com",
        "req_phone": "+7 (999) 123-45-67",
        "req_status": "active"
      }
    }
  }
}
```

**Обновление клиента:**
```http
PATCH /api/v2/integram/databases/db1/objects/obj_client_003 HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "integram-object",
    "id": "obj_client_003",
    "attributes": {
      "requisites": {
        "req_status": "inactive"
      }
    }
  }
}
```

---

## 📖 OpenAPI Specification

Полная спецификация доступна в файле `/api/v2/openapi.json` и соответствует стандарту **OpenAPI 3.1**.

Основные компоненты:
- **Schemas** - все типы данных
- **Parameters** - query/path/header параметры
- **Responses** - стандартные ответы
- **SecuritySchemes** - схемы аутентификации
- **Examples** - примеры запросов/ответов

---

## 🔄 Миграция с v1 на v2

### Основные изменения

| Аспект | API v1 | API v2 |
|--------|--------|--------|
| Базовый путь | `/api/*` | `/api/v2/*` |
| Формат ответа | Custom | JSON:API 1.1 |
| Токены | Cookie or Header | Стандартизированы |
| Ошибки | `{success, error}` | JSON:API errors |
| Пагинация | `{total, offset, limit}` | JSON:API links |
| Filtering | Custom | Стандартный query syntax |

### Период совместимости

- **v1 API** - поддерживается до 2026-12-31
- **v2 API** - рекомендуется для новых интеграций
- **Переходный период** - оба API работают параллельно

---

## ✅ Преимущества для AI моделей

1. **Однозначная структура** - каждый endpoint возвращает данные в предсказуемом формате
2. **Самодокументируемость** - `links` указывают доступные действия
3. **Строгая типизация** - все поля имеют явные типы в OpenAPI схеме
4. **Метаданные** - дополнительная контекстная информация в `meta`
5. **Стандартизация** - использование JSON:API обеспечивает совместимость с инструментами
6. **HATEOAS** - AI может автоматически обнаруживать доступные операции
7. **Introspection** - `/api/v2` endpoint предоставляет полную карту API

---

## 📚 Дополнительные ресурсы

- **OpenAPI спецификация**: `/api/v2/openapi.json`
- **GraphQL schema**: `/api/v2/graphql/schema`
- **Postman коллекция**: `/api/v2/postman.json`
- **API документация**: `https://docs.integram.example.com`
- **Примеры кода**: `/docs/api/examples/`

---

## 🤝 Обратная связь

Если у вас есть предложения по улучшению формата API, создайте Issue в репозитории проекта.

**Статус документа**: Предложение (Proposal)
**Версия**: 1.0.0
**Дата**: 2025-12-25
