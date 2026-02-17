# Backend Componentization Plan: From Monolith to Modern Architecture

## Executive Summary

This document provides a comprehensive plan for decomposing the Integram PHP monolithic backend into well-defined, loosely-coupled components while maintaining **full backward compatibility** with existing endpoints and data formats.

**Key Constraints:**
- All existing API endpoints must remain functional
- Data format compatibility must be preserved
- Migration should be gradual with zero downtime
- Each phase must be independently deployable and reversible

---

## 1. Current Architecture Analysis

### 1.1 PHP Monolith (`integram-server/`)

The legacy PHP backend consists of:

| File | Lines | Description |
|------|-------|-------------|
| `index.php` | ~9,180 | Main monolith with ~75+ functions handling routing, auth, business logic, DB operations, export, reporting |
| `db.php` | ~1,794 | Adminer database management tool |
| `auth.php` | ~123 | OAuth handler (Yandex, VK, Mail.ru) |
| `upload.php` | N/A | File upload handling |
| `include/connection.php` | N/A | Database connection configuration |
| `include/funcs.php` | N/A | Shared utility functions |

**Key Functions in index.php (grouped by responsibility):**

1. **Authentication & Authorization (~15 functions)**
   - `Validate_Token()`, `authJWT()`, `login()`, `xsrf()`
   - `Check_Grant()`, `Check_Types_Grant()`, `Grant_1level()`, `getGrants()`
   - `Salt()`, `pwd_reset()`

2. **Database Operations (~12 functions)**
   - `Exec_sql()`, `Insert()`, `Insert_batch()`, `Update_Val()`, `UpdateTyp()`
   - `Delete()`, `BatchDelete()`, `checkNewRef()`, `checkDuplicatedReqs()`

3. **Business Logic (~20 functions)**
   - `newUser()`, `newDb()`, `createDb()`, `mail2DB()`
   - `Compile_Report()`, `Get_block_data()`, `Parse_block()`
   - `Export_reqs()`, `exportHeader()`, `exportTerms()`

4. **Utilities & Formatting (~15 functions)**
   - `Format_Val()`, `Format_Val_View()`, `Get_Align()`
   - `t9n()`, `localize()`, `NormalSize()`
   - `wlog()`, `trace()`, `my_die()`, `die_info()`

5. **Email & Notifications (~4 functions)**
   - `mysendmail()`, `smtpmail()`, `server_parse()`

6. **File Operations (~5 functions)**
   - `Get_file()`, `GetFilename()`, `GetSubdir()`, `RemoveDir()`, `Download_send_headers()`

### 1.2 Node.js Backend (`backend/monolith/`)

The Node.js backend is already more modular:

| Directory | Count | Description |
|-----------|-------|-------------|
| `src/api/routes/` | ~150+ files | REST API endpoints |
| `src/services/` | ~95 files | Business logic services |
| `src/core/` | 10 files | Core infrastructure (TaskQueue, AgentRegistry, Coordinator) |
| `src/middleware/` | Multiple | Security, auth, validation middleware |
| `src/models/` | N/A | Data models |
| `src/utils/` | N/A | Shared utilities |

**Services Categories:**
- AI/LLM: Chat, Claude proxy, AI providers, Knowledge management
- Agents: Agent orchestration, multi-agent coordination, agent discovery
- Integrations: GitHub, Telegram, HeadHunter, 1C, CRM
- Infrastructure: Health checks, monitoring, CI/CD, self-healing
- Business: Accounting, billing, customer journey, leads
- Data: Database management, backup, sync, workspace

---

## 2. Target Architecture

### 2.1 Component Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                       API Gateway Layer                         │
│              (Routes, Authentication, Rate Limiting)            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
    ┌───────────────────────┼───────────────────────┐
    ▼                       ▼                       ▼
┌─────────┐           ┌──────────┐            ┌─────────┐
│  Auth   │           │  Core    │            │ Business│
│ Service │           │  Data    │            │ Domains │
│         │           │  Service │            │         │
└─────────┘           └──────────┘            └─────────┘
    │                       │                       │
    └───────────────────────┼───────────────────────┘
                            ▼
                    ┌───────────────┐
                    │  Shared       │
                    │  Libraries    │
                    └───────────────┘
```

### 2.2 Component Definitions

#### 2.2.1 Authentication Service (`@integram/auth-service`)
**Responsibilities:**
- User authentication (JWT, OAuth, session-based)
- Token management and validation
- Password reset and recovery
- Multi-provider OAuth (Google, Yandex, VK, Mail.ru)
- Permission and role management

**Backward Compatible APIs:**
- `POST /api/auth/login` → existing login behavior
- `POST /api/auth/register` → existing registration flow
- `GET /auth.php?provider={name}` → legacy OAuth redirect

#### 2.2.2 Core Data Service (`@integram/core-data`)
**Responsibilities:**
- CRUD operations on Integram objects
- Database schema management
- Query building and execution
- Data validation and sanitization
- Export/Import operations

**Backward Compatible APIs:**
- All existing `index.php` query parameters
- JSON_DATA, JSON_KV, JSON_CR, JSON_HR formats
- Legacy response formats

#### 2.2.3 Reporting Service (`@integram/reporting`)
**Responsibilities:**
- Report compilation and execution
- Data aggregation
- Export to various formats (CSV, XLSX, PDF)
- Scheduled reports

**Backward Compatible APIs:**
- All existing report compilation endpoints
- Export format parameters unchanged

#### 2.2.4 File Service (`@integram/file-service`)
**Responsibilities:**
- File upload and download
- Storage management
- File processing and conversion
- CDN integration

**Backward Compatible APIs:**
- `upload.php` functionality preserved
- Same file URL patterns

#### 2.2.5 Notification Service (`@integram/notifications`)
**Responsibilities:**
- Email sending (SMTP)
- Push notifications
- In-app notifications
- Notification templates

**Backward Compatible APIs:**
- All email sending behavior preserved
- Same template formats

#### 2.2.6 Integration Service (`@integram/integrations`)
**Responsibilities:**
- External API connections (HH, 1C, CRM, etc.)
- Webhook management
- Data synchronization

#### 2.2.7 Agent Orchestration Service (`@integram/agents`)
**Responsibilities:**
- AI agent management
- Task queue processing
- Multi-agent coordination

---

## 3. Migration Strategy

### 3.1 Strangler Fig Pattern

We will use the **Strangler Fig Pattern** for gradual migration:

1. **Facade Phase**: Introduce a routing facade that proxies to existing code
2. **Extraction Phase**: Extract components one at a time behind the facade
3. **Verification Phase**: Verify each extraction maintains compatibility
4. **Deprecation Phase**: Mark old code as deprecated, not removed

### 3.2 Phase 1: Foundation (2-3 weeks)

**Goal:** Create shared infrastructure without changing existing behavior

#### 1.1 Create Shared Libraries
```
packages/
├── @integram/common/           # Shared types, interfaces, utilities
│   ├── types/
│   ├── utils/
│   ├── constants/
│   └── errors/
├── @integram/database/         # Database abstraction layer
│   ├── connection.js
│   ├── query-builder.js
│   └── migrations/
└── @integram/logger/           # Unified logging
    ├── logger.js
    └── formatters/
```

#### 1.2 Database Abstraction Layer
- Wrap existing `Exec_sql()` calls with a new database layer
- Add query logging and metrics
- Prepare for future database migrations

#### 1.3 Unified Configuration
- Consolidate `.env` files
- Create configuration service
- Support hot-reloading for non-sensitive configs

### 3.3 Phase 2: Authentication Service Extraction (3-4 weeks)

**Goal:** Extract authentication into a standalone service

#### 2.1 Create Authentication Service Structure
```
services/auth-service/
├── src/
│   ├── controllers/
│   │   ├── AuthController.js
│   │   ├── OAuthController.js
│   │   └── TokenController.js
│   ├── services/
│   │   ├── JWTService.js
│   │   ├── OAuthService.js
│   │   ├── PasswordService.js
│   │   └── PermissionService.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── rateLimiter.js
│   ├── models/
│   │   └── User.js
│   └── routes/
│       └── index.js
├── tests/
└── package.json
```

#### 2.2 Migration Steps
1. Create service with new implementation
2. Add compatibility layer for PHP endpoints
3. Route new requests through new service
4. Verify backward compatibility
5. Gradually migrate PHP auth to Node.js service

#### 2.3 Compatibility Layer
```javascript
// Compatibility endpoint wrapper
app.all('/*/register', async (req, res) => {
  // Transform legacy request format
  const transformedReq = transformLegacyRequest(req);

  // Call new auth service
  const result = await authService.register(transformedReq);

  // Transform response to legacy format
  const legacyResponse = transformToLegacyFormat(result);
  res.send(legacyResponse);
});
```

### 3.4 Phase 3: Core Data Service Extraction (4-6 weeks)

**Goal:** Extract CRUD and query operations

#### 3.1 Create Core Data Service Structure
```
services/core-data-service/
├── src/
│   ├── controllers/
│   │   ├── ObjectController.js
│   │   ├── TypeController.js
│   │   └── QueryController.js
│   ├── services/
│   │   ├── ObjectService.js
│   │   ├── ValidationService.js
│   │   └── QueryBuilder.js
│   ├── repositories/
│   │   └── ObjectRepository.js
│   └── routes/
│       ├── v1/          # Legacy compatibility
│       └── v2/          # New JSON:API format
├── tests/
└── package.json
```

#### 3.2 Functions to Extract from index.php
| PHP Function | New Service Method | Notes |
|--------------|-------------------|-------|
| `Exec_sql()` | `QueryService.execute()` | Add parameterization |
| `Insert()` | `ObjectService.create()` | Add validation |
| `Update_Val()` | `ObjectService.update()` | Add versioning |
| `Delete()` | `ObjectService.delete()` | Add soft delete option |
| `Check_Grant()` | `PermissionService.check()` | Centralize |
| `Construct_WHERE()` | `QueryBuilder.where()` | Prevent SQL injection |

#### 3.3 API Compatibility Matrix

| Legacy Endpoint | New Endpoint | Compatibility |
|-----------------|--------------|---------------|
| `GET /{db}/object/{type}` | `GET /api/v2/integram/databases/{db}/types/{type}/objects` | Facade proxy |
| `POST /{db}?JSON_DATA=...` | `POST /api/v2/integram/databases/{db}/objects` | Request transformer |
| `GET /{db}?JSON_KV=...` | `GET /api/v2/integram/databases/{db}/objects/{id}` | Response transformer |

### 3.5 Phase 4: Reporting Service Extraction (2-3 weeks)

**Goal:** Extract reporting and export functionality

#### 4.1 Functions to Extract
- `Compile_Report()`
- `Get_block_data()`
- `Export_reqs()`
- `exportHeader()`
- `exportTerms()`
- `Download_send_headers()`

#### 4.2 Service Structure
```
services/reporting-service/
├── src/
│   ├── services/
│   │   ├── ReportCompiler.js
│   │   ├── ExportService.js
│   │   └── SchedulerService.js
│   ├── exporters/
│   │   ├── CSVExporter.js
│   │   ├── XLSXExporter.js
│   │   └── PDFExporter.js
│   └── templates/
└── package.json
```

### 3.6 Phase 5: File Service Extraction (1-2 weeks)

**Goal:** Consolidate file operations

#### 5.1 Functions to Extract
- `upload.php` functionality
- `Get_file()`
- `GetFilename()`
- `GetSubdir()`
- `RemoveDir()`

### 3.7 Phase 6: Service Mesh Integration (2-3 weeks)

**Goal:** Add service discovery, health checks, circuit breakers

#### 6.1 Components
- Service registry (Consul or custom)
- Health check endpoints for each service
- Circuit breaker pattern for inter-service calls
- Distributed tracing (OpenTelemetry)

---

## 4. Backward Compatibility Strategy

### 4.1 API Gateway Pattern

```
                    ┌─────────────────────────┐
                    │      API Gateway        │
                    │ (nginx + Node.js proxy) │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ Legacy Routes │      │  API v1       │      │  API v2       │
│ (PHP proxy)   │      │  (compat)     │      │  (JSON:API)   │
└───────────────┘      └───────────────┘      └───────────────┘
```

### 4.2 Request/Response Transformation

```javascript
// Legacy format transformer
class LegacyFormatTransformer {
  // Transform JSON_DATA format to modern format
  transformRequest(legacyParams) {
    if (legacyParams.JSON_DATA) {
      return this.parseJSONData(legacyParams.JSON_DATA);
    }
    if (legacyParams.JSON_KV) {
      return this.parseJSONKV(legacyParams.JSON_KV);
    }
    // ... other formats
  }

  // Transform modern response to legacy format
  transformResponse(modernResponse, format) {
    switch (format) {
      case 'JSON_DATA':
        return this.toJSONData(modernResponse);
      case 'JSON_KV':
        return this.toJSONKV(modernResponse);
      default:
        return modernResponse;
    }
  }
}
```

### 4.3 Database Compatibility

- Keep existing table structure
- Add new columns with defaults (not required)
- Use views for backward-compatible queries
- Implement dual-write during transition

### 4.4 Endpoint Versioning

```
/api/v1/...          # Legacy compatibility (maps to old behavior)
/api/v2/...          # New JSON:API format (already exists)
/{db}/...            # Legacy PHP routes (proxied)
```

---

## 5. Testing Strategy

### 5.1 Test Categories

1. **Contract Tests**: Verify API compatibility
2. **Integration Tests**: Test service interactions
3. **Migration Tests**: Verify data integrity during migration
4. **Performance Tests**: Ensure no degradation

### 5.2 Backward Compatibility Test Suite

```javascript
// Example contract test
describe('Legacy API Compatibility', () => {
  it('should handle JSON_DATA format exactly as PHP did', async () => {
    const legacyRequest = {
      JSON_DATA: '[["val","name"],["val","email"]]',
      // ... other legacy params
    };

    const response = await request(app).post('/test/object/18').send(legacyRequest);

    // Compare with known PHP output
    expect(response.body).toMatchSnapshot('legacy_json_data_response');
  });
});
```

### 5.3 Shadow Testing

Run new services in parallel with legacy PHP, compare outputs:

```javascript
async function shadowTest(request) {
  const [legacyResult, newResult] = await Promise.all([
    callLegacyPHP(request),
    callNewService(request)
  ]);

  if (!deepEqual(legacyResult, newResult)) {
    logDiscrepancy(request, legacyResult, newResult);
  }

  return legacyResult; // Return legacy result during testing
}
```

---

## 6. Deployment Strategy

### 6.1 Feature Flags

```javascript
// Feature flag for gradual rollout
const config = {
  useNewAuthService: process.env.NEW_AUTH_SERVICE === 'true',
  useNewDataService: process.env.NEW_DATA_SERVICE === 'true',
  // ... other flags
};

// Usage
if (config.useNewAuthService) {
  return newAuthService.authenticate(req);
} else {
  return legacyAuthHandler(req);
}
```

### 6.2 Canary Deployment

1. Deploy new service
2. Route 5% traffic to new service
3. Monitor errors and latency
4. Gradually increase to 100%
5. Keep legacy code for rollback

### 6.3 Rollback Plan

Each phase has automatic rollback:
- Feature flag revert (instant)
- Container revert (< 1 minute)
- Database rollback scripts (prepared)

---

## 7. Monitoring and Observability

### 7.1 Metrics to Track

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `api_response_time_ms` | Response latency | > 500ms |
| `api_error_rate` | Error percentage | > 1% |
| `service_availability` | Uptime | < 99.9% |
| `compatibility_mismatches` | Format discrepancies | > 0 |

### 7.2 Logging Standards

```javascript
// Structured logging for debugging
logger.info('Request processed', {
  service: 'core-data',
  method: 'createObject',
  database: 'my',
  objectType: 18,
  legacyFormat: 'JSON_DATA',
  duration: 45,
  compatibility: 'verified'
});
```

### 7.3 Distributed Tracing

Each request gets a trace ID that follows through all services:

```
X-Request-ID: req_1234567890_abc123
X-Trace-ID: trace_1234567890
```

---

## 8. Timeline and Milestones

| Phase | Duration | Milestone |
|-------|----------|-----------|
| Phase 1: Foundation | Weeks 1-3 | Shared libraries ready |
| Phase 2: Auth Service | Weeks 4-7 | Auth service live with compatibility |
| Phase 3: Core Data | Weeks 8-13 | CRUD operations migrated |
| Phase 4: Reporting | Weeks 14-16 | Reports migrated |
| Phase 5: File Service | Weeks 17-18 | Files migrated |
| Phase 6: Service Mesh | Weeks 19-21 | Full observability |
| **Total** | **~21 weeks** | **Full componentization** |

---

## 9. Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data loss during migration | High | Low | Dual-write, backups, rollback scripts |
| API incompatibility | High | Medium | Extensive contract tests, shadow testing |
| Performance degradation | Medium | Medium | Load testing, caching layer |
| Team knowledge gaps | Medium | Low | Documentation, pair programming |
| External dependencies | Low | Low | Abstractions, fallbacks |

---

## 10. Success Criteria

### 10.1 Technical Criteria
- [ ] All existing API endpoints return identical responses
- [ ] Response times within 10% of current performance
- [ ] Zero data loss during migration
- [ ] 99.9% uptime maintained throughout

### 10.2 Business Criteria
- [ ] No client-side changes required
- [ ] Existing integrations continue working
- [ ] New API v2 available for new clients
- [ ] Reduced time-to-market for new features

---

## 11. Next Steps

### Immediate Actions (Week 1)
1. Set up monorepo structure with Lerna/Nx
2. Create `@integram/common` package with types
3. Implement logging infrastructure
4. Create initial contract test suite

### Short-term (Weeks 2-4)
1. Start authentication service extraction
2. Set up CI/CD for new packages
3. Implement feature flag system
4. Create compatibility layer framework

### Medium-term (Weeks 5-12)
1. Complete auth service migration
2. Begin core data service extraction
3. Implement shadow testing
4. Gradual traffic migration

---

## Appendix A: Function Mapping

### index.php Function → New Service Mapping

| PHP Function | Target Service | Target Module |
|--------------|---------------|---------------|
| `Validate_Token()` | auth-service | TokenService |
| `authJWT()` | auth-service | JWTService |
| `login()` | auth-service | AuthController |
| `Check_Grant()` | auth-service | PermissionService |
| `Exec_sql()` | core-data | QueryService |
| `Insert()` | core-data | ObjectService |
| `Update_Val()` | core-data | ObjectService |
| `Delete()` | core-data | ObjectService |
| `Compile_Report()` | reporting | ReportCompiler |
| `mysendmail()` | notifications | EmailService |
| `Get_file()` | file-service | FileService |

---

## Appendix B: API Compatibility Examples

### Example 1: User Registration

**Legacy Request:**
```http
POST /my/register HTTP/1.1
Content-Type: application/x-www-form-urlencoded

email=user@example.com&regpwd=password123&regpwd1=password123&agree=1
```

**New Service Internal:**
```javascript
authService.register({
  email: 'user@example.com',
  password: 'password123',
  termsAccepted: true
});
```

**Response (identical to legacy):**
```html
<!-- Same HTML/redirect behavior as before -->
```

### Example 2: Object Query

**Legacy Request:**
```http
GET /test/object/18?JSON_DATA=1&filter=val%3Dactive HTTP/1.1
```

**New Service Internal:**
```javascript
coreDataService.query({
  database: 'test',
  type: 18,
  filters: [{ field: 'val', operator: '=', value: 'active' }]
});
```

**Response (identical format):**
```json
[["id","val","up","t","ord"],["1","active","0","18","1"]]
```

---

## Document Information

**Version:** 1.0
**Last Updated:** February 2026
**Author:** AI Issue Solver
**Related Issue:** [#119](https://github.com/unidel2035/integram-standalone/issues/119)
**Pull Request:** [#120](https://github.com/unidel2035/integram-standalone/pull/120)
