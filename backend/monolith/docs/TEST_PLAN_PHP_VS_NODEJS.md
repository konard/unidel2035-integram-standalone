# Test Plan: PHP ↔ Node.js API Compatibility
*Last updated: 2026-02-20 | Issue #65*

This document lists every PHP endpoint and the exact JSON shape it returns, then
states the current Node.js status and what exact curl command to run to verify it.
Run every test against **both** the PHP server (port 80) and the Node.js server
(port 8081), compare outputs.

Legend:
- ✅ Implemented — response shape is correct
- ⚠️ Partial — endpoint exists but response shape / behaviour differs from PHP
- ❌ Missing — endpoint is absent or always returns HTML

---

## 0. Environment setup

```bash
# PHP server
export PHP=http://localhost:80

# Node.js server
export NODE=http://localhost:8081

# Credentials (replace with valid values)
export DB=my
export LOGIN=admin
export PASSWORD=secret

# After login you get TOKEN and XSRF:
TOKEN=$(curl -s -X POST "$NODE/$DB/auth" \
  -d "login=$LOGIN&pwd=$PASSWORD" | jq -r .token)
XSRF=$(curl -s -X POST "$NODE/$DB/auth" \
  -d "login=$LOGIN&pwd=$PASSWORD" | jq -r ._xsrf)

echo "TOKEN=$TOKEN  XSRF=$XSRF"
```

---

## 1. Authentication

### 1.1 `POST /:db/auth` — login
**Status PHP → Node.js:** ✅

**PHP response (success):**
```json
{ "_xsrf": "abc123", "token": "xyz", "id": 42, "msg": "ok" }
```
**PHP response (failure):**
```json
{ "msg": "[err] Wrong password" }
```

**Test:**
```bash
# success
curl -s -X POST "$NODE/$DB/auth" -d "login=$LOGIN&pwd=$PASSWORD" | jq .

# failure
curl -s -X POST "$NODE/$DB/auth" -d "login=$LOGIN&pwd=wrong" | jq .
```
**Expected:** Same shape as PHP. `msg` field present in both cases.

---

### 1.2 `POST /:db/auth` — change password
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "_xsrf": "new_xsrf", "token": "new_token", "msg": "ok" }
```

**Test:**
```bash
curl -s -X POST "$NODE/$DB/auth" \
  -b "$DB=$TOKEN" \
  -d "change=1&login=$LOGIN&pwd=$PASSWORD&npw1=newpass&npw2=newpass" | jq .
```

---

### 1.3 `POST /:db/auth?reset` — password reset
**Status PHP → Node.js:** ⚠️ (Node.js may differ in error messages)

**PHP response:**
```json
{ "message": "Reset email sent", "db": "my", "login": "user@example.com" }
```

**Test:**
```bash
curl -s -X POST "$NODE/$DB/auth?reset" \
  -d "login=$LOGIN" | jq .
```

---

### 1.4 `GET /:db/exit` — logout
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "success": true, "message": "Logged out" }
```

**Test:**
```bash
curl -s "$NODE/$DB/exit?JSON" -b "$DB=$TOKEN" | jq .
```

---

### 1.5 `POST /:db/getcode` / `POST /:db/checkcode` — OTP
**Status PHP → Node.js:** ✅

**PHP getcode response:**
```json
{ "msg": "ok" }
```
**PHP checkcode response:**
```json
{ "token": "xyz", "_xsrf": "abc" }
```

**Test:**
```bash
curl -s -X POST "$NODE/$DB/getcode" -d "login=$LOGIN" | jq .
curl -s -X POST "$NODE/$DB/checkcode" -d "login=$LOGIN&code=123456" | jq .
```

---

### 1.6 `GET /:db/xsrf` — get XSRF token
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "_xsrf": "abc123", "token": "xyz", "user": "admin", "role": 1, "id": 42, "msg": "ok" }
```

**Test:**
```bash
curl -s "$NODE/$DB/xsrf" -b "$DB=$TOKEN" | jq .
```
**Check:** All six keys must be present. `role` must be integer.

---

## 2. Type / Schema (DDL)

### 2.1 `GET /:db/terms?JSON` — list of accessible types
**Status PHP → Node.js:** ✅

**PHP response:**
```json
[
  { "id": 5, "name": "Клиенты", "href": "5", "ord": 1 },
  { "id": 7, "name": "Договоры", "href": "7", "ord": 2 }
]
```

**Test:**
```bash
curl -s "$NODE/$DB/terms?JSON" -b "$DB=$TOKEN" | jq .
```
**Check:**
- Must be an array (not an object).
- Each element: `id` (int), `name` (string), `href` (string == id), `ord` (int).
- PHP may include extra fields (`base`, `up`, `val`) — Node.js must include **at minimum** `id`, `name`, `href`.

---

### 2.2 `GET /:db/_dict/:typeId?JSON` — type definition + requisites
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{
  "id": 5,
  "val": "Клиенты",
  "up": 0,
  "base": 0,
  "requisites": [
    { "id": 101, "val": "Имя клиента", "ord": 1 },
    { "id": 102, "val": ":!NULL:Телефон", "ord": 2 },
    { "id": 103, "val": ":ALIAS=Реферал::MULTI:Ссылка", "ord": 3 }
  ]
}
```

**Test:**
```bash
TYPE_ID=5
curl -s "$NODE/$DB/_dict/$TYPE_ID?JSON" -b "$DB=$TOKEN" | jq .
```
**Check:**
- `requisites` array present.
- `val` field of each requisite preserves raw PHP directives (`:!NULL:`, `:MULTI:`, `:ALIAS=...:`) — the client strips them.
- `ord` present and numeric.

---

### 2.3 `GET /:db/metadata/:typeId?JSON` — extended type metadata
**Status PHP → Node.js:** ✅

**PHP response (same as `_dict` but also includes `refs`):**
```json
{
  "id": 5,
  "val": "Клиенты",
  "up": 0,
  "base": 0,
  "requisites": [ ... ],
  "refs": [ { "id": 20, "val": "Ссылка", "ref_type": 7 } ]
}
```

**Test:**
```bash
curl -s "$NODE/$DB/metadata/$TYPE_ID?JSON" -b "$DB=$TOKEN" | jq .
```

---

### 2.4 `GET /:db/obj_meta/:id?JSON` — object + its type meta
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{
  "id": 100,
  "val": "ООО Рога",
  "up": 5,
  "base": 0,
  "requisites": [ ... ],
  "values": { "101": "Иван", "102": "+79001234567" }
}
```

**Test:**
```bash
OBJ_ID=100
curl -s "$NODE/$DB/obj_meta/$OBJ_ID?JSON" -b "$DB=$TOKEN" | jq .
```

---

## 3. Object data (read)

### 3.1 `GET /:db/object/:typeId?JSON` — object list for type
**Status PHP → Node.js:** ✅

**PHP route:** `/:db/object/:typeId` with `?JSON` — falls to `default:` in PHP switch, loads main.html template, populates `$GLOBALS["GLOBAL_VARS"]["api"]["object"]`, returns JSON.

**PHP response:**
```json
{
  "object": [
    { "id": 101, "val": "ООО Рога", "up": 5, "base": 0, "ord": 1 },
    { "id": 102, "val": "ИП Копыта", "up": 5, "base": 0, "ord": 2 }
  ]
}
```

**Current Node.js behaviour:** Returns HTML (the `GET /:db/:page*` catch-all sends the HTML template, ignoring `?JSON`).

**Test:**
```bash
# PHP
curl -s "$PHP/$DB/object/$TYPE_ID?JSON" -b "$DB=$TOKEN" | jq .object | head -5

# Node.js (CURRENTLY WRONG — returns HTML)
curl -s "$NODE/$DB/object/$TYPE_ID?JSON" -b "$DB=$TOKEN" | head -3
```
**Expected after fix:** Node.js returns same JSON shape as PHP.

---

### 3.2 `GET /:db/object/:typeId?JSON_DATA` — compact list
**Status PHP → Node.js:** ✅

**PHP response (compact — used by legacy JS client for large datasets):**
```json
[
  { "i": 101, "u": 5, "o": 1, "r": ["ООО Рога", "+7900", null] },
  { "i": 102, "u": 5, "o": 2, "r": ["ИП Копыта", "+7911", null] }
]
```
Fields: `i`=id, `u`=up (parent type), `o`=ord, `r`=requisite values array.

**Current Node.js behaviour:** Returns HTML.

**Test:**
```bash
curl -s "$PHP/$DB/object/$TYPE_ID?JSON_DATA" -b "$DB=$TOKEN" | jq .[0]
curl -s "$NODE/$DB/object/$TYPE_ID?JSON_DATA" -b "$DB=$TOKEN" | head -3
```

---

### 3.3 `GET /:db/_list/:typeId?JSON` — paginated list
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{
  "data": [
    [101, "ООО Рога", "+7900"],
    [102, "ИП Копыта", "+7911"]
  ],
  "total": 47,
  "limit": 20,
  "offset": 0
}
```

**Node.js response (current):**
```json
{
  "data": [...],
  "total": 47,
  "limit": 20,
  "offset": 0
}
```

**Test:**
```bash
# default page
curl -s "$NODE/$DB/_list/$TYPE_ID?JSON&LIMIT=20&F=0" -b "$DB=$TOKEN" | jq '{total,limit,offset}'

# page 2
curl -s "$NODE/$DB/_list/$TYPE_ID?JSON&LIMIT=20&F=20" -b "$DB=$TOKEN" | jq .total

# with parent filter
curl -s "$NODE/$DB/_list/$TYPE_ID?JSON&up=5&LIMIT=20&F=0" -b "$DB=$TOKEN" | jq .total
```
**Check:**
- `data` is array of arrays (NOT array of objects).
- `total` is the total count of matching rows (not just current page length).
- Pagination params are `LIMIT` and `F` (not `limit`/`offset`).

---

### 3.4 `GET /:db/_list_join/:typeId?JSON` — list with joined refs
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{
  "data": [ [101, "ООО Рога", "Менеджер Иван"] ],
  "total": 10,
  "limit": 20,
  "offset": 0,
  "requisites": [ { "id": 101, "val": "Название" }, { "id": 104, "val": "Менеджер" } ]
}
```

**Test:**
```bash
curl -s "$NODE/$DB/_list_join/$TYPE_ID?JSON&LIMIT=20&F=0" -b "$DB=$TOKEN" | jq '{total,limit,offset}'
```

---

## 4. Object data (write / DML)

### 4.1 `POST /:db/_m_new/:typeId?` — create object
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "id": 150, "obj": 5, "ord": 48, "next_act": "edit_obj", "args": "150", "val": "Новый объект", "warning": "" }
```

**Test:**
```bash
curl -s -X POST "$NODE/$DB/_m_new/$TYPE_ID" \
  -b "$DB=$TOKEN" \
  -d "_xsrf=$XSRF&val=Тестовый+объект" | jq .
```
**Check:** `id` (int), `obj` (type id), `next_act` = `"edit_obj"`, `args` = string of new id.

---

### 4.2 `POST /:db/_m_save/:id` — save object
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "id": 150, "obj": 5, "next_act": "object", "args": "5", "warnings": [], "search": null }
```

**Test:**
```bash
OBJ_ID=150
curl -s -X POST "$NODE/$DB/_m_save/$OBJ_ID" \
  -b "$DB=$TOKEN" \
  -d "_xsrf=$XSRF&r101=Иван+Иванов&r102=+79001234567" | jq .
```
**Check:** `next_act` must be `"object"`, `args` is the type id string, `warnings` is array.

---

### 4.3 `POST /:db/_m_del/:id` — delete object
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "id": 150, "obj": 5, "next_act": "object", "args": "5", "warnings": [] }
```

**Test:**
```bash
curl -s -X POST "$NODE/$DB/_m_del/$OBJ_ID" \
  -b "$DB=$TOKEN" \
  -d "_xsrf=$XSRF" | jq .
```

---

### 4.4 `POST /:db/_m_set/:id` — set single attribute
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "id": 150, "obj": 5, "next_act": "nul", "args": "", "warnings": [] }
```

**Test:**
```bash
curl -s -X POST "$NODE/$DB/_m_set/$OBJ_ID" \
  -b "$DB=$TOKEN" \
  -d "_xsrf=$XSRF&t101=Новое+значение" | jq .
```
**Check:** `next_act` = `"nul"` (not null, not "object").

---

### 4.5 `POST /:db/_m_move/:id` — move object to new parent
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "id": 150, "obj": 5, "next_act": "object", "args": "5", "warnings": [] }
```

**Test:**
```bash
curl -s -X POST "$NODE/$DB/_m_move/$OBJ_ID" \
  -b "$DB=$TOKEN" \
  -d "_xsrf=$XSRF&new_up=6" | jq .
```

---

### 4.6 `POST /:db/_m_up/:id` — reorder object (move up)
**Status PHP → Node.js:** ✅

**PHP response:** same as `_m_move`.

**Test:**
```bash
curl -s -X POST "$NODE/$DB/_m_up/$OBJ_ID" \
  -b "$DB=$TOKEN" \
  -d "_xsrf=$XSRF" | jq .
```

---

## 5. Edit form (GET JSON)

### 5.1 `GET /:db/edit_obj/:id?JSON` — edit form data
**Status PHP → Node.js:** ✅

**Node.js response (matches smartq.js getSmart expectations):**
```json
{
  "obj": {
    "id": 150,
    "val": "ООО Рога",
    "up": 5,
    "base": 22,
    "typ": "22"
  },
  "reqs": {
    "101": { "value": "ООО Рога" },
    "102": { "value": "+79001234567" }
  }
}
```
Note: Node.js returns `reqs` as an object keyed by req ID (for smartq.js `json.reqs[reqId].value`),
not a PHP-style `req` array. The `obj.typ` (string) field is required by smartq.js `getSmart`.

**Test:**
```bash
curl -s "$NODE/$DB/edit_obj/$OBJ_ID?JSON" -b "$DB=$TOKEN" | jq .obj
curl -s "$NODE/$DB/edit_obj/$OBJ_ID?JSON" -b "$DB=$TOKEN" | jq '.reqs | keys'
```

---

## 6. Reports

### 6.1 `GET /:db/report/:reportId?JSON` — report metadata
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "id": 3, "name": "Отчет по клиентам", "val": "Отчет по клиентам", "title": "Отчет по клиентам" }
```

**Test:**
```bash
REPORT_ID=3
curl -s "$NODE/$DB/report/$REPORT_ID?JSON" -b "$DB=$TOKEN" | jq .
```

---

### 6.2 `POST /:db/report/:reportId` — execute report (JSON)
**Status PHP → Node.js:** ✅

**Node.js response (column-major format, totals embedded in columns):**
```json
{
  "columns": [
    { "id": 10, "name": "Название", "type": 4, "format": "CHARS", "align": "LEFT", "totals": null },
    { "id": 11, "name": "Сумма",    "type": 13, "format": "NUMBER", "align": "RIGHT", "totals": 42 }
  ],
  "data": [
    ["ООО Рога", "ИП Копыта"],
    ["1000",     "2000"]
  ],
  "rownum": 2
}
```
**Important:** `data[col_index][row_index]` — column-major format (matches smartq.js drawLine).
`totals` is embedded in each column object (matches smartq.js drawFoot check `'totals' in json.columns[0]`).

**Response with `?JSON_KV`:**
```json
[
  { "Название": "ООО Рога", "Сумма": "1000" }
]
```

**Test:**
```bash
curl -s -X POST "$NODE/$DB/report/$REPORT_ID?JSON" \
  -b "$DB=$TOKEN" \
  -d "_xsrf=$XSRF" | jq '{cols: [.columns[].name], data_shape: [(.data | length), (.data[0] | length)]}'
```
**Check:** `data[0]` is first column (array of all row values for that column), `data[0][0]` is row 0 col 0.

---

### 6.3 `GET /:db/report?JSON` — list of reports
**Status PHP → Node.js:** ✅

**PHP response:**
```json
[
  { "id": 3, "name": "Отчет по клиентам" },
  { "id": 7, "name": "Финансовый отчет" }
]
```

**Test:**
```bash
curl -s "$NODE/$DB/report?JSON" -b "$DB=$TOKEN" | jq .
```

---

## 7. Type management (DDL)

### 7.1 `POST /:db/_d_new` — create type
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "id": 10, "obj": 0, "next_act": "edit_obj", "args": "10", "warnings": [] }
```

**Test:**
```bash
curl -s -X POST "$NODE/$DB/_d_new" \
  -b "$DB=$TOKEN" \
  -d "_xsrf=$XSRF&val=ТестовыйТип" | jq .
```

---

### 7.2 `POST /:db/_d_save/:typeId` — save type
**Status PHP → Node.js:** ✅

**Test:**
```bash
curl -s -X POST "$NODE/$DB/_d_save/$TYPE_ID" \
  -b "$DB=$TOKEN" \
  -d "_xsrf=$XSRF&val=Новое+имя+типа" | jq .
```

---

### 7.3 `POST /:db/_d_req/:typeId` — add requisite
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "id": 110, "obj": 5, "next_act": "edit_obj", "args": "110", "warnings": [] }
```

**Test:**
```bash
curl -s -X POST "$NODE/$DB/_d_req/$TYPE_ID" \
  -b "$DB=$TOKEN" \
  -d "_xsrf=$XSRF&val=НоваяРеквизита" | jq .
```

---

### 7.4 DDL toggle operations
**Status PHP → Node.js:** ✅ (all share same response shape)

```bash
REQ_ID=110

# Toggle NOT NULL
curl -s -X POST "$NODE/$DB/_d_null/$REQ_ID" -b "$DB=$TOKEN" -d "_xsrf=$XSRF" | jq .id

# Toggle MULTI
curl -s -X POST "$NODE/$DB/_d_multi/$REQ_ID" -b "$DB=$TOKEN" -d "_xsrf=$XSRF" | jq .id

# Set alias
curl -s -X POST "$NODE/$DB/_d_alias/$REQ_ID" -b "$DB=$TOKEN" -d "_xsrf=$XSRF&alias=Имя" | jq .id

# Delete requisite
curl -s -X POST "$NODE/$DB/_d_del_req/$REQ_ID" -b "$DB=$TOKEN" -d "_xsrf=$XSRF" | jq .id
```

---

## 8. Export / Backup

### 8.1 `GET /:db/csv_all` — export all as ZIP of CSVs
**Status PHP → Node.js:** ✅

**PHP response:** Binary ZIP file (Content-Type: application/zip).

**Test:**
```bash
curl -s -o /tmp/test.zip "$NODE/$DB/csv_all" -b "$DB=$TOKEN"
file /tmp/test.zip        # must be: Zip archive data
unzip -l /tmp/test.zip | head -10
```
**Check:** Is a valid ZIP, contains one CSV per type, CSV is UTF-8.

---

### 8.2 `GET /:db/backup` — binary dump
**Status PHP → Node.js:** ✅

**PHP response:** Binary ZIP (contains `.dmp` file with compact binary format).

**Test:**
```bash
curl -s -o /tmp/test_backup.zip "$NODE/$DB/backup" -b "$DB=$TOKEN"
file /tmp/test_backup.zip
unzip -l /tmp/test_backup.zip
```

---

### 8.3 `POST /:db/restore` — restore from dump
**Status PHP → Node.js:** ✅

**Test:**
```bash
curl -s -X POST "$NODE/$DB/restore" \
  -b "$DB=$TOKEN" \
  -F "file=@/tmp/test_backup.zip" | head -5
```

---

## 9. References

### 9.1 `GET /:db/_ref_reqs/:refId?JSON` — reference display values
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "20": "ООО Рога / Менеджер Иван", "21": "ИП Копыта / Менеджер Петр" }
```

**Test:**
```bash
REF_ID=20
curl -s "$NODE/$DB/_ref_reqs/$REF_ID?JSON" -b "$DB=$TOKEN" | jq .
```
**Check:** Keys are object IDs (strings), values are display strings built from referenced requisites.

---

## 10. Permissions

### 10.1 `GET /:db/grants?JSON` — list user grants
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{
  "success": true,
  "user": "admin",
  "grants": [
    { "id": 5, "type": "WRITE" },
    { "id": 7, "type": "READ" }
  ]
}
```

**Test:**
```bash
curl -s "$NODE/$DB/grants?JSON" -b "$DB=$TOKEN" | jq .
```

---

## 11. File management

### 11.1 `POST /:db/upload` — upload file
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "status": "ok", "filename": "file.pdf", "path": "/uploads/file.pdf" }
```

**Test:**
```bash
curl -s -X POST "$NODE/$DB/upload" \
  -b "$DB=$TOKEN" \
  -F "file=@/tmp/test.pdf" | jq .
```

---

### 11.2 `GET /:db/download/:filename` — download file
**Status PHP → Node.js:** ✅

**Test:**
```bash
curl -s -o /tmp/downloaded.pdf "$NODE/$DB/download/file.pdf" -b "$DB=$TOKEN"
file /tmp/downloaded.pdf
```

---

## 12. Database management

### 12.1 `POST /my/_new_db` — create new database
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "status": "ok", "id": "newdb123" }
```

**Test:**
```bash
curl -s -X POST "$NODE/my/_new_db" \
  -b "my=$TOKEN" \
  -d "_xsrf=$XSRF&name=testdb" | jq .
```

---

## 13. Connection check

### 13.1 `GET /:db/_connect?JSON`
**Status PHP → Node.js:** ✅

**PHP response:**
```json
{ "status": "ok", "message": "Connected" }
```

**Test:**
```bash
curl -s "$NODE/$DB/_connect?JSON" -b "$DB=$TOKEN" | jq .status
```

---

## Summary: Implementation status

| # | Endpoint | Status | Notes |
|---|----------|--------|-------|
| 1 | `GET /:db/object/:typeId?JSON` | ✅ | `{object:[],type:{},req_type:[],reqs:{}}` |
| 2 | `GET /:db/object/:typeId?JSON_DATA` | ✅ | `[{i,u,o,r:[vals]}]` compact |
| 3 | `GET /:db/edit_obj/:id?JSON` | ✅ | `{obj:{typ},reqs:{id:{value}}}` (smartq.js format) |
| 4 | `GET /:db/:page*` — `?JSON` handling | ✅ | JSON intercepted before HTML fallback |
| 5 | `GET /:db/terms?JSON` | ✅ | `[{id,name,href,ord}]` |
| 6 | `GET /:db/_list/:typeId` | ✅ | sort, filter, LIMIT/F pagination |
| 7 | `GET /:db/_list_join/:typeId` | ✅ | `data` array of arrays, `requisites[].val` |
| 8 | `GET /:db/report/:id?JSON` | ✅ | metadata with columns |
| 9 | `POST /:db/report/:id?JSON` | ✅ | column-major data, totals in columns, RECORD_COUNT, LIMIT |
| 10 | `POST /:db/report/:id` (no ?JSON) | ✅ | row-major data, `columns` at top level (for report.html) |
| 11 | `GET /:db/_ref_reqs/:refId?JSON` | ✅ | `{id: "display str"}` |
| 12 | `GET /:db/grants?JSON` | ✅ | `{user: "name", grants: [{id,type}]}` |
| 13 | `GET /:db/csv_all` | ✅ | ZIP with semicolon-CSV |
| 14 | `GET /:db/backup` | ✅ | ZIP with .dmp compact format |
| 15 | `POST /:db/restore` | ✅ | ZIP file upload, INSERT IGNORE batch, `{status,rows}` |
| 16 | `POST /:db/upload` / `GET /:db/download/:filename` | ✅ | multer disk storage |
| 17 | `POST /my/_new_db` | ✅ | `{status:"Ok", id: ...}` |

---

## How to run the full suite

```bash
#!/usr/bin/env bash
# run-compat-tests.sh
set -e
source .env.test  # export PHP, NODE, DB, LOGIN, PASSWORD

PASS=0; FAIL=0

check() {
  local label="$1" url="$2" expected_key="$3"
  local result
  result=$(curl -s "$url" -b "$DB=$TOKEN")
  if echo "$result" | jq -e ".$expected_key" > /dev/null 2>&1; then
    echo "✅  $label"
    PASS=$((PASS+1))
  else
    echo "❌  $label  — got: $(echo "$result" | head -c 100)"
    FAIL=$((FAIL+1))
  fi
}

# Get token
TOKEN=$(curl -s -X POST "$NODE/$DB/auth" -d "login=$LOGIN&pwd=$PASSWORD" | jq -r .token)
XSRF=$(curl -s "$NODE/$DB/xsrf" -b "$DB=$TOKEN" | jq -r ._xsrf)

TYPE_ID=5
OBJ_ID=100
REPORT_ID=3

check "xsrf"             "$NODE/$DB/xsrf?JSON"                    "_xsrf"
check "terms"            "$NODE/$DB/terms?JSON"                   ".[0].id"
check "_dict"            "$NODE/$DB/_dict/$TYPE_ID?JSON"          "id"
check "obj_meta"         "$NODE/$DB/obj_meta/$OBJ_ID?JSON"        "id"
check "_connect"         "$NODE/$DB/_connect?JSON"                "status"
check "object JSON"      "$NODE/$DB/object/$TYPE_ID?JSON"         "object"  # currently ❌
check "object JSON_DATA" "$NODE/$DB/object/$TYPE_ID?JSON_DATA"    ".[0].i"  # currently ❌
check "edit_obj JSON"    "$NODE/$DB/edit_obj/$OBJ_ID?JSON"        "obj.id"  # currently ❌
check "report meta"      "$NODE/$DB/report/$REPORT_ID?JSON"       "id"
check "grants"           "$NODE/$DB/grants?JSON"                  "success"

echo ""
echo "Results: $PASS passed, $FAIL failed"
```

Save as `backend/monolith/scripts/compat-test.sh`, then:
```bash
chmod +x backend/monolith/scripts/compat-test.sh
./backend/monolith/scripts/compat-test.sh
```
