# Logger Usage Guide

This guide explains how to use and configure the logging utilities in the DronDoc application.

## Overview

DronDoc has two separate logger implementations:

1. **Backend Logger** (`backend/monolith/src/utils/logger.js`) - Uses [pino](https://getpino.io/) for Node.js backend services
2. **Frontend Logger** (`src/utils/logger.js`) - Custom logger for Vue.js frontend

## Backend Logger (Node.js)

### Basic Usage

```javascript
import logger, { createLogger } from './utils/logger.js'

// Use default logger
logger.info('Application started')
logger.error('An error occurred', { error: err.message })

// Create module-specific logger
const moduleLogger = createLogger('MyModule')
moduleLogger.debug('Processing data', { recordCount: 100 })
```

### Configuration via Environment Variables

The backend logger can be configured using the following environment variables:

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DISABLE_LOGGING` | Disable all logging output | `false` | `true` or `1` |
| `LOG_LEVEL` | Minimum log level to output | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_DIR` | Directory for log files | `/var/log/dronedoc` | `/app/logs` |
| `NODE_ENV` | Environment mode (affects output format) | - | `development`, `production` |

### How to Disable Backend Logging

#### Method 1: Environment Variable (Recommended)

Set the `DISABLE_LOGGING` environment variable:

```bash
# Completely disable logging
export DISABLE_LOGGING=true

# Or use numeric value
export DISABLE_LOGGING=1

# Then start your application
npm start
```

#### Method 2: Docker/Docker Compose

Add to your `docker-compose.yml`:

```yaml
services:
  backend:
    environment:
      - DISABLE_LOGGING=true
```

#### Method 3: .env File (Recommended for Development)

Add to your `.env` file in `backend/monolith/`:

```
DISABLE_LOGGING=true
```

**Important:** After creating or modifying the `.env` file, you MUST restart the backend server for changes to take effect.

**Note:** As of Issue #3728 fix, the logger now properly loads environment variables from `.env` file. Previously, this method would not work because `env.js` wasn't imported before checking `DISABLE_LOGGING`.

### Log Levels

Pino supports the following log levels (from least to most severe):

- `trace` - Very detailed debugging information
- `debug` - Debugging information
- `info` - General informational messages (default)
- `warn` - Warning messages
- `error` - Error messages
- `fatal` - Critical errors
- `silent` - Disable all logging (automatically set when `DISABLE_LOGGING=true`)

### Output Behavior

**Development Mode** (`NODE_ENV !== 'production'`):
- Logs to console with pretty formatting (colors, timestamps)
- Logs to file in JSON format

**Production Mode** (`NODE_ENV === 'production'`):
- Logs to file only in JSON format
- No console output (for performance)

**When Disabled** (`DISABLE_LOGGING=true`):
- No console output
- No file output
- Log directory not created
- Minimal performance overhead

## Frontend Logger (Vue.js)

### Basic Usage

```javascript
import { logger, Logger, LOG_LEVELS } from '@/utils/logger.js'

// Use default logger
logger.info('User logged in', { userId: 123 })
logger.error('API request failed', { endpoint: '/api/users' })

// Create custom logger instance
const customLogger = new Logger({
  enabled: true,
  minLevel: LOG_LEVELS.DEBUG,
  context: { component: 'UserProfile' }
})

customLogger.debug('Component mounted')
```

### How to Disable Frontend Logging

#### Method 1: Disable Default Logger

```javascript
import { logger } from '@/utils/logger.js'

// Disable the default logger instance
logger.enabled = false

// All subsequent log calls will be ignored
logger.info('This will not be logged')
```

#### Method 2: Create Disabled Logger Instance

```javascript
import { Logger } from '@/utils/logger.js'

const logger = new Logger({
  enabled: false  // Disable logging for this instance
})

logger.info('This will not be logged')
```

#### Method 3: Set High Minimum Level

```javascript
import { Logger, LOG_LEVELS } from '@/utils/logger.js'

const logger = new Logger({
  minLevel: LOG_LEVELS.CRITICAL  // Only log critical messages
})

logger.info('This will not be logged')
logger.debug('This will not be logged')
logger.critical('This WILL be logged')
```

#### Method 4: Production Environment

In production builds (`import.meta.env.PROD === true`), the logger automatically:
- Sets minimum level to `INFO` (hides DEBUG messages)
- Disables console output for lower severity messages

### Log Levels

Frontend logger supports these levels:

| Level | Value | Description |
|-------|-------|-------------|
| `DEBUG` | 0 | Detailed debugging information |
| `INFO` | 1 | General informational messages |
| `WARN` | 2 | Warning messages |
| `ERROR` | 3 | Error messages |
| `CRITICAL` | 4 | Critical errors requiring immediate attention |

### Custom Handlers

You can add custom handlers to send logs to external services:

```javascript
import { logger } from '@/utils/logger.js'

// Add handler to send errors to monitoring service
logger.addHandler((logEntry) => {
  if (logEntry.level === 'ERROR' || logEntry.level === 'CRITICAL') {
    // Send to monitoring service
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logEntry)
    })
  }
})
```

## Best Practices

### 1. Use Appropriate Log Levels

```javascript
// ✅ GOOD - Use appropriate levels
logger.debug('Request payload:', { data })  // Debugging info
logger.info('User created successfully')    // General info
logger.warn('API rate limit approaching')   // Warning
logger.error('Database connection failed')  // Error
logger.critical('System out of memory')     // Critical

// ❌ BAD - Using wrong levels
logger.info('Detailed variable state')      // Should be debug
logger.error('User clicked button')         // Should be info or debug
```

### 2. Include Context in Logs

```javascript
// ✅ GOOD - Include relevant context
logger.error('Failed to save user', {
  userId: user.id,
  error: err.message,
  stack: err.stack
})

// ❌ BAD - No context
logger.error('Failed to save user')
```

### 3. Create Module-Specific Loggers

```javascript
// ✅ GOOD - Backend
const logger = createLogger('UserService')
logger.info('User created', { userId })

// ✅ GOOD - Frontend
const logger = new Logger({
  context: { component: 'LoginForm' }
})
logger.info('Login attempt', { username })
```

### 4. Don't Log Sensitive Information

```javascript
// ❌ BAD - Logging passwords and tokens
logger.info('User logged in', {
  username: user.username,
  password: user.password,        // ❌ Never log passwords!
  accessToken: user.accessToken   // ❌ Never log tokens!
})

// ✅ GOOD - Redact sensitive information
logger.info('User logged in', {
  username: user.username,
  userId: user.id
})
```

### 5. Disable Logging in Tests

```javascript
// In test setup
import { logger } from '@/utils/logger.js'

beforeAll(() => {
  logger.enabled = false  // Disable for cleaner test output
})

afterAll(() => {
  logger.enabled = true
})
```

## Performance Considerations

### Backend Logger

- When disabled (`DISABLE_LOGGING=true`), pino uses `silent` level with minimal overhead
- In production, avoid excessive logging in hot code paths
- Use child loggers for module-specific context (more efficient than passing context every time)

### Frontend Logger

- Disabled loggers (`enabled: false`) skip all processing
- In production builds, DEBUG logs are automatically filtered
- Log handlers are called after level check, so they don't affect performance when disabled

## Troubleshooting

### Backend Logger Not Writing to File

**Problem:** Logs not appearing in log file

**Solutions:**
1. Check log directory permissions: `ls -la /var/log/dronedoc`
2. Ensure directory exists: `mkdir -p /var/log/dronedoc`
3. Check `LOG_DIR` environment variable
4. Verify logging is not disabled: `echo $DISABLE_LOGGING`

### Frontend Logger Not Appearing in Console

**Problem:** Logs not appearing in browser console

**Solutions:**
1. Check if logger is enabled: `logger.enabled`
2. Check minimum log level: `logger.minLevel`
3. Open browser DevTools console
4. Check if running in production mode: `import.meta.env.PROD`

### Too Many Logs

**Problem:** Excessive logging affecting performance

**Solutions:**
1. Increase log level: `LOG_LEVEL=warn` or `logger.minLevel = LOG_LEVELS.WARN`
2. Disable debug logs in production
3. Use conditional logging for expensive operations
4. Disable specific module loggers

## Examples

### Example 1: Backend Service with Logging

```javascript
import { createLogger } from './utils/logger.js'

const logger = createLogger('AuthService')

export class AuthService {
  async login(username, password) {
    logger.info('Login attempt', { username })

    try {
      const user = await this.validateCredentials(username, password)
      logger.info('Login successful', { userId: user.id })
      return user
    } catch (error) {
      logger.error('Login failed', {
        username,
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }
}
```

### Example 2: Frontend Component with Logging

```javascript
<script setup>
import { Logger, LOG_LEVELS } from '@/utils/logger.js'
import { onMounted, onUnmounted } from 'vue'

const logger = new Logger({
  context: { component: 'DataTable' },
  minLevel: import.meta.env.PROD ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG
})

onMounted(() => {
  logger.debug('Component mounted')
  loadData()
})

onUnmounted(() => {
  logger.debug('Component unmounted')
})

async function loadData() {
  logger.info('Loading data')

  try {
    const data = await fetchData()
    logger.info('Data loaded successfully', { recordCount: data.length })
  } catch (error) {
    logger.error('Failed to load data', {
      error: error.message,
      endpoint: error.config?.url
    })
  }
}
</script>
```

### Example 3: Completely Disable Logging for Tests

```javascript
// test-setup.js
import { logger } from '@/utils/logger.js'

// Disable default frontend logger
logger.enabled = false

// Disable backend logger via environment
process.env.DISABLE_LOGGING = 'true'
```

## Related Issues

- Issue #2140 - Centralized logging utility implementation
- Issue #3728 - How to disable logging in logger.js

## References

- [Pino Documentation](https://getpino.io/)
- [Vue.js Best Practices](https://vuejs.org/guide/best-practices/)
- [DronDoc Contributing Guidelines](../../CONTRIBUTING.md)
