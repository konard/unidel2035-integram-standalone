// API v2 Sandbox JavaScript
// Extracted from inline script for CSP compliance (Issue #66)

// Global state
let currentSession = null;
let currentToken = null;
let currentDatabase = null;

// Set database quick button
function setDatabase(db) {
    document.getElementById('authDatabase').value = db;
}

// Authentication
async function authenticate() {
    const serverUrl = document.getElementById('authServerUrl').value.trim();
    const database = document.getElementById('authDatabase').value.trim();
    const login = document.getElementById('authLogin').value.trim();
    const password = document.getElementById('authPassword').value.trim();

    if (!serverUrl || !database || !login || !password) {
        alert('Заполните все поля авторизации');
        return;
    }

    const authButton = document.getElementById('authButton');
    const authLoader = document.getElementById('authLoader');
    const authStatus = document.getElementById('authStatus');

    authButton.disabled = true;
    authLoader.style.display = 'inline-block';
    authStatus.textContent = '⏳ Авторизация...';
    authStatus.className = 'auth-status';

    try {
        const response = await fetch(`${serverUrl}/api/v2/auth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/vnd.api+json'
            },
            body: JSON.stringify({
                data: {
                    type: 'auth',
                    attributes: {
                        login: login,
                        password: password,
                        database: database
                    }
                }
            })
        });

        const data = await response.json();

        if (response.ok && data.data) {
            currentSession = data.data.attributes.session;
            currentToken = data.data.attributes.token;
            currentDatabase = database;

            authStatus.textContent = `✅ Авторизован: ${login}@${database}`;
            authStatus.className = 'auth-status connected';

            document.getElementById('tokenDisplay').style.display = 'block';
            document.getElementById('tokenValue').textContent = currentSession;

            authButton.textContent = '✅ Авторизован';

            // Update base URL for requests
            document.getElementById('url').value = `${serverUrl}/api/v2`;
        } else {
            throw new Error(data.errors?.[0]?.detail || 'Authentication failed');
        }
    } catch (error) {
        authStatus.textContent = `❌ Ошибка: ${error.message}`;
        authStatus.className = 'auth-status disconnected';
        alert(`Ошибка авторизации: ${error.message}`);
    } finally {
        authButton.disabled = false;
        authLoader.style.display = 'none';
    }
}

// Request body examples
const requestBodyExamples = {
    'POST /api/v2/integram/databases/{database}/types/{typeId}/objects': JSON.stringify({
        "data": {
            "type": "integram-object",
            "attributes": {
                "requisites": {
                    "req_name": "ООО Тестовая Компания",
                    "req_email": "test@example.com"
                }
            }
        }
    }, null, 2),
    'PATCH /api/v2/integram/databases/{database}/objects/{objectId}': JSON.stringify({
        "data": {
            "type": "integram-object",
            "id": "{objectId}",
            "attributes": {
                "requisites": {
                    "req_name": "ООО Обновленная Компания"
                }
            }
        }
    }, null, 2)
};

// Initialize endpoint click handlers when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Endpoint click handlers
    document.querySelectorAll('.endpoint').forEach(endpoint => {
        endpoint.addEventListener('click', function() {
            document.querySelectorAll('.endpoint').forEach(e => e.classList.remove('active'));
            this.classList.add('active');

            const method = this.dataset.method;
            let path = this.dataset.path;

            // Replace {database} with current database
            if (currentDatabase) {
                path = path.replace('{database}', currentDatabase);
            }

            const baseUrl = document.getElementById('url').value.split('/api/v2')[0];
            document.getElementById('method').value = method;
            document.getElementById('url').value = baseUrl + path;

            const bodyGroup = document.getElementById('bodyGroup');
            const requestBody = document.getElementById('requestBody');

            if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
                bodyGroup.style.display = 'block';
                const exampleKey = `${method} ${this.dataset.path}`;
                requestBody.value = requestBodyExamples[exampleKey] || '';
            } else {
                bodyGroup.style.display = 'none';
            }

            document.getElementById('responseContainer').style.display = 'none';
        });
    });
});

// Send request
async function sendRequest() {
    const method = document.getElementById('method').value;
    const url = document.getElementById('url').value;
    const bodyText = document.getElementById('requestBody').value;

    const loader = document.getElementById('loader');
    const responseContainer = document.getElementById('responseContainer');
    const responseStatus = document.getElementById('responseStatus');
    const responseTime = document.getElementById('responseTime');
    const responseBody = document.getElementById('responseBody');

    loader.style.display = 'inline-block';
    responseContainer.style.display = 'none';

    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/vnd.api+json'
        }
    };

    // Add auth header if we have a session
    if (currentSession) {
        options.headers['Authorization'] = `Bearer ${currentSession}`;
    }

    if (method !== 'GET' && bodyText) {
        try {
            options.body = bodyText;
        } catch (e) {
            alert('Invalid JSON in request body');
            loader.style.display = 'none';
            return;
        }
    }

    const startTime = performance.now();

    try {
        const response = await fetch(url, options);
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        responseContainer.style.display = 'block';
        responseStatus.textContent = `${response.status} ${response.statusText}`;
        responseStatus.className = `response-status ${response.ok ? 'success' : 'error'}`;
        responseTime.textContent = `⏱️ ${duration}ms`;

        responseBody.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

    } catch (error) {
        responseContainer.style.display = 'block';
        responseStatus.textContent = 'Error';
        responseStatus.className = 'response-status error';
        responseTime.textContent = '';
        responseBody.textContent = `Error: ${error.message}`;
    } finally {
        loader.style.display = 'none';
    }
}
