# Legacy PHP API Compatibility Report

> **Session**: Full audit, implementation & test site — February 2026
> **Branch**: `issue-65-c78c49fee862`

---

## Summary

This session completed the remaining ~15% of the Node.js `legacy-compat.js` drop-in replacement for `integram-server/index.php`.

| Category | Status Before | Status After |
|----------|--------------|--------------|
| Auth (login / 2FA / secret) | ✅ Complete | ✅ Complete |
| XSRF generation | ✅ Complete | ✅ Complete |
| Object CRUD (_m_new / _m_save / _m_del / _m_set / _m_move) | ✅ Complete | ✅ Complete |
| **_m_id (rename object ID)** | ❌ Stub only | ✅ **Implemented** |
| **File upload in _m_new** | ❌ Missing multer | ✅ **Fixed** |
| **PASSWORD hash edge case in _m_save** | ❌ Always used DB value | ✅ **Fixed** |
| Type DDL (_d_new / _d_save / _d_del / _d_req / _d_attrs etc.) | ✅ Complete | ✅ Complete |
| Metadata / obj_meta / _ref_reqs | ✅ Complete | ✅ Complete |
| **backup (.dmp)** | ⚠️ Raw dmp, no ZIP | ✅ **ZIP wrapper added** |
| **csv_all** | ⚠️ Raw CSV, no ZIP | ✅ **ZIP wrapper added** |
| restore | ✅ SQL generation | ✅ Unchanged |
| **_new_db** | ✅ Complete | ✅ Unchanged |
| Grants / check_grant | ✅ Complete | ✅ Complete |
| File upload / download / dir_admin | ✅ Complete | ✅ Complete |
| JWT / confirm | ✅ Complete | ✅ Complete |

---

## Changes Made This Session

### P0 — `_m_id`: Full implementation
**File**: `legacy-compat.js` ~line 3493

Replaced stub that returned an error. Now:
1. Validates `new_id` is a positive integer
2. Checks old object exists and retrieves its parent `up`
3. Checks `new_id` is not already in use
4. Runs 3 SQL UPDATEs (PHP-identical):
   - `UPDATE SET id = newId WHERE id = oldId`
   - `UPDATE SET up = newId WHERE up = oldId`
   - `UPDATE SET t  = newId WHERE t  = oldId`
5. Returns `{id: newId, obj: newId, next_act: "object", args: "F_U=<up>", warnings: ""}` per `api_dump()` format

### P1 — backup / csv_all: ZIP wrapping
**File**: `legacy-compat.js`

Added a minimal ZIP builder using only Node.js built-in `zlib` (no external dependencies):
- `buildZip(entryName, content)` — builds a valid ZIP binary with a single deflated entry
- `crc32(buf)` — standard CRC-32 lookup-table implementation

`backup`: Now returns `${db}_TIMESTAMP.dmp.zip` with `Content-Type: application/zip`
`csv_all`: Now returns `${db}_TIMESTAMP.csv.zip` with `Content-Type: application/zip`

### P3 — File upload in `_m_new`
**File**: `legacy-compat.js` ~line 1659

- Excluded `/_m_new/` from the global `upload.none()` middleware
- Added per-route `upload.any()` middleware to accept file uploads
- For FILE-type requisites: writes uploaded file to `download/{db}/` via `fs.writeFileSync`
- Falls back to text value if no file uploaded for that field

### P4 — PASSWORD hash edge case in `_m_save`
**File**: `legacy-compat.js` ~line 1882

When saving a `PASSWORD`-type requisite (type 20):
1. First checks `t{USER_TYPE_ID}` in POST body for the username
2. Falls back to reading the current object's `val` from DB (the user object's name)
3. Hashes via `phpCompatibleHash(username, plaintext, db)` before storing

---

## Test Results

```
src/api/routes/__tests__/legacy-compat.test.js   17 passed
src/api/routes/__tests__/email-auth.register-direct.test.js  18 passed
─────────────────────────────────────────────────────────────
Total: 35 passed
```

### Test coverage (legacy-compat.test.js — 17 tests)

| Route | Test |
|-------|------|
| `POST /:db/auth` | valid creds, wrong creds, user not found |
| `GET /:db/xsrf` | valid token cookie, no cookie |
| `GET /:db/terms` | authenticated, returns type list |
| `GET /:db/metadata/:id` | returns metadata with reqs array |
| `POST /:db/_m_new/:up` | creates object, error on missing type |
| `POST /:db/_m_save/:id` | saves + updates requisite |
| `POST /:db/_m_del/:id` | deletes, returns api_dump format |
| `POST /:db/_m_id/:id` | renames ID, duplicate check, missing param |
| `POST /:db/_d_new` | creates type |
| `GET /:db/backup` | ZIP content-type, redirect without auth |

---

## New Files

| File | Purpose |
|------|---------|
| `backend/monolith/src/api/routes/__tests__/legacy-compat.test.js` | Vitest test suite (17 tests) |
| `backend/monolith/public/legacy-test.html` | Manual test HTML client |

### Manual Test Client (`/legacy-test.html`)

Accessible at `http://localhost:8081/legacy-test.html`:
- **Auth panel** — DB + login + password → POST /:db/auth?JSON → shows token/xsrf in session bar
- **XSRF panel** — GET /:db/xsrf refresh button
- **Terms panel** — GET /:db/terms → renders type table
- **Metadata panel** — type ID input → GET /:db/metadata/:id → renders reqs table
- **CRUD panel** — _m_new, _m_save, _m_del, _m_id forms
- **Backup panel** — download .dmp.zip and .csv.zip
- **Request log** — last 20 requests with method, URL, status, timing
- Auto-attaches XSRF header on all POST requests

---

## Known Remaining Limitations

| Feature | Status | Notes |
|---------|--------|-------|
| `_ref_reqs` dynamic formula evaluation | ⚠️ Skipped | PHP evaluates `attrs` block name for dynamic dropdown data. Complex, edge case. |
| `restore` accepts file upload (not just POST body) | ⚠️ Partial | Currently reads dump from POST body only; PHP reads from filesystem path |
| Session isolation per-tab | ⚠️ N/A | Single `pool` variable; acceptable for compatibility layer |
| `_m_save` copy operation — file requisites | ⚠️ Not copied | File requisites are not physically copied when `copybtn` is set |

---

## PHP → Node.js Action Mapping (Full)

| PHP Action / URL | Node.js Route | Status |
|-----------------|---------------|--------|
| `POST /:db/auth` | `router.post('/:db/auth', ...)` | ✅ |
| `GET /:db/xsrf` | `router.get('/:db/xsrf', ...)` | ✅ |
| `GET /:db/validate` | `router.get('/:db/validate', ...)` | ✅ |
| `POST /:db/getcode` | `router.post('/:db/getcode', ...)` | ✅ |
| `POST /:db/checkcode` | `router.post('/:db/checkcode', ...)` | ✅ |
| `GET /:db/exit` | `router.all('/:db/exit', ...)` | ✅ |
| `GET /:db/terms` | `router.get('/:db/terms', ...)` | ✅ |
| `GET /:db/metadata/:id` | `router.all('/:db/metadata/:typeId?', ...)` | ✅ |
| `GET /:db/obj_meta/:id` | `router.all('/:db/obj_meta/:id', ...)` | ✅ |
| `POST /:db/_m_new/:up` | `router.post('/:db/_m_new/:up?', ...)` | ✅ **+ file upload** |
| `POST /:db/_m_save/:id` | `router.post('/:db/_m_save/:id', ...)` | ✅ **+ password fix** |
| `POST /:db/_m_del/:id` | `router.post('/:db/_m_del/:id', ...)` | ✅ |
| `POST /:db/_m_set/:id` | `router.post('/:db/_m_set/:id', ...)` | ✅ |
| `POST /:db/_m_move/:id` | `router.post('/:db/_m_move/:id', ...)` | ✅ |
| `POST /:db/_m_id/:id` | `router.post('/:db/_m_id/:id', ...)` | ✅ **Newly implemented** |
| `POST /:db/_m_up/:id` | `router.post('/:db/_m_up/:id', ...)` | ✅ |
| `POST /:db/_m_ord/:id` | `router.post('/:db/_m_ord/:id', ...)` | ✅ |
| `POST /:db/_d_new` | `router.post('/:db/_d_new/:parentTypeId?', ...)` | ✅ |
| `POST /:db/_d_save/:id` | `router.post('/:db/_d_save/:typeId', ...)` | ✅ |
| `POST /:db/_d_del/:id` | `router.post('/:db/_d_del/:typeId', ...)` | ✅ |
| `POST /:db/_d_req/:id` | `router.post('/:db/_d_req/:typeId', ...)` | ✅ |
| `POST /:db/_d_alias/:id` | `router.post('/:db/_d_alias/:reqId', ...)` | ✅ |
| `POST /:db/_d_null/:id` | `router.post('/:db/_d_null/:reqId', ...)` | ✅ |
| `POST /:db/_d_multi/:id` | `router.post('/:db/_d_multi/:reqId', ...)` | ✅ |
| `POST /:db/_d_attrs/:id` | `router.post('/:db/_d_attrs/:reqId', ...)` | ✅ |
| `POST /:db/_d_up/:id` | `router.post('/:db/_d_up/:reqId', ...)` | ✅ |
| `POST /:db/_d_ord/:id` | `router.post('/:db/_d_ord/:reqId', ...)` | ✅ |
| `POST /:db/_d_del_req/:id` | `router.post('/:db/_d_del_req/:reqId', ...)` | ✅ |
| `POST /:db/_d_ref/:id` | `router.post('/:db/_d_ref/:parentTypeId', ...)` | ✅ |
| `GET /:db/_ref_reqs/:id` | `router.get('/:db/_ref_reqs/:refId', ...)` | ⚠️ Static only |
| `GET /:db/_dict/:id` | `router.all('/:db/_dict/:typeId?', ...)` | ✅ |
| `GET /:db/_list/:id` | `router.all('/:db/_list/:typeId', ...)` | ✅ |
| `GET /:db/_list_join/:id` | `router.all('/:db/_list_join/:typeId', ...)` | ✅ |
| `GET /:db/_d_main/:id` | `router.all('/:db/_d_main/:typeId', ...)` | ✅ |
| `GET /:db/backup` | `router.get('/:db/backup', ...)` | ✅ **ZIP** |
| `GET /:db/csv_all` | `router.get('/:db/csv_all', ...)` | ✅ **ZIP** |
| `POST /:db/restore` | `router.post('/:db/restore', ...)` | ✅ |
| `POST /my/_new_db` | `router.all('/my/_new_db', ...)` | ✅ |
| `POST /:db/upload` | `router.post('/:db/upload', ...)` | ✅ |
| `GET /:db/download/:file` | `router.get('/:db/download/:filename', ...)` | ✅ |
| `GET /:db/dir_admin` | `router.get('/:db/dir_admin', ...)` | ✅ |
| `GET /:db/check_grant` | `router.get('/:db/check_grant', ...)` | ✅ |
| `GET /:db/_connect` | `router.all('/:db/_connect', ...)` | ✅ |
| `POST /:db/jwt` | `router.post('/:db/jwt', ...)` | ✅ |
| `POST /:db/confirm` | `router.post('/:db/confirm', ...)` | ✅ |
| `POST /my/register` | `router.post('/my/register', ...)` | ✅ |
