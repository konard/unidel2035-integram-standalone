# Legacy PHP→Node.js Re-Audit Plan

> **Branch**: `issue-65-c78c49fee862`
> **Date**: 2026-02-21 (updated)
> **Scope**: Full parity check — endpoints, request params, response formats, data model, edge cases

## Status Summary (2026-02-21, updated session 7)

### Session 7 Fixes (_d_ref id/obj swap)

| Endpoint | Bug Fixed | Details |
|---|---|---|
| `POST /:db/_d_ref/:parentTypeId` | `id: newRefId, obj: parentId` → `id: parentId, obj: newRefId` | PHP: `$id` stays as original type id; `$obj = Insert()` result (new ref row id) |
| `_d_new` ⚠️ → ✅ | Verified correct — `id: parentId, obj: newTypeId` | PHP: `$id` stays as original req id; `$obj = Insert()` result |
| `_d_ref` ⚠️ → ✅ | Fixed id/obj swap | See above |

### Session 6 Fixes (DDL api_dump args + id/obj from PHP source)

| Endpoint | Bug Fixed | Details |
|---|---|---|
| All `_d_*` endpoints (11 handlers) | `args: ""` → `args: "ext"` | PHP always appends "ext" for all DDL actions (line 9176) |
| `POST /:db/_d_del/:id` | `next_act: "terms"` → `"edit_types"`, `obj: 0` → `null` | PHP: next_act defaults to "edit_types"; $obj not set → null |
| `POST /:db/_d_up/:id` | `id: reqId` → `id: parentId` | PHP: `$id = $row["up"]` (parent), `$obj = $id` (also parent) |
| `POST /:db/_d_ord/:id` | `id: reqId` → `id: parentId` | PHP: `$id = $row["up"]` (parent), `$obj = $id` (also parent) |

### Session 5 Fixes (DML api_dump args fields — from PHP source audit)

### Session 5 Fixes (DML api_dump args fields — from PHP source audit)

| Endpoint | Bug Fixed | Details |
|---|---|---|
| `POST /:db/_m_new/:up` | args for hasReqs was `String(id)` → `"new1=1&"` | PHP: `$arg = "new1=1&$arg"` prefix; condition parentId !== 1 (not > 1) |
| `POST /:db/_m_save/:id` | args missing `"saved1=1&"` prefix; F_U conditional | PHP: `$arg = "saved1=1&F_U=$up&F_I=$id"` always; `"copied1=1&..."` for copy |
| `POST /:db/_m_move/:id` | args missing `"moved&"` prefix | PHP: `$arg = "moved&"` always; `"moved&&F_U=$up"` if newParent != 1 |
| `POST /:db/_m_up/:id` | args conditional on `> 1` | PHP: `$arg = "F_U=$up"` always (unconditional) |
| `POST /:db/_m_del/:id` | args included F_U for all `up > 1` | PHP: F_U only for array elements (`tup === "0"`), not references |

### Session 4 Fixes (DML api_dump id/obj fields — systematic fix)

| Endpoint | Bug Fixed | Details |
|---|---|---|
| `POST /:db/_m_new/:up` | `obj: typeId` → `obj: objectId` | PHP die(): id=obj=new objectId |
| `POST /:db/_m_save/:id` | `id: objectId, obj: typeId` → **swapped** + args gets F_I= | PHP: `$obj=$id; $id=$typ;` → id=typeId, obj=objectId, args=F_U=up&F_I=obj |
| `POST /:db/_m_set/:id` | `id: objectId, obj: typeId` → **swapped** | Same pattern as _m_save |
| `POST /:db/_m_move/:id` | `obj: newParentId` → `obj: null` | PHP keeps `$obj=null` for move |
| `POST /:db/_m_up/:id` | `id: objectId, obj: parentId` → `id: obj.t, obj: null` | PHP: `$id=$row["t"]` (typeId), `$obj` stays null |
| `POST /:db/_m_ord/:id` | `id: objectId` → `id: parentId` | PHP: `$id=$row["up"]` (parent), `$obj=$id` (also parent) |

### Session 3 Fixes

| Endpoint | Bug Fixed | Details |
|---|---|---|
| `GET /:db/report/:id?JSON` | SubPage handler intercepted before report API route | Added `next()` pass-through in SubPage for `page=report && subId && isApiRequest` |
| `GET/POST /:db/_connect/:id` | Route had no `:id` param; 404 for all ID requests | Changed to `/:db/_connect/:id?`; proxies to CONNECT requisite URL |
| `POST /:db/restore` | `ord=0` parsed as `1` (`parseInt("0") \|\| 1 = 1`) | Fixed: `const ordVal = parseInt(..., 10); ord = isNaN(ordVal) ? 1 : ordVal` |
| `POST /:db?JSON action=report` | Second POST /:db handler (main page) consumed all auth'd requests | Added `if (action === 'report') return next()` before main-page logic |

### Session 2 Fixes (xsrf / terms / metadata / obj_meta — all now 0 diffs)

| Endpoint | Bug Fixed | Details |
|---|---|---|
| `GET /:db/xsrf` | `role` returned empty; `id` as number | Added CROSS JOIN to resolve role definition name; `id: String(uid)` |
| `GET /:db/terms` | Wrong insertion order; extra `href`/`ord` fields | Changed `typ`/`base` to `Map`, `reqMap` to `Set` for PHP-compatible order; removed extra fields |
| `GET /:db/metadata` (all types) | 434 vs 158 items — missing req-only type filter | Two-pass `usedAsReqType` Set to skip types with no own reqs used as req.t |
| `GET /:db/metadata/:id` | `type:"0"` became `type:""` (falsy check on 0) | Changed `row.base_typ ?` → `row.base_typ != null ?` |
| `GET /:db/metadata` (attrs/val) | `\\u041e` vs `\u041e` — DB stores literal `\uXXXX` | Added `decodeJsonEscapes()` applied to `obj.val` and `req.attrs` (NOT `req_val`) |
| `GET /:db/obj_meta/:id` | Completely wrong format (keyed by req.t, no val/type) | Full rewrite: keyed by `req.ord` with `{id, val, type, arr_id?, ref?, ref_id?, attrs?}` |

### Session 3 Fixes

| Endpoint | Bug Fixed | Details |
|---|---|---|
| `GET /:db/report/:id?JSON` | SubPage handler intercepted before report API route | Added `next()` pass-through in SubPage for `page=report && subId && isApiRequest` |
| `GET/POST /:db/_connect/:id` | Route had no `:id` param; 404 for all ID requests | Changed to `/:db/_connect/:id?`; proxies to CONNECT requisite URL |
| `POST /:db/restore` | `ord=0` parsed as `1` (`parseInt("0") \|\| 1 = 1`) | Fixed: `const ordVal = parseInt(..., 10); ord = isNaN(ordVal) ? 1 : ordVal` |
| `POST /:db?JSON action=report` | Second POST /:db handler (main page) consumed all auth'd requests | Added `if (action === 'report') return next()` before main-page logic |

### ?JSON Subpage Endpoints — All verified at 0 diffs vs PHP

| Endpoint | Status | Notes |
|---|---|---|
| `GET /:db/object/:id?JSON` | ✅ 0 diffs | Full edit_obj response with myrolemenu |
| `GET /:db/dict?JSON` | ✅ 0 diffs | Flat {id: htmlEsc(val)} for independent types |
| `GET /:db/sql?JSON` | ✅ 0 diffs | myrolemenu + &functions + &formats |
| `GET /:db/info?JSON` | ✅ 0 diffs | myrolemenu only |
| `GET /:db/upload?JSON` | ✅ 0 diffs | myrolemenu only |
| `GET /:db/form?JSON` | ✅ 0 diffs | myrolemenu + edit_types (with PHP block artifacts) + types + editable |
| `GET /:db/table?JSON` | ✅ 0 diffs | myrolemenu only |
| `GET /:db/table/:id?JSON` | ✅ 0 diffs | myrolemenu only |
| `GET /:db/smartq?JSON` | ✅ 0 diffs | myrolemenu only |
| `GET /:db/types?JSON` | ✅ 0 diffs | myrolemenu only (no types.html in PHP → falls back to info.html) |
| `GET /:db/edit_types?JSON` | ✅ 0 diffs | Full: myrolemenu + &main.a.&types (PHP order) + &main.a.&editables + edit_types + types + editable |
| `GET /:db/report?JSON` | ⚠️ PHP SQL error | PHP broken for this; Node.js returns `{error}` |
| `GET /:db/report/:id?JSON` | ✅ fixed session 3 | Now passes to report API route (SubPage handler routes to next()) |

**Key implementation findings:**
- PHP `$blocks[$block]` stores `PARENT`, `CONTENT` (template text), AND numeric+named column aliases from `mysqli_fetch_array` — all must be reproduced
- `form.html` and `edit_types.html` have different `&Edit_Typs` block CONTENT strings
- PHP `$GLOBALS["basics"]` insertion order: 3,8,9,13,14,11,12,4,10,2,7,6,5,15,16,17 (must be hardcoded array)
- `action=types` falls back to `info.html` (no `types.html`), returning only myrolemenu
- `sql` block IDs must be strings (PHP block builder quirk)
- `getMenuForToken()` shared helper extracted for all subpage JSON handlers
- `report/:id?JSON` — SubPage handler must call `next()` for report with subId+JSON to reach report API route

---

## 1. Endpoints Coverage

### ✅ Auth Endpoints

| PHP Action | Node.js Route | Status | Notes |
|------------|--------------|--------|-------|
| `POST /:db/auth` (password) | `router.post('/:db/auth')` | ✅ | Password hash, token/xsrf create, cookie set |
| `POST /:db/auth?reset` | Same route, `?reset` branch | ✅ | Login lookup only; no actual email/SMS |
| `GET /:db/auth` (secret) | `router.all('/:db/auth')` GET branch | ✅ | secret→xsrf flow |
| `GET /:db/xsrf` | `router.all('/:db/xsrf')` | ✅ | Returns full session row |
| `GET /:db/validate` | `router.get('/:db/validate')` | ✅ | Token validation |
| `POST /:db/getcode` | `router.post('/:db/getcode')` | ⚠️ | Returns `{msg:'ok'}` — no real email send |
| `POST /:db/checkcode` | `router.post('/:db/checkcode')` | ⚠️ | OTP verify but no code generation |
| `POST /my/register` | `router.post('/my/register')` | ⚠️ | Mock only; no DB insertion |
| `GET /:db/exit` | `router.all('/:db/exit')` | ✅ | Deletes token, clears cookie |
| `POST /:db/jwt` | `router.post('/:db/jwt')` | ✅ | JWT exchange |
| `POST /:db/confirm` | `router.post('/:db/confirm')` | ✅ | Password confirmation |

### ✅ Object DML Endpoints

| PHP Action | Node.js Route | Status | Notes |
|------------|--------------|--------|-------|
| `POST /:db/_m_new/:up` | `router.post('/:db/_m_new/:up?', upload.any(), ...)` | ✅ | File upload, requisite insert |
| `POST /:db/_m_save/:id` | `router.post('/:db/_m_save/:id')` | ✅ | PASSWORD hash fixed |
| `POST /:db/_m_del/:id` | `router.post('/:db/_m_del/:id')` | ✅ | Cascade delete |
| `POST /:db/_m_set/:id` | `router.post('/:db/_m_set/:id')` | ✅ | Batch attribute set |
| `POST /:db/_m_move/:id` | `router.post('/:db/_m_move/:id')` | ✅ | Move with next-order |
| `POST /:db/_m_up/:id` | `router.post('/:db/_m_up/:id')` | ✅ | Swap with previous sibling |
| `POST /:db/_m_ord/:id` | `router.post('/:db/_m_ord/:id')` | ✅ | Set explicit ord value |
| `POST /:db/_m_id/:id` | `router.post('/:db/_m_id/:id')` | ✅ | 3-table id rename |

### ✅ Type DDL Endpoints

| PHP Action | Node.js Route | Status | Notes |
|------------|--------------|--------|-------|
| `POST /:db/_d_new` | `router.post('/:db/_d_new/:parentTypeId?')` | ✅ | |
| `POST /:db/_d_save/:id` | `router.post('/:db/_d_save/:typeId')` | ✅ | |
| `POST /:db/_d_del/:id` | `router.post('/:db/_d_del/:typeId')` | ✅ | |
| `POST /:db/_d_req/:id` | `router.post('/:db/_d_req/:typeId')` | ✅ | Builds modifier string |
| `POST /:db/_d_alias/:id` | `router.post('/:db/_d_alias/:reqId')` | ✅ | |
| `POST /:db/_d_null/:id` | `router.post('/:db/_d_null/:reqId')` | ✅ | Toggle `:!NULL:` |
| `POST /:db/_d_multi/:id` | `router.post('/:db/_d_multi/:reqId')` | ✅ | Toggle `:MULTI:` |
| `POST /:db/_d_attrs/:id` | `router.post('/:db/_d_attrs/:reqId')` | ✅ | Combined modifier update |
| `POST /:db/_d_up/:id` | `router.post('/:db/_d_up/:reqId')` | ✅ | Swap with previous sibling |
| `POST /:db/_d_ord/:id` | `router.post('/:db/_d_ord/:reqId')` | ✅ | Set explicit ord |
| `POST /:db/_d_del_req/:id` | `router.post('/:db/_d_del_req/:reqId')` | ✅ | |
| `POST /:db/_d_ref/:id` | `router.post('/:db/_d_ref/:parentTypeId')` | ✅ | Reference column |

### ✅ Query/Listing Endpoints

| PHP Action | Node.js Route | Status | Notes |
|------------|--------------|--------|-------|
| `GET /:db/terms` | `router.get('/:db/terms')` | ✅ | Grant-filtered |
| `GET /:db/metadata/:id` | `router.all('/:db/metadata/:typeId?')` | ✅ | |
| `GET /:db/obj_meta/:id` | `router.all('/:db/obj_meta/:id')` | ✅ | |
| `GET /:db/_list/:id` | `router.all('/:db/_list/:typeId')` | ✅ | Paginated |
| `GET /:db/_list_join/:id` | `router.all('/:db/_list_join/:typeId')` | ✅ | Multi-join |
| `GET /:db/_dict/:id` | `router.all('/:db/_dict/:typeId?')` | ✅ | |
| `GET /:db/_d_main/:id` | `router.all('/:db/_d_main/:typeId')` | ✅ | Full type editor data |
| `GET /:db/_ref_reqs/:id` | `router.get('/:db/_ref_reqs/:refId')` | ⚠️ | Static data only; PHP evaluates dynamic `attrs` formula |
| `GET /:db/_connect` | `router.all('/:db/_connect')` | ✅ | DB ping (no id) |
| `GET /:db/_connect/:id` | `router.all('/:db/_connect/:id?')` | ✅ fixed session 3 | Fetches CONNECT requisite URL and proxies request |

### ✅ Report Endpoints

| PHP Action | Node.js Route | Status | Notes |
|------------|--------------|--------|-------|
| `GET /:db/report` | `router.all('/:db/report/:reportId?')` | ✅ | List all reports |
| `GET /:db/report/:id` | Same | ✅ | Report definition (columns, types) |
| `GET /:db/report/:id?execute=1` | Same | ✅ | Full LEFT JOIN execution |
| `POST /:db action=report` | `router.post('/:db')` | ✅ | Same execute logic |

### ✅ Export/Backup Endpoints

| PHP Action | Node.js Route | Status | Notes |
|------------|--------------|--------|-------|
| `GET /:db/export/:typeId` | `router.get('/:db/export/:typeId')` | ✅ | CSV or JSON |
| `GET /:db/csv_all` | `router.get('/:db/csv_all')` | ✅ | ZIP wrapped |
| `GET /:db/backup` | `router.get('/:db/backup')` | ✅ | ZIP wrapped, delta-base36 |
| `POST /:db/restore` | `router.post('/:db/restore')` | ✅ | Fully implemented: INSERT IGNORE in batches of 1000 |

### ✅ File / Admin Endpoints

| PHP Action | Node.js Route | Status | Notes |
|------------|--------------|--------|-------|
| `POST /:db/upload` | `router.post('/:db/upload')` | ✅ | Extension whitelist |
| `GET /:db/download/:file` | `router.get('/:db/download/:filename')` | ✅ | safePath protected |
| `GET /:db/dir_admin` | `router.get('/:db/dir_admin')` | ✅ | Listing + download |
| `POST /my/_new_db` | `router.all('/my/_new_db')` | ✅ | CREATE TABLE + schema init |
| `GET /:db/grants` | `router.get('/:db/grants')` | ✅ | Role-based grants object |
| `POST /:db/check_grant` | `router.post('/:db/check_grant')` | ✅ | READ/WRITE check |

---

## 2. Response Format Parity

### 2.1 api_dump() (DML/DDL responses)

**PHP Reference:**
```php
function api_dump($id, $obj, $next_act, $args='', $warnings='') {
  return json_encode(['id'=>$id, 'obj'=>$obj, 'next_act'=>$next_act, 'args'=>$args, 'warnings'=>$warnings]);
}
```

| Action family | `id` | `obj` | `next_act` | `args` | Status |
|---|---|---|---|---|---|
| `_m_new` | new objectId | new objectId (= id) | `edit_obj` (has reqs) or `object` | `"new1=1&"` (edit_obj) or `"F_U=<up>"` if up!=1 | ✅ fixed s4+s5 |
| `_m_save` | **type id** | **object id** | `object` | `"saved1=1&F_U=<up>&F_I=<obj>"` always | ✅ fixed s4+s5 |
| `_m_save` (copy) | **type id** | **object id** | `object` | `"copied1=1&F_U=<up>&F_I=<obj>"` always | ✅ fixed s4+s5 |
| `_m_del` | type id | deleted objectId | `object` | `"F_U=<up>"` only for array elements; `""` for refs | ✅ fixed s5 |
| `_m_set` | `""` (or req id) | object id | (uses `"a"` field in PHP) | `""` or file path | ⚠️ partial |
| `_m_move` | object id | **null** | `object` | `"moved&"` or `"moved&&F_U=<up>"` if up!=1 | ✅ fixed s4+s5 |
| `_m_up` | **type id** (obj.t) | **null** | `object` | `"F_U=<parent>"` always | ✅ fixed s4+s5 |
| `_m_ord` | **parent id** | **parent id** | `object` | `"F_U=<parent>"` if parent>1 | ✅ fixed s4 |
| `_m_id` | new_id | new_id | `object` | `"F_U=<up>"` if up>1 | ✅ |
| `_d_new` | parent id (from req) | new type id | `edit_types` | `"ext"` | ✅ verified s7 |
| `_d_save` | type id | type id | `edit_types` | `"ext"` | ✅ fixed s6 |
| `_d_del` | typeId (original) | null | `edit_types` | `"ext"` | ✅ fixed s6 |
| `_d_up` | parent id | parent id | `edit_types` | `"ext"` | ✅ fixed s6 |
| `_d_ord` | parent id | parent id | `edit_types` | `"ext"` | ✅ fixed s6 |
| `_d_req/_d_alias/_d_null/_d_multi/_d_attrs` | req id | type id | `edit_types` | `"ext"` | ✅ fixed s6 |
| `_d_del_req` | type id | type id | `edit_types` | `"ext"` | ✅ fixed s6 |
| `_d_ref` | **parent id** (type id) | **new ref id** | `edit_types` | `"ext"` | ✅ fixed s7 |

### 2.2 Auth Responses

| Route | Expected PHP Fields | Node.js Fields | Status |
|---|---|---|---|
| `POST /:db/auth` | `{_xsrf, token, id, msg}` | `{_xsrf, token, id, msg}` | ✅ |
| `GET /:db/auth` (secret) | `{_xsrf, token, id, msg}` | `{_xsrf, token, id, msg}` | ✅ |
| `GET /:db/xsrf` | `{_xsrf, token, user, role, id, msg}` | `{_xsrf, token, user, role, id, msg}` | ✅ |
| `GET /:db/validate` | `{success, valid, user: {id,login}, xsrf}` | Same | ✅ |
| `POST /:db/checkcode` | `{token, _xsrf}` | `{token, _xsrf}` | ✅ |

### 2.3 Metadata Responses

| Route | Expected format | Status |
|---|---|---|
| `GET /:db/metadata/:id` | `reqs[].orig` = raw modifier string, `reqs[].attrs` = parsed attrs block | ✅ (fixed in prior session) |
| `GET /:db/metadata` (all) | `{types:[{id,val,type,...,reqs:{ord:{id,val,type,...}}}]}` — req-only types filtered | ✅ (fixed session 2) |
| `GET /:db/obj_meta/:id` | `reqs` keyed by `ord`: `{id, val, type, arr_id?, ref?, ref_id?, attrs?}` | ✅ (fixed session 2) |
| `GET /:db/terms` | `[{id, type, name}]` in PHP array insertion order (alphabetical by name) | ✅ (fixed session 2) |
| `GET /:db/xsrf` | `{_xsrf, token, user, role (lowercase), id (string), msg}` | ✅ (fixed session 2) |

### 2.4 Report Responses

| Format Param | Expected Structure | Status |
|---|---|---|
| (default JSON) | `{columns:[...], data:[[col,val,...],], rownum}` | ✅ |
| `JSON_KV` | `[{colName:val,...},...]` | ✅ |
| `JSON_DATA` | `{colName:firstRowVal,...}` | ✅ |
| `JSON_CR` | `{columns:[...], rows:{idx:{colId:val}}, totalCount}` | ✅ |
| `JSON_HR` | Same as default but hierarchical parent support | ⚠️ Check |
| CSV (format=csv) | UTF-8 BOM + semicolon-delimited rows | ✅ |

### 2.5 _ref_reqs Response

| Expected | Status |
|---|---|
| `{id: "val / req1 / req2", ...}` keyed object (max 80) | ✅ (static — dynamic formula skipped) |

---

## 3. Known Gaps / Items to Verify

### 3.1 P0 — Critical

| # | Issue | Location | Action |
|---|---|---|---|
| 1 | `_ref_reqs` dynamic formula: PHP evaluates `attrs` block of the reference type to build a custom SQL query | `legacy-compat.js` ~4100 | Implement formula evaluator or document as out-of-scope |
| 2 | ~~`restore` reads from filesystem ZIP~~ | ~~restore route~~ | ✅ Already implemented: `backup_file` param reads from `download/$db/` dir |
| 3 | ~~`executeReport` — `REP_JOIN` (t=44) rows define extra JOINs~~ | ~~compileReport~~ | ✅ Already implemented: fetched from DB, LEFT JOIN rj{n} added to SQL |
| 4 | ~~`executeReport` — filter column alias~~ | ~~executeReport~~ | ✅ Already correct: keyed by `col.alias` matching `FR_{alias}` params |
| 5 | ~~`_m_save` REFERENCE requisite copy~~ | ~~_m_save~~ | ✅ Already implemented: FILE-type reqs physically copied on copybtn (line ~3306) |

### 3.2 P1 — Important

| # | Issue | Location | Action |
|---|---|---|---|
| 6 | `getcode` / `checkcode` / password reset: no real email/SMS | Auth routes | Document limitation; add stub config |
| 7 | `register` (`/my/register`): mock only, no real DB insert | register route | Implement or document |
| 8 | `backup` delta encoding: ORD field may not match PHP's compact format exactly | buildZip / backup | Test round-trip: backup → restore → compare |
| 9 | `terms` grant filter: `grant1Level` applies READ check but may not match PHP's exact `check_grant` recursion | terms route | Manual test with restricted role |
| 10 | ~~`_m_new` `next_act=edit_obj` condition~~ | ~~_m_new route~~ | ✅ Correct: `SELECT id WHERE up=typeId LIMIT 1` → hasReqs → edit_obj or object |

### 3.3 P2 — Minor / Edge Cases

| # | Issue | Location | Action |
|---|---|---|---|
| 11 | ~~`_d_attrs` modifier write~~ | ~~_d_attrs route~~ | ✅ Correct: `parseModifiers(current) + merge only provided fields + buildModifiers` |
| 12 | ~~`_m_up` / `_d_up` at-top no-op~~ | ~~_m_up, _d_up~~ | ✅ Already: returns `{id,obj,next_act:'object',args,warnings}` at top (JSON) |
| 13 | ~~`JSON_HR` report format~~ | ~~executeReport~~ | ✅ Already: `{columns, groups:{parentId:[rows]}, totalCount}` at line ~7589 |
| 14 | ~~`_list` `q` search~~ | ~~_list route~~ | ✅ Already: `WHERE a.val LIKE ? OR EXISTS (SELECT 1 FROM db req WHERE req.up=a.id AND req.val LIKE ?)` |
| 15 | `File type validation`: Node.js uses extension whitelist; PHP uses MIME type detection | upload route | Low priority — extension whitelist is secure enough |
| 16 | ~~`dir_admin` template mode (`download=0`)~~ | ~~dir_admin route~~ | ✅ Verified: path resolves to `integram-server/templates/custom/{db}` correctly |
| 17 | ~~`csv_all` val escaping~~ | ~~csv_all~~ | ✅ Already: `maskCsvDelimiters` escapes `;`→`\;`, `\n`→`\n`, `\r`→`\r` |
| 18 | ~~`backup` val escaping~~ | ~~backup/restore~~ | ✅ Already: backup encodes `\n`→`&ritrn;` `\r`→`&ritrr;`; restore decodes at line ~7343 |

---

## 4. Verification Test Matrix

Run these manual tests against a live server (`http://localhost:8081`) using `legacy-test.html`:

### Auth Flow
- [ ] Login with valid creds → get `token` + `_xsrf` in response
- [ ] Login with wrong pwd → get `msg` error, no token
- [ ] Login with secret → secret auth flow
- [ ] `GET /:db/xsrf` with cookie → returns `user`, `role`, `_xsrf`
- [ ] `GET /:db/validate` with bearer header → `{valid: true}`
- [ ] `GET /:db/exit` → cookie cleared

### Object CRUD
- [ ] `_m_new` type without reqs → `next_act=object`
- [ ] `_m_new` type with reqs → `next_act=edit_obj` + `args=new1=1&`
- [ ] `_m_new` with file field → file saved to `/download/{db}/`
- [ ] `_m_save` with PASSWORD type requisite → hash stored
- [ ] `_m_save` `copybtn` → new object created with incremented ord
- [ ] `_m_del` cascade=1 → children removed
- [ ] `_m_id` rename → objects referencing old id updated (up, t columns)
- [ ] `_m_move` → obj at new parent with next ord

### Type DDL
- [ ] `_d_new` → `{next_act:'edit_types', obj:parent_id}`
- [ ] `_d_req` with alias+required → `:ALIAS=x::!NULL:Name` stored in val
- [ ] `_d_alias` → only alias part updated, required/multi preserved
- [ ] `_d_null` toggle twice → `!NULL:` appears then disappears
- [ ] `_d_multi` toggle → `:MULTI:` appears
- [ ] `_d_del` → `{id:0, obj:0, next_act:'terms'}`

### Reports
- [ ] List reports → returns `{reports: [{id, name}]}`
- [ ] Get report definition → returns `{columns: [{id, name, type}...]}`
- [ ] Execute report (no filter) → rows with column values
- [ ] Execute report (FR_/TO_ filter) → filtered rows
- [ ] Execute report as CSV → download with semicolons
- [ ] Execute report JSON_KV → array of `{colName: val}` objects
- [ ] Execute report JSON_CR → `{rows: {0: {colId: val}}, totalCount}`

### Export/Backup
- [ ] `backup` download → ZIP contains `.dmp` file with base36 rows
- [ ] `restore` → INSERT IGNORE in batches; ord=0 bug fixed (session 3)
- [ ] `csv_all` → ZIP contains `.csv` with all types
- [ ] `export/:typeId` CSV → header row + data rows

### _ref_reqs
- [ ] Static (no formula attrs) → `{id: "val / req", ...}` (max 80)
- [ ] Dynamic formula (if implemented) → custom SQL result

---

## 5. Priority Order for Fixes

| Priority | Item | Effort | Impact |
|---|---|---|---|
| P0-1 | `REP_JOIN` parsing in compileReport | M | Reports with multi-table joins |
| P0-2 | `executeReport` FR_/TO_ filter key mapping | S | All filtered reports |
| P0-3 | `restore` file upload | M | Backup/restore flow — core implemented; ord=0 bug fixed session 3 |
| P1-1 | `_ref_reqs` dynamic formula | L | Dropdowns with custom queries |
| P1-2 | `_m_save` file copy on `copybtn` | S | Object copy with files |
| P2-1 | `JSON_HR` report format | M | Hierarchical reports |
| P2-2 | `_list` search across requisite values | M | Search completeness |

---

## 6. Files to Audit / Touch

| File | Sections |
|---|---|
| `backend/monolith/src/api/routes/legacy-compat.js` | compileReport, executeReport, _ref_reqs, restore, _m_save copybtn files |
| `backend/monolith/src/api/routes/__tests__/legacy-compat.test.js` | Add tests for report execution, _ref_reqs, _m_id edge cases |
| `backend/monolith/public/legacy-test.html` | Verify all 71 route panels accessible and returning correct data |
