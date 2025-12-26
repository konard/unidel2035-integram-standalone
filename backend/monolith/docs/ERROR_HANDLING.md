# Error Handling Guide

**Security Issue #67 - Information Disclosure Prevention**

This guide explains how to properly handle errors in the Integram backend to prevent information disclosure through error messages (CWE-209).

## Overview

The centralized error handling system ensures that:
- Full error details are logged server-side for debugging
- Clients receive sanitized, generic error messages
- Sensitive information (paths, credentials, internal details) is never exposed
- Stack traces are only included in development mode

## Architecture

### Core Components

1. **errorHandler.js** - Main error handling middleware
2. **selfHealingErrorHandler.js** - Error monitoring and recovery
3. **requestLogger.js** - Secure request logging

### Error Flow

```
Route Handler
    ↓
AsyncHandler (catches errors)
    ↓
Error Handler Middleware
    ↓
Logger (server-side) + Sanitized Response (client-side)
```

## Usage

### For New Route Handlers

Use the `asyncHandler` wrapper for all async route handlers:

```javascript
import { asyncHandler } from '../../middleware/errorHandler.js';

router.post('/example', asyncHandler(async (req, res) => {
  // Your code here - errors are automatically caught
  const data = await someAsyncOperation();
  res.json({ success: true, data });
}));
```

### For Existing Try-Catch Blocks

**Before (insecure):**
```javascript
router.post('/example', async (req, res) => {
  try {
    const data = await someOperation();
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message }); // ❌ Leaks internal details
  }
});
```

**After (secure):**
```javascript
router.post('/example', asyncHandler(async (req, res) => {
  const data = await someOperation();
  res.json(data);
}));
// ✅ Errors caught and sanitized automatically
```

### Custom Error Messages

For specific error types, throw errors with proper status codes:

```javascript
import { createError } from '../../middleware/errorHandler.js';

router.get('/user/:id', asyncHandler(async (req, res) => {
  const user = await findUser(req.params.id);

  if (!user) {
    throw createError('Пользователь не найден', 404, 'ENOTFOUND');
  }

  res.json(user);
}));
```

### Validation Errors

For validation errors, return them directly (safe):

```javascript
router.post('/create', asyncHandler(async (req, res) => {
  if (!req.body.email) {
    return res.status(400).json({
      success: false,
      error: 'Email is required'
    });
  }

  // Continue with processing...
}));
```

## Error Sanitization

### Automatically Filtered

The error handler automatically filters:
- File system paths (`/var/www/...`, `/home/...`)
- Database connection strings
- Internal IP addresses
- Tokens and secrets
- SQL table/column names
- Email addresses in error messages

### Safe Error Messages

Common errors are mapped to safe messages:

| Error Type | Safe Message |
|------------|--------------|
| `ENOENT` | "Ресурс не найден" |
| `EAUTH` | "Ошибка аутентификации" |
| `EACCESS` | "Доступ запрещен" |
| Database errors | "Ошибка обработки запроса" |
| Network timeouts | "Превышено время ожидания" |

## Environment Modes

### Development Mode

When `NODE_ENV=development`:
- Full error messages in responses
- Stack traces included (limited to 5 lines)
- More verbose logging

Example response:
```json
{
  "success": false,
  "error": "Ошибка обработки запроса",
  "debug": {
    "message": "Connection timeout",
    "name": "TimeoutError",
    "code": "ETIMEDOUT",
    "stack": ["at ...", "at ...", ...]
  }
}
```

### Production Mode

When `NODE_ENV=production`:
- Generic error messages only
- No stack traces
- Minimal information disclosure

Example response:
```json
{
  "success": false,
  "error": "Внутренняя ошибка сервера"
}
```

## Logging Best Practices

### Use Logger, Not Console

**Don't:**
```javascript
console.error('Error:', error);  // ❌ Not structured, can't be filtered
```

**Do:**
```javascript
logger.error({
  error: error.message,
  stack: error.stack,
  userId: req.user?.id
}, 'Operation failed');  // ✅ Structured, searchable
```

### Log Context, Not Sensitive Data

**Don't:**
```javascript
logger.info({ password: req.body.password }, 'Login attempt');  // ❌ Leaks password
```

**Do:**
```javascript
logger.info({ email: req.body.email, ip: req.ip }, 'Login attempt');  // ✅ Safe context
```

## Testing Error Handling

### Test Error Responses

```javascript
// tests/error-handling.test.js
describe('Error Handling', () => {
  it('should not expose stack traces in production', async () => {
    process.env.NODE_ENV = 'production';

    const response = await request(app)
      .post('/api/example')
      .send({ invalid: 'data' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Внутренняя ошибка сервера');
    expect(response.body.stack).toBeUndefined();
  });
});
```

## Migration Checklist

When updating existing routes:

- [ ] Import `asyncHandler` from error middleware
- [ ] Wrap async route handlers with `asyncHandler`
- [ ] Remove try-catch blocks (unless specific handling needed)
- [ ] Replace `console.error` with `logger.error`
- [ ] Ensure error messages don't leak internal details
- [ ] Test in both development and production modes

## Security Considerations

### What NOT to Include in Client Errors

❌ File paths
❌ Database schema details
❌ Stack traces (in production)
❌ Internal IP addresses
❌ Authentication tokens
❌ SQL queries
❌ Configuration details
❌ Dependency versions

### What IS Safe to Include

✅ Generic error messages
✅ HTTP status codes
✅ Safe error codes (EAUTH, ENOTFOUND, etc.)
✅ Validation error details (field names)
✅ User-facing messages in local language

## Monitoring

The `selfHealingErrorHandler` tracks:
- Error rates by endpoint
- Error types and frequencies
- Potential attack patterns

Access error statistics:
```javascript
import { getErrorStats } from './middleware/selfHealingErrorHandler.js';

const stats = getErrorStats();
console.log(stats);
```

## References

- **CWE-209**: Generation of Error Message Containing Sensitive Information
- **OWASP**: Improper Error Handling
- **Issue #67**: Information Disclosure Through Error Messages

## Support

For questions or issues:
1. Check this documentation
2. Review existing route implementations
3. Contact the security team
4. Create an issue with the `security` label
