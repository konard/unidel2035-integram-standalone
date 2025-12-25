# Test User Setup for Authentication

## Issue #2971 - Fix Registration and Test Login

This document explains how to set up a test user for development and testing of the authentication system.

## Problem

The authentication system was experiencing issues:
1. **404 Error**: Frontend was calling `/user-sync/login` without the `/api` prefix
2. **Login Field**: Backend expected `email` but frontend was sending `login` (which could be email or username)
3. **Test Credentials**: Need to set up test user with credentials `login: d, password: d`

## Solutions Implemented

### 1. Fixed API Base URL (Frontend)

**File**: `src/services/authService.js`

Added a helper function to ensure the API base URL always includes the `/api` prefix:

```javascript
const getApiBase = () => {
  const baseUrl = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:8081'
  // Add /api if not already present
  return baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`
}

const API_BASE = getApiBase()
```

### 2. Updated Login Endpoint (Backend)

**File**: `backend/monolith/src/api/routes/user-sync.js`

Updated the `/login` endpoint to:
- Accept both `login` (email or username) and `email` fields
- Search users by email OR username
- Support test users with password_hash stored directly in registry (no Integram required)

```javascript
// Accept either 'login' or 'email' field
const loginField = req.body.login || req.body.email;

// Search by email or username
const user = Object.values(registry.users).find(u =>
  u.email === loginField || u.username === loginField
);

// Check if user has password_hash stored directly (for test/dev users)
if (user.password_hash) {
  passwordHash = user.password_hash;
} else {
  // Fetch from Integram (production flow)
  // ...
}
```

### 3. Created Test User Script

**File**: `backend/monolith/scripts/create-test-user.js`

Script to create a test user with credentials:
- **Username**: `d`
- **Email**: `d@test.local`
- **Password**: `d`

## Usage

### Step 1: Create Test User

Run the test user creation script:

```bash
cd backend/monolith
node scripts/create-test-user.js
```

Expected output:
```
Creating test user...
Username: d
Email: d@test.local
Password: d

✅ Test user created successfully!

Login credentials:
  Username: d
  Email: d@test.local
  Password: d

User ID: <uuid>
Password hash: <bcrypt-hash>

Done!
```

### Step 2: Verify Test User

The test user is stored in:
```
backend/monolith/src/storage/user-sync/user_sync_registry.json
```

Check the file to verify the user was created:

```bash
cat backend/monolith/src/storage/user-sync/user_sync_registry.json
```

Expected structure:
```json
{
  "users": {
    "<user-id>": {
      "userId": "<user-id>",
      "email": "d@test.local",
      "username": "d",
      "displayName": "Test User",
      "password_hash": "$2b$10$...",
      "createdAt": "2025-11-11T...",
      "databases": [
        {
          "name": "test",
          "recordId": "test-record-<user-id>",
          "syncedAt": "2025-11-11T...",
          "status": "active"
        }
      ]
    }
  },
  "metadata": {
    "version": "1.0.0",
    "lastUpdated": "2025-11-11T...",
    "totalUsers": 1
  }
}
```

### Step 3: Test Login

#### Option A: Using Frontend

1. Start the backend:
   ```bash
   cd backend/monolith
   npm run dev
   ```

2. Start the frontend:
   ```bash
   npm run dev
   ```

3. Navigate to login page and enter:
   - **Username**: `d`
   - **Password**: `d`

#### Option B: Using curl

Test the login endpoint directly:

```bash
curl -X POST https://dev.example.integram.io/api/user-sync/login \
  -H "Content-Type: application/json" \
  -d '{
    "login": "d",
    "password": "d"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "userId": "<user-id>",
    "email": "d@test.local",
    "username": "d",
    "displayName": "Test User",
    "token": "<jwt-token>",
    "tokenExpiresIn": "7d"
  }
}
```

#### Option C: Using Postman/Thunder Client

- **Method**: POST
- **URL**: `https://dev.example.integram.io/api/user-sync/login`
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "login": "d",
    "password": "d"
  }
  ```

## Troubleshooting

### Issue: "User not found"

**Cause**: Test user not created or registry file missing.

**Solution**: Run the test user creation script again:
```bash
node backend/monolith/scripts/create-test-user.js
```

### Issue: "Invalid credentials"

**Cause**: Password mismatch or password hash not stored correctly.

**Solution**:
1. Delete the existing user from registry
2. Run the test user creation script again
3. Make sure password is exactly 'd' (lowercase)

### Issue: 404 Error on /user-sync/login

**Cause**: Frontend not using correct API base URL.

**Solution**: Check that `VITE_ORCHESTRATOR_URL` is set correctly in `.env` files:
```env
# .env.dev or .env.development
VITE_ORCHESTRATOR_URL=https://dev.example.integram.io
```

The authService will automatically append `/api` prefix.

### Issue: CORS errors

**Cause**: Backend CORS configuration not allowing frontend origin.

**Solution**: Check backend CORS settings in `backend/monolith/src/middleware/security/securityHeaders.js`

## Production Users

For production users (non-test users), the authentication flow uses Integram:

1. User credentials are stored in Integram ddadmin database
2. Login endpoint fetches user record from Integram
3. Password is verified against Integram password_hash
4. JWT token is generated on successful authentication

Test users bypass Integram and use the password_hash stored directly in the user registry.

## Security Notes

- Test users should ONLY be used in development/testing environments
- DO NOT deploy test users to production
- Test user passwords are simple (single character 'd') for convenience
- Production passwords must meet minimum 8 character requirement
- Password hashes are generated using bcrypt with salt rounds

## Related Files

- `src/services/authService.js` - Frontend authentication service
- `backend/monolith/src/api/routes/user-sync.js` - Backend login endpoint
- `backend/monolith/src/services/user-sync/storageService.js` - User registry storage
- `backend/monolith/scripts/create-test-user.js` - Test user creation script

## References

- Issue #2971: не работает Регистрация и тестовый вход
- Issue #2786: Phase 4 - Frontend Integration for User Sync
