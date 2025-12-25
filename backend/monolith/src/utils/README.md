# Utils - Utility Functions

This directory contains utility functions and modules used across the Integram backend application.

## Logger (`logger.js`)

Centralized logging utility using [pino](https://getpino.io/) for Node.js backend services.

### Quick Start - Disable Logging

To disable all logging output, add `DISABLE_LOGGING=true` to your `.env` file:

```bash
# backend/monolith/.env
DISABLE_LOGGING=true
```

Then restart your backend server.

### Documentation

For complete usage guide, configuration options, and best practices, see:
- [LOGGER_USAGE.md](./LOGGER_USAGE.md) - Complete logger usage guide

### Recent Fixes

**Issue #3728** (2025-11-30): Fixed `.env` file not being loaded before checking `DISABLE_LOGGING`
- **Problem**: Setting `DISABLE_LOGGING=true` in `.env` file didn't work
- **Root Cause**: `logger.js` didn't import `env.js`, so `.env` file wasn't loaded before reading `process.env.DISABLE_LOGGING`
- **Solution**: Added `import '../config/env.js'` at the top of `logger.js`
- **Verification**: Run `node examples/verify-logger-env-import.js` to verify the fix

### Quick Reference

```javascript
import logger, { createLogger } from './utils/logger.js'

// Use default logger
logger.info('Application started')
logger.error('An error occurred', { error: err.message })

// Create module-specific logger
const moduleLogger = createLogger('MyModule')
moduleLogger.debug('Processing data', { recordCount: 100 })
```

### Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DISABLE_LOGGING` | Disable all logging output | `false` | `true` or `1` |
| `LOG_LEVEL` | Minimum log level to output | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_DIR` | Directory for log files | `/var/log/dronedoc` | `/app/logs` |
| `NODE_ENV` | Environment mode | - | `development`, `production` |

## Other Utilities

(Add documentation for other utilities here as needed)
