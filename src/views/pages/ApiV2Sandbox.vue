<template>
  <div class="api-sandbox">
    <div class="sandbox-header">
      <h1>🚀 API v2 Песочница</h1>
      <p>Интерактивное тестирование Integram Standalone API v2</p>
    </div>

    <div class="sandbox-content">
      <!-- Left Panel: Auth & Endpoints -->
      <div class="left-panel">
        <!-- Authentication Section -->
        <div class="auth-section">
          <h3>🔐 Авторизация</h3>

          <div :class="['auth-status', authState.isAuthenticated ? 'connected' : 'disconnected']">
            {{ authState.isAuthenticated
              ? `✅ Авторизован: ${authState.login}@${authState.database}`
              : '❌ Не авторизован'
            }}
          </div>

          <div class="auth-input-group">
            <label>Server URL</label>
            <input
              v-model="authForm.serverUrl"
              type="text"
              placeholder="https://dronedoc.ru или https://185.128.105.78"
            />
            <div class="quick-db-buttons">
              <button @click="authForm.serverUrl = 'https://dronedoc.ru'">dronedoc.ru</button>
              <button @click="authForm.serverUrl = 'https://185.128.105.78'">185.128.105.78</button>
            </div>
          </div>

          <div class="auth-input-group">
            <label>База данных</label>
            <input
              v-model="authForm.database"
              type="text"
              placeholder="my, a2025, ru, fm..."
            />
            <div class="quick-db-buttons">
              <button @click="authForm.database = 'my'">my</button>
              <button @click="authForm.database = 'a2025'">a2025</button>
              <button @click="authForm.database = 'ru'">ru</button>
              <button @click="authForm.database = 'fm'">fm</button>
            </div>
          </div>

          <div class="auth-input-group">
            <label>Логин</label>
            <input
              v-model="authForm.login"
              type="text"
              placeholder="Ваш логин"
            />
          </div>

          <div class="auth-input-group">
            <label>Пароль</label>
            <input
              v-model="authForm.password"
              type="password"
              placeholder="Ваш пароль"
            />
          </div>

          <button
            class="btn-auth"
            @click="authenticate"
            :disabled="authState.isAuthenticating"
          >
            {{ authState.isAuthenticating ? '⏳ Авторизация...' : '🔓 Войти' }}
          </button>

          <div v-if="authState.session" class="token-display-wrapper">
            <div class="token-label">Токен:</div>
            <div class="token-display">{{ authState.session }}</div>
          </div>
        </div>

        <!-- Endpoints -->
        <div class="endpoint-group">
          <h3>📋 Discovery & Info</h3>
          <div
            v-for="endpoint in endpoints.discovery"
            :key="endpoint.path"
            :class="['endpoint', { active: selectedEndpoint === endpoint }]"
            @click="selectEndpoint(endpoint)"
          >
            <span :class="['method', endpoint.method.toLowerCase()]">{{ endpoint.method }}</span>
            <span class="path">{{ endpoint.name }}</span>
          </div>
        </div>

        <div class="endpoint-group">
          <h3>📊 Integram Types</h3>
          <div
            v-for="endpoint in endpoints.types"
            :key="endpoint.path"
            :class="['endpoint', { active: selectedEndpoint === endpoint }]"
            @click="selectEndpoint(endpoint)"
          >
            <span :class="['method', endpoint.method.toLowerCase()]">{{ endpoint.method }}</span>
            <span class="path">{{ endpoint.name }}</span>
          </div>
        </div>

        <div class="endpoint-group">
          <h3>📦 Integram Objects</h3>
          <div
            v-for="endpoint in endpoints.objects"
            :key="endpoint.path"
            :class="['endpoint', { active: selectedEndpoint === endpoint }]"
            @click="selectEndpoint(endpoint)"
          >
            <span :class="['method', endpoint.method.toLowerCase()]">{{ endpoint.method }}</span>
            <span class="path">{{ endpoint.name }}</span>
          </div>
        </div>
      </div>

      <!-- Right Panel: Request & Response -->
      <div class="right-panel">
        <div class="request-section">
          <h4>🔧 Параметры запроса</h4>

          <div class="input-group">
            <label>Метод</label>
            <input v-model="request.method" type="text" readonly />
          </div>

          <div class="input-group">
            <label>URL</label>
            <input v-model="request.url" type="text" />
          </div>

          <div v-if="needsBody" class="input-group">
            <label>Request Body (JSON)</label>
            <textarea
              v-model="request.body"
              placeholder='{"data": {"type": "...", "attributes": {...}}}'
              rows="8"
            ></textarea>
          </div>

          <button
            class="btn-primary"
            @click="sendRequest"
            :disabled="isLoading"
          >
            {{ isLoading ? '⏳ Отправка...' : '▶️ Отправить запрос' }}
          </button>
        </div>

        <div v-if="response.data" class="response-container">
          <div class="response-header">
            <div>
              <h4>📥 Ответ</h4>
              <span :class="['response-status', response.ok ? 'success' : 'error']">
                {{ response.status }} {{ response.statusText }}
              </span>
            </div>
            <span class="response-time">⏱️ {{ response.duration }}ms</span>
          </div>
          <pre>{{ formatJSON(response.data) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ApiV2Sandbox',

  data() {
    return {
      authForm: {
        serverUrl: 'https://185.128.105.78',
        database: 'my',
        login: 'admin',
        password: 'DronedocIntegram2025'
      },

      authState: {
        isAuthenticated: false,
        isAuthenticating: false,
        session: null,
        token: null,
        database: null,
        login: null
      },

      endpoints: {
        discovery: [
          { method: 'GET', path: '/api/v2', name: '/api/v2', description: 'API Discovery' },
          { method: 'GET', path: '/api/v2/health', name: '/api/v2/health', description: 'Health Check' }
        ],
        types: [
          { method: 'GET', path: '/api/v2/integram/databases/{database}/types', name: '.../types', description: 'List Tables' },
          { method: 'GET', path: '/api/v2/integram/databases/{database}/types/{typeId}/metadata', name: '.../types/{typeId}/metadata', description: 'Get Metadata' }
        ],
        objects: [
          { method: 'GET', path: '/api/v2/integram/databases/{database}/types/{typeId}/objects', name: '.../types/{typeId}/objects', description: 'List Objects' },
          { method: 'POST', path: '/api/v2/integram/databases/{database}/types/{typeId}/objects', name: '.../types/{typeId}/objects', description: 'Create Object' },
          { method: 'GET', path: '/api/v2/integram/databases/{database}/objects/{objectId}', name: '.../objects/{objectId}', description: 'Get Object' },
          { method: 'PATCH', path: '/api/v2/integram/databases/{database}/objects/{objectId}', name: '.../objects/{objectId}', description: 'Update Object' },
          { method: 'DELETE', path: '/api/v2/integram/databases/{database}/objects/{objectId}', name: '.../objects/{objectId}', description: 'Delete Object' }
        ]
      },

      selectedEndpoint: null,

      request: {
        method: 'GET',
        url: 'https://185.128.105.78/api/v2',
        body: ''
      },

      response: {
        data: null,
        status: null,
        statusText: null,
        ok: false,
        duration: 0
      },

      isLoading: false,

      bodyExamples: {
        'POST /api/v2/integram/databases/{database}/types/{typeId}/objects': {
          data: {
            type: 'integram-object',
            attributes: {
              requisites: {
                req_name: 'ООО Тестовая Компания',
                req_email: 'test@example.com'
              }
            }
          }
        },
        'PATCH /api/v2/integram/databases/{database}/objects/{objectId}': {
          data: {
            type: 'integram-object',
            id: '{objectId}',
            attributes: {
              requisites: {
                req_name: 'ООО Обновленная Компания'
              }
            }
          }
        }
      }
    };
  },

  computed: {
    needsBody() {
      return ['POST', 'PATCH', 'PUT'].includes(this.request.method);
    }
  },

  methods: {
    async authenticate() {
      let { serverUrl, database, login, password } = this.authForm;

      if (!serverUrl || !database || !login || !password) {
        this.$toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Заполните все поля', life: 3000 });
        return;
      }

      // Автоматически добавляем https:// если протокол отсутствует
      if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
        serverUrl = 'https://' + serverUrl;
        this.authForm.serverUrl = serverUrl; // Обновляем поле
      }

      this.authState.isAuthenticating = true;

      try {
        const response = await fetch(`${serverUrl}/api/v2/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/vnd.api+json' },
          body: JSON.stringify({
            data: {
              type: 'auth',
              attributes: { login, password, database }
            }
          })
        });

        const data = await response.json();

        if (response.ok && data.data) {
          this.authState.isAuthenticated = true;
          this.authState.session = data.data.attributes.session;
          this.authState.token = data.data.attributes.token;
          this.authState.database = database;
          this.authState.login = login;

          this.request.url = `${serverUrl}/api/v2`;

          this.$toast.add({
            severity: 'success',
            summary: 'Успешно',
            detail: `Авторизован как ${login}@${database}`,
            life: 3000
          });
        } else {
          throw new Error(data.errors?.[0]?.detail || 'Authentication failed');
        }
      } catch (error) {
        this.$toast.add({
          severity: 'error',
          summary: 'Ошибка авторизации',
          detail: error.message,
          life: 5000
        });
      } finally {
        this.authState.isAuthenticating = false;
      }
    },

    selectEndpoint(endpoint) {
      this.selectedEndpoint = endpoint;
      this.request.method = endpoint.method;

      let path = endpoint.path;
      if (this.authState.database) {
        path = path.replace('{database}', this.authState.database);
      }

      const baseUrl = this.request.url.split('/api/v2')[0];
      this.request.url = baseUrl + path;

      if (this.needsBody) {
        const exampleKey = `${endpoint.method} ${endpoint.path}`;
        const example = this.bodyExamples[exampleKey];
        this.request.body = example ? JSON.stringify(example, null, 2) : '';
      } else {
        this.request.body = '';
      }

      this.response.data = null;
    },

    async sendRequest() {
      this.isLoading = true;

      const options = {
        method: this.request.method,
        headers: { 'Content-Type': 'application/vnd.api+json' }
      };

      if (this.authState.session) {
        options.headers['Authorization'] = `Bearer ${this.authState.session}`;
      }

      if (this.needsBody && this.request.body) {
        try {
          JSON.parse(this.request.body); // Validate
          options.body = this.request.body;
        } catch (e) {
          this.$toast.add({
            severity: 'error',
            summary: 'Ошибка',
            detail: 'Невалидный JSON в теле запроса',
            life: 3000
          });
          this.isLoading = false;
          return;
        }
      }

      const startTime = performance.now();

      try {
        const response = await fetch(this.request.url, options);
        const duration = Math.round(performance.now() - startTime);

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        this.response = {
          data,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          duration
        };
      } catch (error) {
        this.response = {
          data: `Error: ${error.message}`,
          status: 0,
          statusText: 'Error',
          ok: false,
          duration: 0
        };
      } finally {
        this.isLoading = false;
      }
    },

    formatJSON(data) {
      if (typeof data === 'string') return data;
      return JSON.stringify(data, null, 2);
    }
  }
};
</script>

<style scoped>
.api-sandbox {
  min-height: calc(100vh - 80px);
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.sandbox-header {
  background: white;
  padding: 30px;
  border-radius: 12px 12px 0 0;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.sandbox-header h1 {
  margin: 0 0 10px;
  font-size: 2.5em;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.sandbox-header p {
  margin: 0;
  color: #6c757d;
  font-size: 1.1em;
}

.sandbox-content {
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: 0;
  background: white;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  min-height: 700px;
}

.left-panel {
  background: #f8f9fa;
  padding: 20px;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
  border-right: 2px solid #dee2e6;
  border-radius: 0 0 0 12px;
}

.right-panel {
  padding: 30px;
  background: white;
  border-radius: 0 0 12px 0;
}

.auth-section {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
  border: 2px solid #667eea;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 25px;
}

.auth-section h3 {
  color: #667eea;
  margin: 0 0 15px;
  font-size: 1.2em;
}

.auth-status {
  padding: 10px;
  border-radius: 6px;
  margin-bottom: 15px;
  font-size: 0.9em;
  font-weight: 500;
}

.auth-status.connected {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.auth-status.disconnected {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.auth-input-group {
  margin-bottom: 12px;
}

.auth-input-group label {
  display: block;
  font-size: 0.85em;
  font-weight: 600;
  color: #495057;
  margin-bottom: 5px;
}

.auth-input-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9em;
}

.auth-input-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.quick-db-buttons {
  display: flex;
  gap: 5px;
  margin-top: 5px;
}

.quick-db-buttons button {
  padding: 4px 10px;
  font-size: 0.75em;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-db-buttons button:hover {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.btn-auth {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  margin-top: 10px;
}

.btn-auth:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
}

.btn-auth:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.token-display-wrapper {
  margin-top: 15px;
}

.token-label {
  font-size: 0.85em;
  font-weight: 600;
  color: #495057;
  margin-bottom: 5px;
}

.token-display {
  background: #282c34;
  color: #98c379;
  padding: 10px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.75em;
  word-break: break-all;
  max-height: 80px;
  overflow-y: auto;
}

.endpoint-group {
  margin-bottom: 25px;
}

.endpoint-group h3 {
  color: #495057;
  margin: 0 0 10px;
  font-size: 1em;
  padding-bottom: 8px;
  border-bottom: 2px solid #dee2e6;
}

.endpoint {
  padding: 12px;
  margin: 8px 0;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.3s;
  background: white;
  border-left: 3px solid transparent;
}

.endpoint:hover {
  background: #e9ecef;
  border-left-color: #667eea;
  transform: translateX(5px);
}

.endpoint.active {
  background: rgba(102, 126, 234, 0.08);
  border-left-color: #667eea;
}

.method {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.75em;
  margin-right: 8px;
}

.method.get { background: #28a745; color: white; }
.method.post { background: #007bff; color: white; }
.method.patch { background: #ffc107; color: #212529; }
.method.delete { background: #dc3545; color: white; }

.path {
  font-family: 'Courier New', monospace;
  font-size: 0.85em;
  color: #495057;
}

.input-group {
  margin-bottom: 20px;
}

.input-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
  color: #495057;
}

.input-group input,
.input-group textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid #dee2e6;
  border-radius: 6px;
  font-size: 1em;
  font-family: 'Courier New', monospace;
}

.input-group textarea {
  resize: vertical;
}

.btn-primary {
  padding: 14px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  width: 100%;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
}

.btn-primary:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.response-container {
  margin-top: 30px;
}

.response-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.response-header h4 {
  margin: 0;
  display: inline;
}

.response-status {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: bold;
  margin-left: 10px;
  font-size: 0.9em;
}

.response-status.success { background: #28a745; color: white; }
.response-status.error { background: #dc3545; color: white; }

.response-time {
  color: #6c757d;
  font-size: 0.9em;
}

pre {
  background: #282c34;
  color: #abb2bf;
  padding: 20px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.9em;
  line-height: 1.5;
  max-height: 500px;
  overflow-y: auto;
  margin: 0;
}
</style>
