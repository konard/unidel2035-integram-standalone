# Примеры использования API v2

Данный документ содержит практические примеры использования современного формата JSON API Integram v2 для моделей искусственного интеллекта.

## 📋 Содержание

1. [Базовая настройка](#базовая-настройка)
2. [Аутентификация](#аутентификация)
3. [AI Chat примеры](#ai-chat-примеры)
4. [Работа с Integram данными](#работа-с-integram-данными)
5. [Управление AI токенами](#управление-ai-токенами)
6. [Обработка ошибок](#обработка-ошибок)

---

## Базовая настройка

### cURL конфигурация

```bash
# Установить переменные окружения
export API_BASE_URL="http://localhost:8081/api/v2"
export CONTENT_TYPE="application/vnd.api+json"
export ACCESS_TOKEN="your-jwt-token-here"
```

### Python клиент

```python
import requests

class IntegramAPIClient:
    def __init__(self, base_url="http://localhost:8081/api/v2"):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/vnd.api+json'
        })

    def set_token(self, token):
        self.session.headers['Authorization'] = f'Bearer {token}'

    def request(self, method, endpoint, **kwargs):
        url = f"{self.base_url}{endpoint}"
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()

# Использование
client = IntegramAPIClient()
```

### JavaScript/Node.js клиент

```javascript
class IntegramAPIClient {
  constructor(baseURL = 'http://localhost:8081/api/v2') {
    this.baseURL = baseURL;
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  async request(method, endpoint, body = null) {
    const headers = {
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json'
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const options = {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    };

    const response = await fetch(`${this.baseURL}${endpoint}`, options);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(JSON.stringify(error.errors));
    }

    return response.json();
  }
}

// Использование
const client = new IntegramAPIClient();
```

---

## Аутентификация

### 1. Вход в систему (Login)

#### cURL

```bash
curl -X POST "${API_BASE_URL}/auth/login" \
  -H "Content-Type: ${CONTENT_TYPE}" \
  -d '{
    "data": {
      "type": "auth-login",
      "attributes": {
        "identifier": "user@example.com",
        "password": "SecurePassword123!"
      }
    }
  }'
```

#### Python

```python
response = client.request('POST', '/auth/login', json={
    "data": {
        "type": "auth-login",
        "attributes": {
            "identifier": "user@example.com",
            "password": "SecurePassword123!"
        }
    }
})

# Сохранить токен
access_token = response['data']['attributes']['tokens']['access']['token']
client.set_token(access_token)
print(f"Logged in as: {response['data']['attributes']['user']['displayName']}")
```

#### JavaScript

```javascript
const response = await client.request('POST', '/auth/login', {
  data: {
    type: 'auth-login',
    attributes: {
      identifier: 'user@example.com',
      password: 'SecurePassword123!'
    }
  }
});

// Сохранить токен
const accessToken = response.data.attributes.tokens.access.token;
client.setToken(accessToken);
console.log(`Logged in as: ${response.data.attributes.user.displayName}`);
```

### 2. Получить информацию о текущем пользователе

#### cURL

```bash
curl -X GET "${API_BASE_URL}/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Accept: ${CONTENT_TYPE}"
```

#### Python

```python
user_info = client.request('GET', '/auth/me')
print(f"User: {user_info['data']['attributes']['displayName']}")
print(f"Email: {user_info['data']['attributes']['email']}")
print(f"Roles: {', '.join(user_info['data']['attributes']['roles'])}")
```

### 3. Обновить токен (Refresh)

#### Python

```python
refresh_token = "your-refresh-token-here"

response = client.request('POST', '/auth/refresh', json={
    "data": {
        "type": "auth-refresh",
        "attributes": {
            "refreshToken": refresh_token
        }
    }
})

# Обновить access token
new_access_token = response['data']['attributes']['tokens']['access']['token']
client.set_token(new_access_token)
```

---

## AI Chat примеры

### 1. Простой чат запрос

#### Python

```python
response = client.request('POST', '/chat', json={
    "data": {
        "type": "chat-request",
        "attributes": {
            "message": {
                "role": "user",
                "content": "Привет! Как дела?"
            },
            "model": {
                "provider": "openai",
                "modelId": "gpt-4o"
            },
            "parameters": {
                "temperature": 0.7,
                "maxTokens": 1000
            }
        }
    }
})

print(f"AI: {response['data']['attributes']['message']['content']}")
print(f"Tokens used: {response['data']['attributes']['usage']['totalTokens']}")
print(f"Cost: ${response['data']['attributes']['usage']['cost']['amount']:.4f}")
```

### 2. Чат с историей разговора

#### Python

```python
conversation_history = [
    {
        "role": "system",
        "content": "Ты — полезный ассистент для работы с Integram"
    },
    {
        "role": "user",
        "content": "Привет!"
    },
    {
        "role": "assistant",
        "content": "Здравствуйте! Чем могу помочь?"
    }
]

response = client.request('POST', '/chat', json={
    "data": {
        "type": "chat-request",
        "attributes": {
            "message": {
                "role": "user",
                "content": "Покажи список всех таблиц в базе данных db1"
            },
            "conversation": {
                "history": conversation_history,
                "conversationId": "conv_12345"
            },
            "model": {
                "provider": "anthropic",
                "modelId": "claude-3.5-sonnet"
            },
            "tools": {
                "enabled": True,
                "allowedTools": ["integram_get_dictionary"],
                "maxIterations": 5
            }
        }
    }
})

# Обработать ответ
if response['data']['attributes']['finishReason'] == 'tool_calls':
    print("AI использовал инструменты:")
    for tool_call in response['data']['attributes']['toolCalls']:
        print(f"  - {tool_call['function']['name']}")
        print(f"    Результат: {tool_call['result']}")
else:
    print(f"AI: {response['data']['attributes']['message']['content']}")
```

### 3. Streaming чат

#### Python (с SSE)

```python
import sseclient
import requests

def chat_stream(message, model="openai/gpt-4o"):
    headers = {
        'Authorization': f'Bearer {ACCESS_TOKEN}',
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'text/event-stream'
    }

    payload = {
        "data": {
            "type": "chat-request",
            "attributes": {
                "message": {
                    "role": "user",
                    "content": message
                },
                "model": {
                    "provider": model.split('/')[0],
                    "modelId": model.split('/')[1]
                },
                "parameters": {
                    "stream": True
                }
            }
        }
    }

    response = requests.post(
        f"{API_BASE_URL}/chat",
        headers=headers,
        json=payload,
        stream=True
    )

    client = sseclient.SSEClient(response)

    for event in client.events():
        if event.event == 'metadata':
            print(f"Metadata: {event.data}")
        elif event.event == 'content':
            data = json.loads(event.data)
            print(data['delta'], end='', flush=True)
        elif event.event == 'usage':
            print(f"\n\nUsage: {event.data}")
        elif event.event == 'done':
            print(f"\nDone: {event.data}")
            break

# Использование
chat_stream("Расскажи интересный факт о космосе")
```

---

## Работа с Integram данными

### 1. Получить список таблиц (Dictionary)

#### Python

```python
response = client.request('GET', '/integram/databases/db1/types')

print(f"Таблицы в базе db1:")
for table in response['data']:
    attrs = table['attributes']
    print(f"  - {attrs['typeName']} ({attrs['typeAlias']})")
    print(f"    ID: {attrs['typeId']}, Объектов: {attrs.get('objectCount', 0)}")
```

### 2. Получить структуру таблицы (Metadata)

#### Python

```python
response = client.request('GET', '/integram/databases/db1/types/type_clients/metadata')

print(f"Структура таблицы 'Клиенты':")
for requisite in response['data']['attributes']['requisites']:
    print(f"  - {requisite['requisiteName']} ({requisite['requisiteAlias']})")
    print(f"    Тип: {requisite['dataType']}, Обязательное: {requisite['isRequired']}")
```

### 3. Получить список объектов с фильтрацией

#### Python

```python
# Получить активных клиентов, отсортированных по дате обновления
response = client.request('GET', '/integram/databases/db1/types/type_clients/objects', params={
    'page': 1,
    'limit': 50,
    'sort': '-updatedAt',
    'filter[status]': 'active',
    'filter[createdAt][gte]': '2025-01-01T00:00:00Z'
})

print(f"Найдено клиентов: {response['meta']['pagination']['total']}")

for obj in response['data']:
    requisites = obj['attributes']['requisites']
    print(f"  - {requisites.get('req_name', 'Без названия')}")
    print(f"    Email: {requisites.get('req_email', 'Нет')}")
    print(f"    Статус: {requisites.get('req_status', 'Неизвестен')}")

# Навигация по страницам
if 'next' in response['links']:
    print(f"Следующая страница: {response['links']['next']}")
```

### 4. Создать новый объект

#### Python

```python
response = client.request('POST', '/integram/databases/db1/types/type_clients/objects', json={
    "data": {
        "type": "integram-object",
        "attributes": {
            "requisites": {
                "req_name": "ООО \"Новая компания\"",
                "req_email": "info@newcompany.ru",
                "req_phone": "+7 (999) 123-45-67",
                "req_status": "active"
            }
        }
    }
})

new_object_id = response['data']['id']
print(f"Создан новый клиент с ID: {new_object_id}")
print(f"URL: {response['data']['links']['self']}")
```

### 5. Обновить объект

#### Python

```python
object_id = "obj_client_002"

response = client.request('PATCH', f'/integram/databases/db1/objects/{object_id}', json={
    "data": {
        "type": "integram-object",
        "id": object_id,
        "attributes": {
            "requisites": {
                "req_status": "inactive",
                "req_notes": "Клиент неактивен с 2025-12-25"
            }
        }
    }
})

print(f"Объект {object_id} обновлен")
print(f"Новый статус: {response['data']['attributes']['requisites']['req_status']}")
```

### 6. Удалить объект

#### Python

```python
object_id = "obj_client_003"

try:
    client.request('DELETE', f'/integram/databases/db1/objects/{object_id}')
    print(f"Объект {object_id} успешно удален")
except Exception as e:
    print(f"Ошибка при удалении: {e}")
```

---

## Управление AI токенами

### 1. Получить список AI токенов

#### Python

```python
response = client.request('GET', '/ai-access-tokens')

print("AI Access Tokens:")
for token in response['data']:
    attrs = token['attributes']
    print(f"  - {attrs['name']}")
    print(f"    Prefix: {attrs['tokenPrefix']}")
    print(f"    Scopes: {', '.join(attrs['scopes'])}")
    print(f"    Active: {attrs['isActive']}")
```

### 2. Создать новый AI токен

#### Python

```python
response = client.request('POST', '/ai-access-tokens', json={
    "data": {
        "type": "ai-access-token",
        "attributes": {
            "name": "ChatBot Production Token",
            "scopes": [
                "chat:read",
                "chat:write",
                "integram:read",
                "integram:write"
            ],
            "allowedModels": [
                "openai/gpt-4o",
                "anthropic/claude-3.5-sonnet"
            ],
            "rateLimits": {
                "requestsPerMinute": 100,
                "tokensPerMinute": 200000
            }
        }
    }
})

# ВАЖНО: Сохранить токен - он показывается только один раз!
full_token = response['data']['attributes']['token']
print(f"Новый токен создан: {response['data']['id']}")
print(f"Токен (сохраните его): {full_token}")
print(f"Prefix: {response['data']['attributes']['tokenPrefix']}")
```

---

## Обработка ошибок

### Python

```python
def safe_api_call(method, endpoint, **kwargs):
    try:
        return client.request(method, endpoint, **kwargs)
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            error_data = e.response.json()
            print(f"Ошибка аутентификации:")
            for error in error_data.get('errors', []):
                print(f"  Code: {error.get('code')}")
                print(f"  Detail: {error.get('detail')}")
        elif e.response.status_code == 422:
            error_data = e.response.json()
            print(f"Ошибка валидации:")
            for error in error_data.get('errors', []):
                print(f"  Field: {error.get('source', {}).get('pointer')}")
                print(f"  Detail: {error.get('detail')}")
        elif e.response.status_code == 429:
            error_data = e.response.json()
            print(f"Rate limit превышен:")
            print(f"  Retry after: {e.response.headers.get('X-RateLimit-Reset')}")
        else:
            print(f"HTTP Error {e.response.status_code}: {e.response.text}")
        raise
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise

# Использование
response = safe_api_call('GET', '/integram/databases/db1/types')
```

---

## Полный пример: AI ассистент для Integram

### Python полный workflow

```python
#!/usr/bin/env python3
"""
Integram AI Assistant - полный пример использования API v2
"""

import requests
import json
from typing import List, Dict, Any

class IntegramAIAssistant:
    def __init__(self, base_url: str, email: str, password: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/vnd.api+json'
        })

        # Аутентификация
        self.login(email, password)

    def login(self, email: str, password: str):
        """Вход в систему"""
        response = self.request('POST', '/auth/login', json={
            "data": {
                "type": "auth-login",
                "attributes": {
                    "identifier": email,
                    "password": password
                }
            }
        })

        token = response['data']['attributes']['tokens']['access']['token']
        self.session.headers['Authorization'] = f'Bearer {token}'
        print(f"✓ Вход выполнен как {response['data']['attributes']['user']['displayName']}")

    def request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Выполнить API запрос"""
        url = f"{self.base_url}{endpoint}"
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()

    def chat(self, message: str, database: str = "db1", use_tools: bool = True) -> str:
        """Отправить сообщение AI с доступом к Integram"""
        response = self.request('POST', '/chat', json={
            "data": {
                "type": "chat-request",
                "attributes": {
                    "message": {
                        "role": "user",
                        "content": message
                    },
                    "model": {
                        "provider": "anthropic",
                        "modelId": "claude-3.5-sonnet"
                    },
                    "tools": {
                        "enabled": use_tools,
                        "allowedTools": [
                            "integram_get_dictionary",
                            "integram_get_object_list",
                            "integram_create_object",
                            "integram_save_object"
                        ]
                    },
                    "context": {
                        "systemPrompt": f"Ты работаешь с базой данных Integram '{database}'"
                    }
                }
            }
        })

        # Показать использованные инструменты
        if response['data']['attributes'].get('toolCalls'):
            print("🔧 Использованные инструменты:")
            for tool in response['data']['attributes']['toolCalls']:
                print(f"  - {tool['function']['name']}")

        return response['data']['attributes']['message']['content']

    def get_tables(self, database: str = "db1") -> List[Dict]:
        """Получить список таблиц"""
        response = self.request('GET', f'/integram/databases/{database}/types')
        return response['data']

    def create_client(self, database: str, name: str, email: str, **kwargs) -> Dict:
        """Создать нового клиента"""
        requisites = {
            "req_name": name,
            "req_email": email,
            **{f"req_{k}": v for k, v in kwargs.items()}
        }

        response = self.request('POST',
            f'/integram/databases/{database}/types/type_clients/objects',
            json={
                "data": {
                    "type": "integram-object",
                    "attributes": {
                        "requisites": requisites
                    }
                }
            }
        )

        return response['data']

# Использование
if __name__ == "__main__":
    # Инициализация
    assistant = IntegramAIAssistant(
        base_url="http://localhost:8081/api/v2",
        email="user@example.com",
        password="SecurePassword123!"
    )

    # Получить список таблиц
    print("\n📋 Таблицы в базе данных:")
    tables = assistant.get_tables()
    for table in tables[:5]:
        print(f"  - {table['attributes']['typeName']}")

    # Создать клиента
    print("\n➕ Создание нового клиента...")
    client = assistant.create_client(
        database="db1",
        name="ООО \"Тестовая компания\"",
        email="test@company.ru",
        status="active"
    )
    print(f"✓ Создан клиент: {client['id']}")

    # AI чат
    print("\n💬 AI Chat:")
    response = assistant.chat("Сколько всего клиентов в базе с активным статусом?")
    print(f"AI: {response}")

    response = assistant.chat("Создай нового клиента 'ООО Ромашка' с email info@romashka.ru")
    print(f"AI: {response}")
```

---

## JavaScript полный пример

```javascript
#!/usr/bin/env node
/**
 * Integram AI Assistant - Node.js пример
 */

class IntegramAIAssistant {
  constructor(baseURL) {
    this.baseURL = baseURL;
    this.token = null;
  }

  async request(method, endpoint, body = null) {
    const headers = {
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json'
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(JSON.stringify(error.errors, null, 2));
    }

    return response.json();
  }

  async login(email, password) {
    const response = await this.request('POST', '/auth/login', {
      data: {
        type: 'auth-login',
        attributes: { identifier: email, password }
      }
    });

    this.token = response.data.attributes.tokens.access.token;
    console.log(`✓ Вход выполнен как ${response.data.attributes.user.displayName}`);
  }

  async chat(message, options = {}) {
    const response = await this.request('POST', '/chat', {
      data: {
        type: 'chat-request',
        attributes: {
          message: { role: 'user', content: message },
          model: { provider: 'openai', modelId: 'gpt-4o' },
          tools: { enabled: true },
          ...options
        }
      }
    });

    return response.data.attributes.message.content;
  }

  async getTables(database = 'db1') {
    const response = await this.request('GET', `/integram/databases/${database}/types`);
    return response.data;
  }
}

// Использование
(async () => {
  const assistant = new IntegramAIAssistant('http://localhost:8081/api/v2');

  await assistant.login('user@example.com', 'SecurePassword123!');

  const tables = await assistant.getTables();
  console.log('\n📋 Таблицы:', tables.map(t => t.attributes.typeName).join(', '));

  const response = await assistant.chat('Покажи всех клиентов');
  console.log('\n💬 AI:', response);
})();
```

---

## Заключение

Эти примеры демонстрируют основные паттерны работы с Integram API v2:

1. **Строгая типизация** - все запросы следуют JSON:API формату
2. **Явная структура** - понятно для AI моделей
3. **HATEOAS** - навигация через links
4. **Обработка ошибок** - стандартизированный формат ошибок
5. **Расширяемость** - легко добавлять новые endpoints

Для получения полной спецификации см. `openapi-v2.yaml` и `MODERN_API_FORMAT.md`.
