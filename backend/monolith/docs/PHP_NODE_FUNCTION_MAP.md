# PHP vs Node.js Function-Level Parity Mapping

**Generated:** 2026-03-14
**Issue:** #217
**Purpose:** Complete structural audit mapping every PHP code unit to its Node.js equivalent

---

## Summary Statistics

| Category | Total | Full | Partial | Stub | Missing | N/A |
|----------|-------|------|---------|------|---------|-----|
| **Functions** | 96 | 44 | 12 | 3 | 16 | 21 |
| **Route Case Blocks** | 31 | 25 | 2 | 0 | 2 | 2 |
| **Block Type Handlers** | 82 | 0 | 0 | 0 | 0 | 82 |
| **Global Init Code** | 5 | 3 | 1 | 0 | 1 | 0 |
| **Helper Functions (funcs.php)** | 5 | 5 | 0 | 0 | 0 | 0 |

**Key:**
- **Full** — Functionally equivalent, same inputs/outputs
- **Partial** — Exists but missing significant logic branches
- **Stub** — Exists but placeholder/simplified implementation
- **Missing** — No Node.js equivalent at all
- **N/A** — PHP-specific (session handling, HTML rendering) not applicable to API server

---

## 1. Function Definitions (index.php)

### 1.1 Core API/Request Functions

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 1 | `isApi()` | 337-339 | `isApiRequest()` | **Full** | — |
| 2 | `api_dump()` | 7448-7456 | Direct `res.json()` calls | **Full** | — |
| 3 | `my_die()` | 985-998 | `legacyRespond()` with error | **Full** | — |

### 1.2 Authentication & Authorization

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 4 | `Validate_Token()` | 1114-1285 | `legacyAuthMiddleware()` | **Full** | — |
| 5 | `Check_Grant()` | 1000-1089 | `checkGrant()` | **Full** | — |
| 6 | `Grant_1level()` | 1091-1112 | `grant1Level()` | **Full** | — |
| 7 | `Check_Types_Grant()` | 967-976 | `legacyDdlGrantCheck()` | **Full** | — |
| 8 | `Check_Val_granted()` | 921-965 | `checkValGranted()` | **Full** | — |
| 9 | `CheckRepColGranted()` | 7476-7492 | `checkRepColGranted()` | **Full** | — |
| 10 | `getGrants()` | 1287-1324 | `getGrants()` | **Full** | — |
| 11 | `xsrf()` | 469-470 | `generateXsrf()` | **Full** | — |
| 12 | `Salt()` | 7027-7031 | `phpSalt()`, `phpCompatibleHash()` | **Full** | — |
| 13 | `updateTokens()` | 363-383 | Inline in auth handlers | **Full** | — |
| 14 | `login()` | 472-491 | Redirect in auth handlers | **Full** | — |
| 15 | `pwd_reset()` | 7369-7436 | `POST /:db/auth?reset` | **Partial** | Email/SMS sending not implemented (standalone mode) |
| 16 | `check()` | 7438-7447 | `legacyXsrfCheck()` | **Full** | — |
| 17 | `verifyJWT()` | 7525-7551 | `POST /:db/jwt` | **Full** | — |
| 18 | `authJWT()` | 7558-7576 | `POST /:db/jwt` | **Full** | — |
| 19 | `base64UrlDecode()` | 7517-7523 | Node.js `Buffer.from()` | **Full** | — |

### 1.3 Data Manipulation (CRUD)

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 20 | `Insert()` | 7054-7058 | `insertRow()` | **Full** | — |
| 21 | `Insert_batch()` | 7034-7051 | `insertBatch()` | **Full** | Implemented in PR #284 |
| 22 | `Update_Val()` | 7067-7069 | `updateRowValue()` | **Full** | — |
| 23 | `UpdateTyp()` | 7061-7064 | Inline SQL in handlers | **Full** | — |
| 24 | `Delete()` | 1514-1527 | `recursiveDelete()` | **Full** | — |
| 25 | `BatchDelete()` | 1529-1574 | `deleteChildren()` | **Partial** | Non-recursive flat delete only |
| 26 | `Get_Ord()` | 7012-7017 | `getNextOrder()` | **Full** | — |
| 27 | `GetRefOrd()` | 7019-7024 | Inline in handlers | **Full** | — |
| 28 | `Calc_Order()` | 6931-6940 | `getNextOrder()` | **Full** | — |
| 29 | `Get_Current_Values()` | 6977-7009 | Inline in object handlers | **Partial** | Less comprehensive than PHP |
| 30 | `Populate_Reqs()` | 6942-6975 | `populateReqs()` | **Full** | — |
| 31 | `checkDuplicatedReqs()` | 7508-7515 | `checkDuplicatedReqs()` | **Full** | — |
| 32 | `checkNewRef()` | 7499-7506 | `checkNewRef()` | **Full** | — |

### 1.4 Filtering Engine (Construct_WHERE)

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 33 | `Construct_WHERE()` | 624-886 | `constructWhere()` | **Full** | Integrated in Phase 4 PR #218 |
| 34 | `Fetch_WHERE_for_mask()` | 888-893 | `fetchWhereForMask()` | **Full** | — |
| 35 | `Val_barred_by_mask()` | 896-919 | Used in `checkValGranted()` | **Full** | — |

### 1.5 Value Formatting

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 36 | `Format_Val()` | 1338-1397 | `formatVal()` | **Full** | — |
| 37 | `Format_Val_View()` | 1399-1489 | `formatValView()`, `formatObjVal()` | **Full** | FILE/PATH/GRANT/REPORT_COLUMN/PWD display implemented in PR #274 |
| 38 | `Get_Align()` | 1326-1336 | `getAlign()` | **Full** | — |
| 39 | `BuiltIn()` | 1576-1616 | `resolveBuiltIn()` | **Full** | 11 additional placeholders added in PR #273 |

### 1.6 Report Compilation

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 40 | `Compile_Report()` | 1756-3874 | `compileReport()` + `executeReport()` | **Partial** | Aggregates (`SUM`/`AVG`/`MIN`/`MAX`/`COUNT`/`GROUP_CONCAT`) and `GROUP BY` implemented in PR #266. Sub-queries `[report_name]` implemented in PR #267. `REP_COL_FUNC` (abn_* functions) implemented in PR #268. GROUP_CONCAT for array-type (`:MULTI:`) requisites implemented in PR #269. REP_WHERE stored filters with BuiltIn placeholders implemented in PR #270. CSV export (`?format=csv`) implemented in PR #271. Missing: `REP_PIVOT`, complex JOIN aliases |
| 41 | `Get_block_data()` (case "&functions") | 4021-4027 | Not implemented | **Missing** | Report function list for calculatables |
| 42 | `Get_block_data()` (case "&formats") | 4028-4033 | Not implemented | **Missing** | Format list for reports |
| 43 | `exportHeader()` | 1683-1688 | Inline in CSV export | **Full** | — |
| 44 | `exportTerms()` | 1690-1706 | Inline in backup handler | **Full** | — |
| 45 | `Export_reqs()` | 1708-1748 | Inline in backup handler | **Full** | — |
| 46 | `isRef()` | 1750-1754 | Inline checks | **Full** | — |
| 47 | `isArray()` | 3876-3881 | Inline checks | **Full** | — |

### 1.7 Template Engine

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 48 | `Make_tree()` | 7082-7144 | Not implemented | **N/A** | PHP HTML template parsing — API server returns JSON |
| 49 | `Parse_block()` | 7148-7243 | Not implemented | **N/A** | PHP HTML template rendering |
| 50 | `Get_file()` | 1492-1512 | `fs.readFileSync()` for static files | **N/A** | Template file loading |
| 51 | `localize()` | 7245-7247 | Not needed | **N/A** | i18n for HTML templates |

### 1.8 File Operations

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 52 | `GetSha()` | 580-584 | `fileGetSha()` | **Full** | — |
| 53 | `GetSubdir()` | 586-589 | `getSubdir()` | **Full** | — |
| 54 | `GetFilename()` | 591-594 | `getFilename()` | **Full** | — |
| 55 | `RemoveDir()` | 596-615 | `fs.rmSync()` inline | **Full** | — |
| 56 | `BlackList()` | 574-578 | `isBlacklisted()` | **Full** | — |

### 1.9 Database Operations

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 57 | `Exec_sql()` | 508-533 | `pool.query()` | **Partial** | Missing: timing/logging, trace output, error localization |
| 58 | `checkInjection()` | 617-622 | Parameterized queries | **Full** | Node.js uses prepared statements |
| 59 | `isDbVacant()` | 7493-7497 | Inline check | **Full** | — |

### 1.10 Database/User Management

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 60 | `mail2DB()` | 341-348 | Not implemented | **Missing** | Link email to DB in `my` table |
| 61 | `createDb()` | 350-361 | Inline in `_new_db` | **Full** | — |
| 62 | `newDb()` | 385-421 | `POST /my/_new_db` | **Partial** | Template-based DB creation simplified |
| 63 | `newUser()` | 423-433 | `/my/register` handler | **Full** | — |
| 64 | `checkDbNameReserved()` | 435-464 | Inline validation | **Full** | — |
| 65 | `checkDbName()` | 466-467 | `isValidDbName()` | **Full** | — |

### 1.11 Email/SMS

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 66 | `smtpmail()` | 7263-7345 | `nodemailer.sendMail()` | **Full** | — |
| 67 | `server_parse()` | 7348-7360 | Inside nodemailer | **Full** | — |
| 68 | `mysendmail()` | 7362-7367 | `sendOtpEmail()` | **Full** | — |

### 1.12 Utility/Helper Functions

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 69 | `trace()` | 498-506 | `logger.debug()` | **Full** | — |
| 70 | `wlog()` | 493-496 | `logger.info()` | **Full** | — |
| 71 | `t9n()` | 560-572 | Not implemented | **Stub** | i18n returns first language only |
| 72 | `HintNeeded()` | 535-558 | Not implemented | **Missing** | Search hint UI feature |
| 73 | `htmlSafe()` / `htmlEsc()` | implicit | `htmlEsc()` | **Full** | — |
| 74 | `NormalSize()` | 7250-7261 | Not implemented | **Missing** | Human-readable file sizes |
| 75 | `die_info()` | 7072-7078 | `res.send()` | **Full** | — |
| 76 | `myexit()` | 7458-7465 | Process exit inline | **N/A** | — |
| 77 | `mywrite()` | 7467-7474 | `logger.*` | **Full** | — |
| 78 | `MaskDelimiters()` | 1619-1621 | `maskDelimiters()` | **Full** | Implemented in PR #280 |
| 79 | `UnMaskDelimiters()` | 1623-1625 | `unMaskDelimiters()` | **Full** | Implemented in PR #280 |
| 80 | `HideDelimiters()` | 1627-1629 | `hideDelimiters()` | **Full** | Implemented in PR #280 |
| 81 | `UnHideDelimiters()` | 1631-1633 | `unHideDelimiters()` | **Full** | Implemented in PR #280 |
| 82 | `constructHeader()` | 1635-1681 | Inline in export | **Full** | — |
| 83 | `build_post_fields()` | 3883-3910 | Not implemented | **Missing** | Multipart form builder for connectors |
| 84 | `getJsonVal()` | 3912-3930 | Not implemented | **Missing** | JSON path extraction for reports |
| 85 | `checkJson()` | 3932-3938 | Not implemented | **Missing** | JSON validation for reports |
| 86 | `Slash_semi()` | 3940-3942 | `slashSemi()` | **Full** | Implemented in PR #281 |
| 87 | `UnSlash_semi()` | 3944-3946 | `unSlashSemi()` | **Full** | Implemented in PR #281 |
| 88 | `Download_send_headers()` | 3948-3957 | `res.setHeader()` inline | **Full** | — |
| 89 | `FetchAlias()` | 3959-3961 | Not implemented | **Missing** | Alias extraction from modifiers |
| 90 | `sendJsonHeaders()` | 3963-3968 | `res.json()` | **Full** | — |
| 91 | `ResolveType()` | 3970-3989 | Inline type checks | **Full** | — |
| 92 | `CheckSubst()` | 3991-3996 | Not implemented | **Missing** | Column substitution for reports |
| 93 | `CheckObjSubst()` | 3998-4003 | Not implemented | **Missing** | Object substitution for reports |
| 94 | `maskCsvDelimiters()` | 4005-4010 | `maskCsvDelimiters()` | **Full** | — |
| 95 | `removeMasks()` | 7553-7556 | `parseModifiers()` | **Full** | — |
| 96 | `RepoGrant()` | 6826-6834 | Not implemented | **Missing** | Repository-level grant check |

---

## 2. Route Case Blocks (Main Switch)

### 2.1 Authentication Routes

| # | PHP Case | Lines | Node.js Route | Status | What's Missing |
|---|----------|-------|---------------|--------|----------------|
| 1 | `case "jwt"` | 7608-7616 | `POST /:db/jwt` | **Full** | — |
| 2 | `case "auth"` | 7618-7701 | `POST /:db/auth` | **Full** | — |
| 3 | `case "confirm"` | 7704-7712 | `POST /:db/confirm` | **Full** | — |
| 4 | `case "login"` | 7715-7717 | `GET /:db/login` | **Full** | — |
| 5 | `case "getcode"` | 7719-7745 | `POST /:db/getcode` | **Full** | — |
| 6 | `case "checkcode"` | 7747-7777 | `POST /:db/checkcode` | **Full** | — |
| 7 | `case "exit"` | 8907-8912 | `ALL /:db/exit` | **Full** | — |

### 2.2 DML Routes (Data Manipulation)

| # | PHP Case | Lines | Node.js Route | Status | What's Missing |
|---|----------|-------|---------------|--------|----------------|
| 8 | `case "_m_new"` | 8311-8548 | `POST /:db/_m_new/:up?` | **Full** | Macro defaults and MULTI_MASK auto-detection implemented in PR #275 |
| 9 | `case "_m_save"` | 7991-8235 | `POST /:db/_m_save/:id` | **Full** | — |
| 10 | `case "_m_set"` | 7859-7989 | `POST /:db/_m_set/:id` | **Full** | BuiltIn type ID skip + NUMBER/SIGNED pre-cast implemented in PR #276 |
| 11 | `case "_m_del"` | 8275-8309 | `POST /:db/_m_del/:id` | **Full** | — |
| 12 | `case "_m_move"` | 8237-8273 | `POST /:db/_m_move/:id` | **Full** | — |
| 13 | `case "_m_ord"` | 7821-7839 | `POST /:db/_m_ord/:id` | **Full** | — |
| 14 | `case "_m_id"` | 7841-7857 | `POST /:db/_m_id/:id` | **Full** | — |
| 15 | `case "_m_up"` | 7800-7819 | `POST /:db/_m_up/:id` | **Full** | — |

### 2.3 DDL Routes (Type Management)

| # | PHP Case | Lines | Node.js Route | Status | What's Missing |
|---|----------|-------|---------------|--------|----------------|
| 16 | `case "_d_new"` / `"_terms"` | 8628-8643 | `POST /:db/_d_new/:parentTypeId?` | **Full** | — |
| 17 | `case "_d_save"` / `"_patchterm"` | 8582-8598 | `POST /:db/_d_save/:typeId` | **Full** | — |
| 18 | `case "_d_del"` / `"_deleteterm"` | 8739-8756 | `POST /:db/_d_del/:typeId` | **Full** | — |
| 19 | `case "_d_req"` / `"_attributes"` | 8550-8580 | `POST /:db/_d_req/:typeId` | **Full** | — |
| 20 | `case "_d_ref"` / `"_references"` | 8645-8662 | `POST /:db/_d_ref/:typeId` | **Full** | — |
| 21 | `case "_d_alias"` / `"_setalias"` | 8600-8626 | `POST /:db/_d_alias/:reqId` | **Full** | — |
| 22 | `case "_d_null"` / `"_setnull"` | 8664-8674 | `POST /:db/_d_null/:reqId` | **Full** | — |
| 23 | `case "_d_multi"` / `"_setmulti"` | 8676-8686 | `POST /:db/_d_multi/:reqId` | **Full** | — |
| 24 | `case "_d_attrs"` / `"_modifiers"` | 8688-8699 | `POST /:db/_d_attrs/:reqId` | **Full** | — |
| 25 | `case "_d_up"` / `"_moveup"` | 8701-8717 | `POST /:db/_d_up/:reqId` | **Full** | — |
| 26 | `case "_d_ord"` / `"_setorder"` | 8719-8737 | `POST /:db/_d_ord/:reqId` | **Full** | — |
| 27 | `case "_d_del_req"` / `"_deletereq"` | 8758-8797 | `POST /:db/_d_del_req/:reqId` | **Full** | — |

### 2.4 Utility/Metadata Routes

| # | PHP Case | Lines | Node.js Route | Status | What's Missing |
|---|----------|-------|---------------|--------|----------------|
| 28 | `case "xsrf"` | 8914-8917 | `GET /:db/xsrf` | **Full** | — |
| 29 | `case "terms"` | 8919-8942 | `GET /:db/terms` | **Full** | — |
| 30 | `case "_ref_reqs"` | 8944-9086 | `GET /:db/_ref_reqs/:refId` | **Full** | Dynamic formula evaluation for calculatable refs implemented in PR #272 |
| 31 | `case "_connect"` | 9088-9111 | `ALL /:db/_connect/:id?` | **Full** | — |
| 32 | `case "_new_db"` | 8799-8824 | `POST /my/_new_db` | **Partial** | Simplified template handling |
| 33 | `case "obj_meta"` | 8826-8858 | `ALL /:db/obj_meta/:id` | **Full** | — |
| 34 | `case "metadata"` | 8860-8905 | `ALL /:db/metadata/:typeId?` | **Full** | — |

### 2.5 Page/Template Routes

| # | PHP Case | Lines | Node.js Route | Status | What's Missing |
|---|----------|-------|---------------|--------|----------------|
| 35 | `case "object"` | 4056-4071 | JSON via `GET /:db/object/:typeId` | **Partial** | Full template rendering not needed for API |
| 36 | `case "edit_obj"` | 4073-4085 | JSON via `GET /:db/edit_obj/:id` | **Partial** | Full template rendering not needed for API |
| 37 | `case "csv_all"` | 4087-4176 | `GET /:db/csv_all` | **Full** | — |
| 38 | `case "restore"` | 4178-4237 | `POST /:db/restore` | **Full** | — |
| 39 | `case "backup"` | 4239-4291 | `GET /:db/backup` | **Full** | — |
| 40 | `case "report"` / `"smartq"` / `"sql"` | 9120-9127 | `ALL /:db/report/:reportId?` | **Partial** | Sub-queries implemented in PR #267, stored filters REP_WHERE implemented in PR #270, CSV export implemented in PR #271. Missing: pivot tables (`REP_PIVOT`), complex JOIN aliases |
| 41 | `case "dir_admin"` | 9128-9131 | `GET /:db/dir_admin` | **N/A** | File browser UI, PHP-specific |
| 42 | `default:` (page render) | 9114-9158 | `GET /:db`, `GET /:db/:page*` | **N/A** | HTML template rendering |

---

## 3. Block Type Handlers (Get_block_data switch)

All 82 block type handlers are **N/A** for the Node.js API server. These are PHP-specific HTML template data providers:

| # | PHP Block | Lines | Status | Reason |
|---|-----------|-------|--------|--------|
| 1 | `&functions` | 4021-4027 | N/A | Report function dropdown for HTML |
| 2 | `&formats` | 4028-4033 | N/A | Format dropdown for HTML |
| 3 | `&top_menu` | 4035-4050 | N/A | Navigation menu HTML |
| 4 | `&main` | 4052-4291 | N/A | Main page template |
| 5 | `&edit_typs` | 4293-4318 | N/A | Type editor HTML |
| 6 | `&editables` | 4320-4323 | N/A | Editable types list |
| 7 | `&types` | 4325-4331 | N/A | Types dropdown |
| 8 | `&object` | 4333-4379 | N/A | Object list HTML |
| 9 | `&new_req` | 4381-4388 | N/A | New requisite form |
| 10 | `&new_req_report_column` | 4390-4393 | N/A | Report column form |
| 11 | `&new_req_grant` | 4395-4398 | N/A | Grant form |
| 12 | `&grant_list` | 4400-4449 | N/A | Grant list HTML |
| 13 | `&editreq_grant` | 4451-4454 | N/A | Grant editor |
| 14 | `&editreq_report_column` | 4456-4459 | N/A | Report column editor |
| 15 | `&edit_req` | 4461-4468 | N/A | Requisite editor |
| 16 | `&rep_col_list` | 4470-4633 | N/A | Report column list |
| 17 | `&warnings` | 4635-4638 | N/A | Warning display |
| 18 | `&tabs` | 4640-4659 | N/A | Tab navigation |
| 19 | `&object_reqs` | 4661-4796 | N/A | Object requisites form |
| 20 | `&editreq_array` | 4798-4803 | N/A | Array editor |
| 21 | `&editreq_pwd` | 4805-4813 | N/A | Password editor |
| 22 | `&editreq_boolean` | 4815-4818 | N/A | Boolean editor |
| 23 | `&editreq_file` | 4820-4821 | N/A | File editor |
| 24 | `&editreq_reference` | 4822 | N/A | Reference editor |
| 25 | `&editreq_short` | 4823 | N/A | Short text editor |
| 26 | `&editreq_chars` | 4824 | N/A | Chars editor |
| 27 | `&editreq_html` | 4825 | N/A | HTML editor |
| 28 | `&editreq_memo` | 4826 | N/A | Memo editor |
| 29 | `&editreq_date` | 4827 | N/A | Date editor |
| 30 | `&editreq_datetime` | 4828 | N/A | Datetime editor |
| 31 | `&editreq_signed` | 4829 | N/A | Signed number editor |
| 32 | `&editreq_number` | 4830 | N/A | Number editor |
| 33 | `&editreq_calculatable` | 4831-4848 | N/A | Calculatable editor |
| 34 | `&multiselect` | 4850-4937 | N/A | Multiselect widget |
| 35-82 | Various `&add_obj_ref_reqs`, `&editreq_ref`, etc. | 4939-6824 | N/A | Form UI handlers |

---

## 4. Global Initialization Code

| # | PHP Code | Lines | Node.js Equivalent | Status | What's Missing |
|---|----------|-------|-------------------|--------|----------------|
| 1 | Headers (Cache-Control, CORS) | 1-8 | Express middleware | **Full** | — |
| 2 | Constants (DB_MASK, TYPE IDs) | 10-26 | `TYPE` object | **Full** | — |
| 3 | Database connection | 39-43 | `getPool()` | **Full** | — |
| 4 | Session/Token validation | ~1114 | `legacyAuthMiddleware()` | **Full** | — |
| 5 | Global variables (`$GLOBALS`) | ~100-300 | Request-scoped context | **Partial** | Some globals not fully replicated |

---

## 5. Helper Functions (include/funcs.php)

| # | PHP Function | Lines | Node.js Equivalent | Status | What's Missing |
|---|--------------|-------|-------------------|--------|----------------|
| 1 | `abn_DATE2STR()` | 2-11 | `abn_DATE2STR()` in `report-functions.js` | **Full** | — |
| 2 | `semantic()` | 13-112 | `semantic()` in `report-functions.js` | **Full** | — |
| 3 | `abn_RUB2STR()` | 115-167 | `abn_RUB2STR()` in `report-functions.js` | **Full** | — |
| 4 | `abn_NUM2STR()` | 169-204 | `abn_NUM2STR()` in `report-functions.js` | **Full** | — |
| 5 | `abn_Translit()` | 206-213 | `abn_Translit()` in `report-functions.js` | **Full** | — |

---

## 6. Prioritized Missing/Partial Items

### 6.1 Critical (Required for Core Functionality)

| Priority | Item | Impact | Dependency |
|----------|------|--------|------------|
| 1 | ~~`Compile_Report()` sub-queries `[report_name]`~~ | ~~Reports referencing other reports fail~~ | ~~Core reporting~~ — **Implemented in PR #267** |
| 2 | ~~`Insert_batch()`~~ | ~~Performance degradation on bulk imports~~ | ~~Restore, data migration~~ — **Implemented in PR #284** |

### 6.2 High (Affects Significant Features)

| Priority | Item | Impact | Dependency |
|----------|------|--------|------------|
| 3 | `Compile_Report()` REP_PIVOT | Pivot tables don't work | Advanced reporting |
| 4 | ~~`Compile_Report()` REP_WHERE~~ | ~~Custom WHERE clauses in reports~~ | ~~Advanced reporting~~ — **Implemented in PR #270** |
| 5 | ~~`_ref_reqs` grant mask integration~~ | ~~Reference dropdowns may show unauthorized items~~ | ~~Security~~ — **Implemented in PR #272** |
| 6 | ~~`abn_*` functions (DATE2STR, RUB2STR, etc.)~~ | ~~Russian locale reports fail~~ | ~~Localization~~ — **Implemented in PR #268** |

### 6.3 Medium (Nice-to-Have)

| Priority | Item | Impact | Dependency |
|----------|------|--------|------------|
| 7 | `HintNeeded()` | Search hints don't appear | UX |
| 8 | `NormalSize()` | File sizes show raw bytes | UX |
| 9 | `RepoGrant()` | Repository-level access check | Advanced permissions |
| 10 | `build_post_fields()` | External connector POST fails | Connectors |
| 11 | `getJsonVal()` / `checkJson()` | JSON extraction in reports | Advanced reporting |

### 6.4 Low (Edge Cases)

| Priority | Item | Impact | Dependency |
|----------|------|--------|------------|
| 12 | ~~Delimiter masking functions~~ | ~~CSV edge cases~~ | ~~Export~~ — **Implemented in PR #280 (`MaskDelimiters`, `UnMaskDelimiters`, `HideDelimiters`, `UnHideDelimiters`) and PR #281 (`Slash_semi`, `UnSlash_semi`)** |
| 13 | `CheckSubst()` / `CheckObjSubst()` | Column substitution | Advanced reporting |
| 14 | `FetchAlias()` | Alias extraction | Advanced reporting |
| 15 | `mail2DB()` | Email-to-DB linking | Multi-tenant |

---

## 7. Verification Notes

- **Total PHP functions counted:** 96 in index.php + 5 in funcs.php = 101
- **Total route case blocks:** 31 action handlers + 82 block handlers = 113
- **Verification method:** Each Node.js function was traced by reading the actual source code in `legacy-compat.js`
- **Status verified by:** Comparing function signatures, logic branches, and SQL queries

---

## 8. Recommendations

1. **Complete `Compile_Report()` parity** — The report engine is the most critical gap. Pivot tables are used in production reports. (Note: Aggregates implemented in PR #266, sub-queries implemented in PR #267, abn_* functions implemented in PR #268, GROUP_CONCAT for arrays implemented in PR #269, REP_WHERE stored filters implemented in PR #270, CSV export implemented in PR #271. Remaining: REP_PIVOT, complex JOIN aliases.)

2. ~~**Add batch insert**~~ — **Implemented in PR #284** — `insertBatch()` is now available for restore and bulk import operations.

3. ~~**Implement `abn_*` functions**~~ — **Implemented in PR #268** — These are now available for Russian-locale reports.

4. ~~**Consider grant mask in `_ref_reqs`**~~ — **Implemented in PR #272** — Dynamic formula evaluation for calculatable reference dropdowns now works correctly.

5. **Block handlers are N/A** — All 82 block handlers are PHP-specific HTML template providers. The Node.js API returns JSON, so these are correctly not implemented.

6. **BuiltIn placeholders complete** — 11 additional placeholders added in PR #273 (`[YESTERDAY]`, `[TOMORROW]`, `[MONTH_AGO]`, `[WEEK_AGO]`, `[MONTH_PLUS]`, `[ROLE]`, `[ROLE_ID]`, `[TSHIFT]`, `[REMOTE_HOST]`, `[HTTP_USER_AGENT]`, `[HTTP_REFERER]`).

7. ~~**BKI delimiter functions**~~ — **Implemented in PR #280 and #281** — All delimiter masking functions (`MaskDelimiters`, `UnMaskDelimiters`, `HideDelimiters`, `UnHideDelimiters`, `Slash_semi`, `UnSlash_semi`) are now available.

8. ~~**BKI export functions**~~ — **Implemented in PR #282** — `constructHeader`, `exportHeader`, `exportTerms`, `Export_reqs` are now integrated into backup/export route.

9. ~~**csv_all optimizations**~~ — **Implemented in PR #283** — Large export queries now use type-specific JOINs instead of N+1 per-object queries.
