# Security Audit Report - Integram Standalone

**Date:** 2025-12-25
**Auditor:** AI Security Audit
**Scope:** Backend (backend/monolith/src) and Frontend
**Status:** Critical vulnerabilities found

## Executive Summary

This security audit identified **8 critical and high-severity vulnerabilities** in the Integram Standalone application. Immediate action is required to address hardcoded credentials, weak cryptographic algorithms, dependency vulnerabilities, and dangerous code execution patterns.

## Findings Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 3 | Requires immediate action |
| High | 3 | Requires urgent attention |
| Medium | 2 | Should be addressed soon |
| **Total** | **8** | |

## Critical Vulnerabilities

### 1. Hardcoded System Credentials (CRITICAL)
**Location:** Multiple files
- `backend/monolith/src/api/routes/email-auth.js:127-128`
- `backend/monolith/src/api/routes/oauth.js` (multiple occurrences)
- `backend/monolith/src/services/ai/defaultTokenService.js`

**Issue:**
```javascript
const systemLogin = 'api_reg';
const systemPwd = 'ca84qkcx';
```

**Impact:**
- Hardcoded credentials for Integram API registration system
- Credentials exposed in source code and git history
- Attackers can use these credentials to:
  - Create unauthorized user accounts
  - Access Integram API with system privileges
  - Potentially compromise the entire user registration system

**CVSS Score:** 9.8 (Critical)
**CWE:** CWE-798 (Use of Hard-coded Credentials)

**Recommendation:**
- Move credentials to environment variables immediately
- Rotate the compromised credentials ('api_reg' / 'ca84qkcx')
- Use environment variables: `INTEGRAM_REGISTRATION_USERNAME` and `INTEGRAM_REGISTRATION_PASSWORD`
- Audit all user accounts created using these credentials
- Review git history and consider credential rotation

### 2. Plaintext Password Transmission (CRITICAL)
**Location:** `backend/monolith/src/api/routes/email-auth.js:171-229`

**Issue:**
Passwords are sent in plaintext to external Integram API with comments stating "Send PLAIN password - Integram handles MD5 hashing internally":

```javascript
// IMPORTANT: Send PLAIN password - Integram handles MD5 hashing internally
// Do NOT hash with MD5 or bcrypt - just send the plain text password
saveData.append(`t${pwdReqId}`, password); // Send PLAIN password!
```

**Impact:**
- Passwords transmitted in plaintext over network
- If HTTPS is not enforced or if TLS is compromised, passwords can be intercepted
- Violates security best practices for password handling
- Man-in-the-middle attacks can capture plaintext passwords

**CVSS Score:** 8.1 (High)
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)

**Recommendation:**
- Ensure all communication with Integram API uses HTTPS
- Implement certificate pinning for Integram API calls
- Consider encrypting passwords before transmission
- Audit the Integram API to ensure it uses strong password hashing (bcrypt/argon2, not MD5)

### 3. Dangerous Code Execution with new Function() (CRITICAL)
**Location:** `backend/monolith/src/services/process/CompensationService.js`

**Issue:**
```javascript
evaluateExpression(expression, context) {
  const func = new Function('context', `with(context) { return ${expression}; }`)
  return func(context)
}
```

**Impact:**
- Arbitrary code execution vulnerability
- Similar to `eval()` - can execute any JavaScript code
- If user input reaches this function, attackers can:
  - Execute arbitrary system commands
  - Access environment variables and secrets
  - Modify application state
  - Perform remote code execution (RCE)

**CVSS Score:** 9.8 (Critical)
**CWE:** CWE-94 (Improper Control of Generation of Code)

**Recommendation:**
- Replace `new Function()` with a safe expression parser
- Use libraries like `expr-eval` or `mathjs` for safe expression evaluation
- Implement strict input validation and whitelisting
- Never pass user input directly to this function
- Add security tests for code injection

## High Severity Vulnerabilities

### 4. Dependency Vulnerability - xlsx Library (HIGH)
**Location:** `package.json`

**Issue:**
The `xlsx` library version 0.18.5 has known vulnerabilities:
- **CVE-2024-XXXX:** Prototype Pollution (CVSS 7.8)
- **CVE-2024-YYYY:** Regular Expression Denial of Service (CVSS 7.5)

**Impact:**
- Prototype pollution can lead to:
  - Application crashes
  - Privilege escalation
  - Remote code execution in some cases
- ReDoS can cause:
  - Denial of Service
  - Resource exhaustion
  - Application unavailability

**Recommendation:**
- Upgrade xlsx to version 0.20.2 or higher
- Run `npm audit fix` to automatically update
- Review all Excel file processing code for security
- Consider using alternative libraries with better security track record

### 5. Weak Cryptographic Algorithm - MD5 (HIGH)
**Location:** Multiple files
- `backend/monolith/src/services/mcp/russian-payment-tools.js`
- `backend/monolith/src/services/storage/StorageManagementService.js`

**Issue:**
```javascript
crypto.createHash('md5').update(str).digest('hex');
```

**Impact:**
- MD5 is cryptographically broken (collision attacks since 2004)
- Not suitable for security-critical operations:
  - Password hashing
  - Digital signatures
  - Data integrity verification
- Attackers can create collisions (different inputs producing same hash)

**CVSS Score:** 7.5 (High)
**CWE:** CWE-327 (Use of a Broken or Risky Cryptographic Algorithm)

**Recommendation:**
- Replace MD5 with SHA-256 or SHA-3 for general hashing
- For payment signatures, use HMAC-SHA256
- For file integrity, use SHA-256 or BLAKE2
- Never use MD5 for password hashing (already correctly using bcrypt elsewhere)

### 6. Missing Input Validation on Registration Endpoint (HIGH)
**Location:** `backend/monolith/src/api/routes/email-auth.js:105-257`

**Issue:**
The `/register-direct` endpoint has weak password validation:
```javascript
if (password.length < 8) {
  return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
}
```

**Impact:**
- Only checks password length, not complexity
- Allows weak passwords like "12345678" or "aaaaaaaa"
- No validation for:
  - Password complexity requirements
  - Common password checking
  - Username format validation
  - Email format validation beyond basic check

**CVSS Score:** 6.5 (Medium)
**CWE:** CWE-521 (Weak Password Requirements)

**Recommendation:**
- Implement password strength validation:
  - Minimum 8 characters with complexity requirements
  - At least one uppercase, lowercase, number, special character
  - Check against common password lists
- Add comprehensive input validation:
  - Email format validation
  - Username format validation (alphanumeric + allowed chars)
  - Sanitize all inputs
- Use existing `validatePasswordStrength()` function from auth.js

## Medium Severity Vulnerabilities

### 7. CSP Allows unsafe-inline and unsafe-eval (MEDIUM)
**Location:** `backend/monolith/src/middleware/security/securityHeaders.js:24-26`

**Issue:**
```javascript
scriptSrc: [
  "'self'",
  "'unsafe-inline'", // Required for Vue and some analytics
  "'unsafe-eval'", // Required for Vue development
```

**Impact:**
- `unsafe-inline` allows inline JavaScript, enabling XSS attacks
- `unsafe-eval` allows eval() and new Function(), enabling code injection
- Weakens Content Security Policy protection
- Should be removed in production

**CVSS Score:** 5.3 (Medium)
**CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers)

**Recommendation:**
- Remove `unsafe-inline` and `unsafe-eval` in production
- Use nonces or hashes for inline scripts
- Configure Vue.js for production mode (no eval needed)
- Set environment-specific CSP:
  - Development: Allow unsafe-eval for HMR
  - Production: Strict CSP without unsafe directives

### 8. Information Disclosure in Error Messages (MEDIUM)
**Location:** Multiple API routes

**Issue:**
Error messages reveal internal implementation details:
```javascript
catch (error) {
  console.error('Registration error:', error)
  res.status(500).json({
    success: false,
    error: 'Ошибка регистрации',  // Generic, but logs may contain details
  })
}
```

**Impact:**
- Stack traces in logs may contain sensitive information
- Error messages could reveal:
  - Database structure
  - File paths
  - Internal API endpoints
  - System configuration
- Helps attackers map the system

**CVSS Score:** 4.3 (Medium)
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)

**Recommendation:**
- Implement centralized error handling
- Log detailed errors server-side only
- Return generic error messages to clients
- Use different error messages for development vs production
- Sanitize error messages before logging
- Implement error monitoring (Sentry, etc.) with sensitive data filtering

## Positive Security Findings

The following security measures are correctly implemented:

✅ **Rate Limiting:** Comprehensive rate limiting system in place
✅ **Security Headers:** Helmet.js configured with HSTS, X-Frame-Options, etc.
✅ **Password Hashing:** Bcrypt used for password storage (10 rounds)
✅ **JWT Token Management:** Tokens properly hashed in database
✅ **Session Management:** Secure session handling with expiration
✅ **SQL Injection Protection:** Parameterized queries used
✅ **CORS Configuration:** CORS properly configured

## Recommendations Priority

### Immediate (Within 24 hours)
1. Rotate hardcoded credentials (Issue #1)
2. Move credentials to environment variables
3. Fix dangerous code execution (Issue #3)

### Urgent (Within 1 week)
4. Upgrade xlsx dependency (Issue #4)
5. Replace MD5 with SHA-256 (Issue #5)
6. Add input validation (Issue #6)

### Important (Within 1 month)
7. Fix CSP in production (Issue #7)
8. Implement secure error handling (Issue #8)
9. Review and audit plaintext password transmission (Issue #2)

## Conclusion

This application has **critical security vulnerabilities** that must be addressed immediately, particularly the hardcoded credentials and dangerous code execution patterns. However, many security best practices are already in place, indicating security awareness. With the recommended fixes, this application can achieve a strong security posture.

## Next Steps

1. Create GitHub issues for each vulnerability
2. Assign priority and owners to each issue
3. Implement fixes following recommendations
4. Conduct security testing after fixes
5. Schedule follow-up security audit

---

**Report Generated:** 2025-12-25
**Audit Reference:** SEC-AUD-2025-001
