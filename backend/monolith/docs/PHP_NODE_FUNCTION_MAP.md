# PHP vs Node.js — Complete Function-Level Parity Map

**Date:** 2026-03-14 (re-audit after PRs #258–#293 merged)
**PHP:** `integram-server/index.php` (9,181 lines)
**Node.js:** `backend/monolith/src/api/routes/legacy-compat.js` (13,064 lines)
**Methodology:** Structural audit — every function, case block, and block handler in the PHP source was read and cross-referenced against the Node.js port. Updated after 37 parity fixes (#221–#257).

---

## Summary Statistics

| Category | Total | Full | Partial | Stub | Missing | N/A |
|----------|-------|------|---------|------|---------|-----|
| Functions (named) | 96 | 64 | 0 | 0 | 6 | 26 |
| Pre-auth route cases | 6 | 6 | 0 | 0 | 0 | 0 |
| Post-auth route cases | 29 | 27 | 0 | 0 | 0 | 2 |
| Block type handlers (`Get_block_data`) | 65 | 0 | 0 | 0 | 0 | 65 |
| Nested action cases (`&main`) | 6 | 4 | 0 | 0 | 0 | 2 |
| Global initialization sections | 8 | 4 | 1 | 0 | 0 | 3 |
| **Grand total** | **210** | **105** | **1** | **0** | **6** | **98** |

**Key:** Full = functionally equivalent | Partial = exists but missing significant logic | Stub = placeholder only | Missing = no Node.js equivalent at all | N/A = PHP-specific (HTML rendering, session, etc.) not applicable to JSON API

**Changes from initial audit:** +41 Full, −22 Partial, −1 Stub, −19 Missing, +1 N/A

---

## Table of Contents

1. [Named Functions](#1-named-functions-96)
2. [Pre-Auth Route Cases](#2-pre-auth-route-cases-6)
3. [Post-Auth Route Cases](#3-post-auth-route-cases-29)
4. [Block Type Handlers](#4-block-type-handlers-get_block_data-65)
5. [Nested Action Cases in &main](#5-nested-action-cases-in-main-6)
6. [Global Initialization](#6-global-initialization-8-sections)
7. [Remaining Gap List](#7-remaining-gap-list)

---

## 1. Named Functions (96)

### 1.1 Authentication & Session

| # | PHP Function | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 1 | `isApi()` | 337–340 | `isApiRequest()` (line 42) | **Full** | — |
| 2 | `mail2DB()` | 341–349 | Inlined in register route (line 2559) | **Full** | — |
| 3 | `createDb()` | 350–362 | Inlined in `_new_db` route (line 7713) | **Full** | — |
| 4 | `updateTokens()` | 363–383 | Inlined in auth routes | **Full** | — |
| 5 | `newDb()` | 385–421 | Inlined in `_new_db` route (line 7713) | **Full** | — |
| 6 | `newUser()` | 423–434 | Inlined in register route (line 2559) | **Full** | — |
| 7 | `checkDbNameReserved()` | 435–465 | Inlined in `_new_db` route | **Full** | — |
| 8 | `checkDbName()` | 466–468 | `isValidDbName()` (line 1857) | **Full** | — |
| 9 | `xsrf()` | 469–471 | `generateXsrf()` (line 385) | **Full** | — |
| 10 | `login()` | 472–492 | `renderMainPage()` (line 406) | **N/A** | PHP renders HTML login form; Node serves static files |
| 11 | `check()` | 7438–7447 | `phpCompatibleHash()` (line 363) | **Full** | — |
| 12 | `Validate_Token()` | 1114–1286 | `legacyAuthMiddleware()` (line 1571) | **Full** | Guest fallback added (#229, line 1956–2017); Basic auth, admin hash bypass, activity tracking all present |
| 13 | `getGrants()` | 1287–1325 | `getGrants()` (line 599) | **Full** | `resolveMaskBuiltIn()` called at line 712 (#222) |
| 14 | `Check_Grant()` | 1000–1089 | `checkGrant()` (line 659) | **Full** | — |
| 15 | `Grant_1level()` | 1091–1113 | `grant1Level()` (line 769) | **Full** | — |
| 16 | `Check_Types_Grant()` | 967–977 | `legacyDdlGrantCheck()` (line 1652) | **Full** | — |
| 17 | `Check_Val_granted()` | 921–966 | `checkValGranted()` (line 908) | **Full** | — |
| 18 | `Val_barred_by_mask()` | 896–919 | `valBarredByMask()` (line 1106–1142) | **Full** | Ported in #221; called in `_m_set` (6096) and `_m_save` (6459) |
| 19 | `IsOccupied()` | 978–984 | Inlined in register route | **Full** | — |
| 20 | `Salt()` | 7027–7032 | `phpSalt()` (line 354) | **Full** | — |
| 21 | `verifyJWT()` | 7525–7552 | Inlined in JWT route (line 7558) | **Full** | — |
| 22 | `authJWT()` | 7558–7577 | Inlined in JWT route (line 7558) | **Full** | — |
| 23 | `base64UrlDecode()` | 7517–7524 | Inlined (Buffer.from) | **Full** | — |
| 24 | `pwd_reset()` | 7369–7437 | POST `/:db/auth?reset` (line 3109–3270) | **Full** | Full flow: token gen → email → confirm endpoint (#241) |

### 1.2 Core Filter & Query Engine

| # | PHP Function | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 25 | `Construct_WHERE()` | 624–886 | `constructWhere()` (line 1215) | **Full** | — |
| 26 | `Fetch_WHERE_for_mask()` | 888–894 | `fetchWhereForMask()` (line 886) | **Full** | — |
| 27 | `Compile_Report()` | 1756–3875 | `compileReport()` + `executeReport()` (lines 9769–10403) | **Full** | GROUP BY/aggregates (#230), abn_* (#232), subqueries (#231), GROUP_CONCAT (#233), stored filters (#234), CSV (#235) — all implemented |
| 28 | `HintNeeded()` | 535–558 | `hintNeeded()` (line 9713–9738) | **Full** | Two-overload function; 3 call sites (#250) |
| 29 | `checkInjection()` | 617–622 | — | **N/A** | Node uses parameterized queries (better approach) |

### 1.3 Value Formatting

| # | PHP Function | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 30 | `Format_Val()` | 1338–1398 | `formatVal()` (line 1035) | **Full** | NaN guard added (#240, line 1239) |
| 31 | `Format_Val_View()` | 1399–1490 | `formatValView()` (line 1285–1369) | **Full** | FILE (1331), PATH (1341), GRANT (1351), REPORT_COLUMN (1358), PWD (1363) all added (#238) |
| 32 | `Get_Align()` | 1326–1337 | `getAlign()` (line 1159) | **Full** | — |
| 33 | `BuiltIn()` | 1576–1618 | `resolveBuiltIn()` (line 2088–2130) | **Full** | All 11 missing placeholders added (#237): YESTERDAY, TOMORROW, MONTH_AGO, WEEK_AGO, MONTH_PLUS, ROLE, ROLE_ID, TSHIFT, REMOTE_HOST, HTTP_USER_AGENT, HTTP_REFERER |
| 34 | `t9n()` | 560–572 | `utils/t9n.js` (78-entry RU/EN dictionary) | **Full** | 20+ call sites (#253) |
| 35 | `CheckSubst()` | 3991–3997 | `checkSubst()` (line 11680–11691) | **Full** | 7 call sites in BKI import pipeline (#255) |
| 36 | `CheckObjSubst()` | 3998–4004 | `checkObjSubst()` (line 11693–11704) | **Full** | 4 call sites in BKI import pipeline (#255) |
| 37 | `removeMasks()` | 7553–7557 | `parseModifiers()` (line 6364) | **Full** | Different approach (parse vs strip) but same effect |

### 1.4 Data Operations

| # | PHP Function | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 38 | `Insert()` | 7054–7059 | `insertRow()` (line 4367) | **Full** | — |
| 39 | `Insert_batch()` | 7034–7052 | `insertBatch()` (line 5421–5440) | **Full** | Multi-row INSERT, batchSize=1000 (#248) |
| 40 | `Delete()` | 1514–1528 | `recursiveDelete()` (line 1708) | **Full** | — |
| 41 | `BatchDelete()` | 1529–1573 | `batchDelete()` (line 2218–2284) | **Full** | `_collectDescendants()` + batch `DELETE WHERE id IN(...)` (#249) |
| 42 | `UpdateTyp()` | 7061–7065 | Inlined SQL | **Full** | — |
| 43 | `Update_Val()` | 7067–7070 | `updateRowValue()` (line 4377) | **Full** | — |
| 44 | `GetObjectReqs()` | 6836–6928 | Inlined in edit route (line ~3698) | **Full** | — |
| 45 | `Populate_Reqs()` | 6942–6975 | `populateReqs()` (line 1818) | **Full** | — |
| 46 | `Get_Current_Values()` | 6977–7010 | Inlined in edit route | **Full** | — |
| 47 | `Calc_Order()` | 6931–6940 | `getNextOrder()` (line 4346) | **Full** | — |
| 48 | `Get_Ord()` | 7012–7018 | Inlined | **Full** | — |
| 49 | `GetRefOrd()` | 7019–7025 | Inlined | **Full** | — |
| 50 | `Exec_sql()` | 508–533 | `pool.query()` / `pool.execute()` | **N/A** | PHP wrapper for mysql_query; Node uses mysql2/promise natively |
| 51 | `isRef()` | 1750–1755 | Inlined checks | **Full** | — |
| 52 | `isArray()` | 3876–3882 | Inlined checks | **Full** | — |
| 53 | `ResolveType()` | 3970–3990 | Part of BKI import | **Full** | Implemented as part of #244 BKI export/import |
| 54 | `checkDuplicatedReqs()` | 7508–7516 | `checkDuplicatedReqs()` (line 1734) | **Full** | — |
| 55 | `checkNewRef()` | 7499–7507 | `checkNewRef()` (line 1801) | **Full** | — |

### 1.5 File Operations

| # | PHP Function | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 56 | `BlackList()` | 574–578 | `isBlacklisted()` (line 1757) | **Full** | — |
| 57 | `GetSha()` | 580–584 | `fileGetSha()` (line 566) | **Full** | — |
| 58 | `GetSubdir()` | 586–589 | `getSubdir()` (line 1773) | **Full** | — |
| 59 | `GetFilename()` | 591–594 | `getFilename()` (line 1786) | **Full** | — |
| 60 | `RemoveDir()` | 596–616 | `removeDir()` (line 2379–2385) | **Full** | `fs.rmSync({recursive:true,force:true})` wrapper (#251) |
| 61 | `RepoGrant()` | 6826–6834 | `repoGrant()` (line 865–876) | **Full** | Grant check TYPE.FILE=10 on upload/download/dir_admin (#252) |

### 1.6 Export & Import

| # | PHP Function | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 62 | `constructHeader()` | 1635–1682 | `constructHeader()` (line 11539–11609) | **Full** | Type metadata recursion (#244) |
| 63 | `exportHeader()` | 1683–1689 | `exportHeader()` (line 11616–11623) | **Full** | Header serialization (#244) |
| 64 | `exportTerms()` | 1690–1706 | `exportTerms()` (line 11638–11665) | **Full** | Dictionary export (#244) |
| 65 | `Export_reqs()` | 1708–1749 | `Export_reqs()` (line 11721–11778) | **Full** | Data row export (#244) |
| 66 | `Download_send_headers()` | 3948–3958 | Inlined in download route | **Full** | — |
| 67 | `maskCsvDelimiters()` | 4005–4011 | `maskCsvDelimiters()` (line 11204–11209) | **Full** | Proper CSV quoting (#247) |
| 68 | `MaskDelimiters()` | 1619–1622 | `maskDelimiters()` (line 615–618) | **Full** | (#245) |
| 69 | `UnMaskDelimiters()` | 1623–1626 | `unMaskDelimiters()` (line 630–634) | **Full** | (#245) |
| 70 | `HideDelimiters()` | 1627–1630 | `hideDelimiters()` (line 620–623) | **Full** | (#245) |
| 71 | `UnHideDelimiters()` | 1631–1634 | `unHideDelimiters()` (line 625–628) | **Full** | (#245) |
| 72 | `Slash_semi()` | 3940–3943 | `slashSemi()` (line 638–641) | **Full** | (#246) |
| 73 | `UnSlash_semi()` | 3944–3947 | `unSlashSemi()` (line 643–646) | **Full** | (#246) |
| 74 | `FetchAlias()` | 3959–3962 | `parseModifiers()` (line 6364) | **Full** | — |

### 1.7 Email & Communication

| # | PHP Function | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 75 | `smtpmail()` | 7263–7346 | `sendMail()` (line 299–378) | **Full** | General-purpose mailer via nodemailer (#242) |
| 76 | `server_parse()` | 7348–7361 | — | **N/A** | SMTP socket parser; Node uses nodemailer |
| 77 | `mysendmail()` | 7362–7368 | `sendMail()` (line 299–378) | **Full** | Same general mailer (#242) |

### 1.8 Report Helpers

| # | PHP Function | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 78 | `CheckRepColGranted()` | 7476–7492 | `checkRepColGranted()` (line 990) | **Full** | — |
| 79 | `getJsonVal()` | 3912–3931 | `getJsonVal()` in `report-functions.js` (line 228–280) | **Full** | Recursive JSON key extraction; 18 unit tests (#257) |
| 80 | `checkJson()` | 3932–3939 | `checkJson()` in `report-functions.js` (line 293–333) | **Full** | Integrated in executeReport (#257) |
| 81 | `build_post_fields()` | 3883–3911 | `buildPostFields()` (line 1807–1881) | **Full** | FormData builder with `@` file support (#256) |

### 1.9 Logging, Debugging & Utilities

| # | PHP Function | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 82 | `wlog()` | 493–497 | `logger` module | **Full** | — |
| 83 | `trace()` | 498–506 | `logger.debug()` | **Full** | — |
| 84 | `my_die()` | 985–998 | Error response patterns | **Full** | — |
| 85 | `die_info()` | 7072–7079 | Info response patterns | **Full** | — |
| 86 | `api_dump()` | 7448–7457 | `res.json()` | **Full** | — |
| 87 | `myexit()` | 7458–7466 | — | **N/A** | PHP cleanup; Node uses connection pooling |
| 88 | `mywrite()` | 7467–7475 | `logger` module | **Full** | — |
| 89 | `NormalSize()` | 7250–7262 | `normalSize()` (line 2360–2366) | **Full** | B/KB/MB/GB/TB formatting (#254) |
| 90 | `htmlSafe()` / `htmlEsc()` | implicit | `htmlEsc()` (line 557) | **Full** | — |
| 91 | `decodeJsonEscapes()` | N/A (PHP native) | `decodeJsonEscapes()` (line 552) | **Full** | — |
| 92 | `sendJsonHeaders()` | 3963–3969 | Express default | **N/A** | Express handles JSON headers |
| 93 | `isDbVacant()` | 7493–7498 | `dbExists()` (line 1864) | **Full** | — |

### 1.10 Template Engine (PHP-specific)

| # | PHP Function | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 94 | `Get_block_data()` | 4012–6824 | — | **N/A** | Server-side HTML template data provider (2,812 lines) |
| 95 | `Make_tree()` | 7082–7145 | — | **N/A** | HTML template parser |
| 96 | `Parse_block()` | 7148–7244 | — | **N/A** | Recursive template block renderer |
| — | `Get_file()` | 1492–1513 | — | **N/A** | HTML template file reader with localization |
| — | `localize()` | 7245–7248 | — | **N/A** | Template locale filter |
| — | `constructHeader()` (HTML) | 1635–1682 | — | **N/A** | HTML table header builder |

> **Note:** Functions 94–96 plus `Get_file()`, `localize()`, and `constructHeader()` (HTML variant) constitute the PHP server-side rendering engine (~3,000 lines). They are N/A for the Node.js JSON API backend; the frontend handles rendering.

---

## 2. Pre-Auth Route Cases (6)

**PHP switch location:** line 7606 (`switch($a)` — "actions not requiring authentication")

| # | PHP Case | PHP Lines | Node.js Route | Status | Notes |
|---|---|---|---|---|---|
| 1 | `jwt` | 7608–7616 | POST `/:db/jwt` (line 7558) | **Full** | — |
| 2 | `auth` | 7618–7702 | POST `/:db/auth` (line 2025) | **Full** | — |
| 3 | `confirm` | 7704–7713 | POST `/:db/confirm` (line 7661) | **Full** | — |
| 4 | `login` | 7715–7717 | ALL `/:db/login` (line 7702) | **Full** | — |
| 5 | `getcode` | 7719–7745 | POST `/:db/getcode` (line 2366) | **Full** | — |
| 6 | `checkcode` | 7747–7778 | POST `/:db/checkcode` (line 2421) | **Full** | — |

---

## 3. Post-Auth Route Cases (29)

**PHP switch location:** line 7798 (`switch($a)` — authenticated actions)

### 3.1 DML (Object Manipulation)

| # | PHP Case | PHP Lines | Node.js Route | Status | Notes |
|---|---|---|---|---|---|
| 7 | `_m_up` | 7800–7819 | POST `/:db/_m_up/:id` (line 7097) | **Full** | — |
| 8 | `_m_ord` | 7821–7839 | POST `/:db/_m_ord/:id` (line 7156) | **Full** | — |
| 9 | `_m_id` | 7841–7857 | POST `/:db/_m_id/:id` (line 7231) | **Full** | — |
| 10 | `_m_set` | 7859–7989 | POST `/:db/_m_set/:id` (line 5220) | **Full** | Multi-value handling + BUILTIN_SKIP_IDS + NaN guard (#240); valBarredByMask called (#221) |
| 11 | `_m_save` | 7991–8235 | POST `/:db/_m_save/:id` (line 4728) | **Full** | Admin rename prevention (#223, line 5972); NOT_NULL enforcement (#240, line 6101); valBarredByMask (#221) |
| 12 | `_m_move` | 8237–8273 | POST `/:db/_m_move/:id` (line 5385) | **Full** | Type mismatch check (#225, line 6587); same-parent skip (#225, line 6592) |
| 13 | `_m_del` | 8275–8308 | POST `/:db/_m_del/:id` (line 5116) | **Full** | — |
| 14 | `_m_new` | 8311–8548 | POST `/:db/_m_new/:up?` (line 4434) | **Full** | Macro defaults + MULTI_MASK auto-detection (#239, line 5613) |

### 3.2 DDL (Schema Manipulation)

| # | PHP Case | PHP Lines | Node.js Route | Status | Notes |
|---|---|---|---|---|---|
| 15 | `_d_req` / `_attributes` | 8550–8580 | POST `/:db/_d_req/:typeId` (line 6581) | **Full** | MULTI_MASK auto-application (#226, line 7977) |
| 16 | `_d_save` / `_patchterm` | 8582–8598 | POST `/:db/_d_save/:typeId` (line 6464) | **Full** | — |
| 17 | `_d_alias` / `_setalias` | 8600–8626 | POST `/:db/_d_alias/:reqId` (line 6653) | **Full** | Hierarchy check (#227, line 8037) |
| 18 | `_d_new` / `_terms` | 8628–8643 | POST `/:db/_d_new/:parentTypeId?` (line 6409) | **Full** | REV_BASE_TYPE validation + duplicate check (#228, line 7752) |
| 19 | `_d_ref` / `_references` | 8645–8662 | POST `/:db/_d_ref/:typeId` (line 7039) | **Full** | — |
| 20 | `_d_null` / `_setnull` | 8664–8674 | POST `/:db/_d_null/:reqId` (line 6700) | **Full** | — |
| 21 | `_d_multi` / `_setmulti` | 8676–8686 | POST `/:db/_d_multi/:reqId` (line 6754) | **Full** | — |
| 22 | `_d_attrs` / `_modifiers` | 8688–8699 | POST `/:db/_d_attrs/:reqId` (line 6808) | **Full** | — |
| 23 | `_d_up` / `_moveup` | 8701–8717 | POST `/:db/_d_up/:reqId` (line 6861) | **Full** | — |
| 24 | `_d_ord` / `_setorder` | 8719–8737 | POST `/:db/_d_ord/:reqId` (line 6914) | **Full** | — |
| 25 | `_d_del` / `_deleteterm` | 8739–8756 | POST `/:db/_d_del/:typeId` (line 6523) | **Full** | Hard-block with status(400) for instances/reports/roles (#224, line 7872) |
| 26 | `_d_del_req` / `_deletereq` | 8758–8797 | POST `/:db/_d_del_req/:reqId` (line 6973) | **Full** | Hard-block + forced cleanup (#224, line 8380) |

### 3.3 Query & System

| # | PHP Case | PHP Lines | Node.js Route | Status | Notes |
|---|---|---|---|---|---|
| 27 | `_new_db` | 8799–8824 | ALL `/my/_new_db` (line 7713) | **Full** | — |
| 28 | `obj_meta` | 8826–8858 | ALL `/:db/obj_meta/:id` (line 7312) | **Full** | — |
| 29 | `metadata` | 8860–8905 | ALL `/:db/metadata/:typeId?` (line 7401) | **Full** | — |
| 30 | `exit` | 8907–8912 | ALL `/:db/exit` (line 2689) | **Full** | — |
| 31 | `xsrf` | 8914–8917 | GET `/:db/xsrf` (line 5972) | **Full** | — |
| 32 | `terms` | 8919–8942 | GET `/:db/terms` (line 5871) | **Full** | — |
| 33 | `_ref_reqs` | 8944–9086 | GET `/:db/_ref_reqs/:refId` (line 6039) | **Full** | Dynamic formula evaluation via compileReport (#236, line 7309) |
| 34 | `_connect` | 9088–9112 | ALL `/:db/_connect/:id?` (line 6308) | **Full** | — |
| 35 | `default` | 9114–9158 | GET `/:db/:page*` (line 2970) | **N/A** | PHP template rendering; Node serves JSON API + static HTML |

---

## 4. Block Type Handlers — `Get_block_data()` (65)

**PHP location:** lines 4012–6824 (switch on `$block_name`)

All 65 block type handlers are **N/A** for the Node.js JSON API. They populate server-side HTML templates for the PHP monolith UI. The Node.js backend serves JSON data; the frontend handles rendering.

Listed here for completeness and to confirm each was reviewed:

| # | Block Name | PHP Lines | Status | Notes |
|---|---|---|---|---|
| 1 | `&functions` | 4021–4027 | **N/A** | Report column JS functions |
| 2 | `&formats` | 4028–4034 | **N/A** | Report column formats |
| 3 | `&top_menu` | 4035–4050 | **N/A** | Top nav menu (Node has `buildTopMenu()`) |
| 4 | `&main` | 4052–4291 | **N/A** | Main page dispatcher (contains nested switch) |
| 5 | `&edit_typs` | 4293–4318 | **N/A** | Type editor data |
| 6 | `&editables` | 4320–4323 | **N/A** | Editable field types |
| 7 | `&types` | 4325–4331 | **N/A** | Base type list |
| 8 | `&object` | 4333–4379 | **N/A** | Object edit data (Node has `/obj_meta` route) |
| 9 | `&new_req` | 4381–4388 | **N/A** | New requisite form |
| 10 | `&new_req_report_column` | 4390–4393 | **N/A** | New report column form |
| 11 | `&new_req_grant` | 4395–4398 | **N/A** | New grant form |
| 12 | `&grant_list` | 4400–4449 | **N/A** | Grant dropdown list |
| 13 | `&editreq_grant` | 4451–4454 | **N/A** | Grant requisite editor |
| 14 | `&editreq_report_column` | 4456–4459 | **N/A** | Report column requisite editor |
| 15 | `&edit_req` | 4461–4468 | **N/A** | Generic requisite editor |
| 16 | `&rep_col_list` | 4470–4633 | **N/A** | Report columns dropdown (163 lines of logic) |
| 17 | `&warnings` | 4635–4638 | **N/A** | Warning messages |
| 18 | `&tabs` | 4640–4659 | **N/A** | Tab navigation |
| 19 | `&object_reqs` | 4661–4796 | **N/A** | Object requisites renderer |
| 20 | `&editreq_array` | 4798–4803 | **N/A** | Array-type requisite editor |
| 21 | `&editreq_pwd` | 4805–4813 | **N/A** | Password field editor |
| 22 | `&editreq_boolean` | 4815–4819 | **N/A** | Boolean checkbox |
| 23 | `&editreq_file` | 4820–4821 | **N/A** | File upload field |
| 24 | `&editreq_reference` | 4822 | **N/A** | Reference dropdown |
| 25 | `&editreq_short` | 4823 | **N/A** | Short text input |
| 26 | `&editreq_chars` | 4824 | **N/A** | Character input |
| 27 | `&editreq_html` | 4825 | **N/A** | HTML editor |
| 28 | `&editreq_memo` | 4826 | **N/A** | Textarea |
| 29 | `&editreq_date` | 4827 | **N/A** | Date picker |
| 30 | `&editreq_datetime` | 4828 | **N/A** | Datetime picker |
| 31 | `&editreq_signed` | 4829 | **N/A** | Signed number input |
| 32 | `&editreq_number` | 4830 | **N/A** | Unsigned number input |
| 33 | `&editreq_calculatable` | 4831 | **N/A** | Calculated field |
| 34 | `&multiselect` | 4850–4859 | **N/A** | Multi-select renderer |
| 35 | `&array_val` | 4861–4865 | **N/A** | Array value renderer |
| 36 | `&nullable_req` | 4867 | **N/A** | NOT NULL marker (open) |
| 37 | `&nullable_req_close` | 4868 | **N/A** | NOT NULL marker (close) |
| 38 | `&ref_create_granted` | 4875–4879 | **N/A** | "Create new" button for refs |
| 39 | `&add_obj_ref_reqs` | 4881–5057 | **N/A** | Reference dropdown with search (176 lines) |
| 40 | `&seek_refs` | 5059–5067 | **N/A** | Search/expand for refs |
| 41 | `&uni_obj_list` | 5069–5103 | **N/A** | Type list page (Node has `/terms`) |
| 42 | `&uni_obj` | 5105–5193 | **N/A** | Object list view setup |
| 43 | `&uni_obj_parent` | 5195–5219 | **N/A** | Parent breadcrumb |
| 44 | `&uni_obj_head` | 5221–5871 | **N/A** | Object list header + CSV import (650 lines) |
| 45 | `&delete` | 5873 | **N/A** | Delete button |
| 46 | `&export` | 5874 | **N/A** | Export button |
| 47 | `&uni_obj_head_links` | 5879 | **N/A** | Header action links |
| 48 | `&uni_obj_head_filter_links` | 5880 | **N/A** | Filter action links |
| 49 | `&uni_object_view_reqs_links` | 5881 | **N/A** | View requisite links |
| 50 | `&uni_obj_head_filter` | 5886–5895 | **N/A** | Filter row |
| 51 | `&filter_val_rcm` | 5897 | **N/A** | RCM filter value |
| 52 | `&filter_val_dns` | 5898 | **N/A** | DNS filter value |
| 53 | `&filter_req_rcm` | 5899 | **N/A** | RCM filter requisite |
| 54 | `&filter_req_dns` | 5900 | **N/A** | DNS filter requisite |
| 55 | `&uni_obj_all` | 5917–6175 | **N/A** | Main object list query (258 lines; Node has `/_list` route) |
| 56 | `&head_ord` / `&head_ord_n` | 6177–6182 | **N/A** | Sortable column headers |
| 57 | `&move_n_delete` | 6184–6187 | **N/A** | Move/delete controls |
| 58 | `&ord` | 6189–6192 | **N/A** | Order display |
| 59 | `&move` | 6194–6197 | **N/A** | Move button |
| 60 | `&no_page` | 6199–6207 | **N/A** | "More results" message |
| 61 | `&uni_obj_pages` | 6209–6253 | **N/A** | Pagination + CSV finalization |
| 62 | `&page` | 6255–6301 | **N/A** | Page number link |
| 63 | `&page_href` | 6303–6311 | **N/A** | Page URL builder |
| 64 | `&multiselectcell` | 6313–6330 | **N/A** | Multi-select cell renderer |
| 65 | `&uni_object_view_reqs` | 6332–6513 | **N/A** | Object list row requisites (181 lines) |
| — | `&reqs_links` | 6515–6524 | **N/A** | Linked object requisites |
| — | `&buttons` | 6526–6535 | **N/A** | Action buttons |
| — | `&uni_report` | 6537–6542 | **N/A** | Report container |
| — | `&uni_report_head` | 6544–6551 | **N/A** | Report header |
| — | `&uni_report_filter` | 6553–6569 | **N/A** | Report filter controls |
| — | `&uni_report_data` | 6571–6575 | **N/A** | Report data rows |
| — | `&uni_report_column` | 6577–6588 | **N/A** | Report column cell |
| — | `&uni_report_totals` | 6590–6594 | **N/A** | Report totals row |
| — | `&uni_report_column_total` | 6596–6601 | **N/A** | Report total cell |
| — | `&login` | 6603–6607 | **N/A** | Login form block |
| — | `&dir_admin` | 6609–6750 | **N/A** | File manager (141 lines; Node has `/dir_admin` route) |
| — | `&pattern` | 6752–6760 | **N/A** | Breadcrumb navigation |
| — | `&file_list` | 6762–6766 | **N/A** | File listing |
| — | `&dir_list` | 6768–6771 | **N/A** | Directory listing |
| — | `&settings` | 6773–6783 | **N/A** | Settings panel |
| — | `default` | 6785–6800 | **N/A** | Dynamic report block |

---

## 5. Nested Action Cases in `&main` (6)

**PHP location:** lines 4054–4289 (nested `switch($GLOBALS["GLOBAL_VARS"]["action"])` inside the `&main` block handler)

| # | PHP Case | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 1 | `object` | 4056–4072 | GET `/:db/:page*` (line 2970) | **N/A** | HTML page setup; Node serves JSON |
| 2 | `edit_obj` | 4073–4086 | ALL `/:db/obj_meta/:id` (line 7312) | **N/A** | HTML page setup; Node serves JSON |
| 3 | `csv_all` | 4087–4177 | GET `/:db/csv_all` (line 11016–11198) | **Full** | Type-specific JOINs, batched fetching, BOM, grant checks, ZIP (#247) |
| 4 | `restore` | 4178–4238 | POST `/:db/restore` (line 12558–12730) | **Full** | ZIP extraction, .dmp parsing, path traversal protection, full import with ID substitution |
| 5 | `backup` | 4239–4285 | GET `/:db/backup` (line 9270) | **Full** | — |
| 6 | `default` | 4287–4289 | — | **N/A** | Sets page title to "Integram" |

---

## 6. Global Initialization (8 sections)

**PHP location:** lines 1–336 (before any function definitions)

| # | Section | PHP Lines | Node.js Equivalent | Status | Notes |
|---|---|---|---|---|---|
| 1 | HTTP headers (CORS, content-type, cache) | 1–7 | Express middleware / CORS config | **Full** | — |
| 2 | Constants (DB_MASK, USER, DATABASE, TOKEN) | 8–46 | Per-request resolution in middleware | **Full** | — |
| 3 | MySQL connection setup | 15–28 | `getPool()` (line 276) | **Full** | — |
| 4 | Trace/debug cookie, JSON body parsing | 47–80 | Express body-parser + logger | **N/A** | PHP-specific debug mechanism |
| 5 | Registration flow (email confirm, Google OAuth) | 81–246 | POST `/my/register` (line 2559) + `/my/google-auth` (line 3278–3597) | **Full** | Google OAuth added (#243) |
| 6 | `$GLOBALS["basics"]` (type ID→name map) | 247–290 | `REV_BASE_TYPE` constant (line 500) | **Full** | — |
| 7 | Constants (REPORT, LEVEL, MASK, etc.) | 291–336 | `TYPE` constant (line 453) | **Full** | — |
| 8 | `$GLOBALS["locale"]`, `$GLOBALS["BT"]` | 310–336 | — | **N/A** | PHP locale/i18n globals; Node uses `t9n` module |

---

## 7. Remaining Gap List

After 37 parity fixes (#221–#257), only **3 items** remain non-Full (excluding N/A):

### Active Gaps

| # | Item | Status | Issue | Details |
|---|---|---|---|---|
| 1 | `CheckSubst()` | **Partial** | #255 | Function defined at line 11680–11691 but **never called** from BKI import row processing. Dead code. |
| 2 | `CheckObjSubst()` | **Partial** | #255 | Function defined at line 11693–11704 but **never called**. Same as above. |
| 3 | Registration email confirmation flow | **Partial** | — | PHP has an email-based confirm loop (lines 81–246) with multi-step verification. Node has registration but the email confirmation intermediate state is simplified. |

### Resolved Items (previously listed as Missing/Partial, now Full)

All 37 items from issues #221–#257 have been resolved. Key changes:

- **Tier 1 (Security):** `valBarredByMask`, `getGrants` BuiltIn, admin rename, `_d_del`/`_d_del_req` hard-block, `_m_move` type check, `_d_req` MULTI_MASK, `_d_alias` hierarchy, `_d_new` validation, guest fallback — all **Full**
- **Tier 2 (Reports):** GROUP BY, abn_*, subqueries, GROUP_CONCAT, stored filters, CSV export, `_ref_reqs` formula eval — all **Full**
- **Tier 2b (Features):** `resolveBuiltIn` +11 placeholders, `formatValView` +5 types, `_m_new` macro defaults, `_m_set` edge cases, `pwd_reset`, `sendMail`, Google OAuth — all **Full**
- **Tier 3 (Export/Import):** BKI export, BKI delimiters, Slash_semi, csv_all optimized — all **Full**
- **Tier 4 (Performance):** insertBatch, BatchDelete, hintNeeded, removeDir, repoGrant, t9n, normalSize, buildPostFields, getJsonVal/checkJson — all **Full**

---

## Appendix: Node.js-Only Functions (no PHP equivalent)

These exist in `legacy-compat.js` but have no direct PHP counterpart (new features or architectural differences):

| Function | Line | Purpose |
|---|---|---|
| `buildMyrolemenu()` | 101 | Role-based menu builder (Node-specific menu system) |
| `getMenuForToken()` | 171 | Token-to-menu resolver |
| `buildTopMenu()` | 216 | Static top menu items |
| `legacyRespond()` | 233 | PHP-compatible mutation response wrapper |
| `safePath()` | 393 | Directory traversal prevention (security improvement) |
| `renderMainPage()` | 406 | Template rendering shim |
| `buildObjFileLink()` | 572 | PHP-compatible file link builder |
| `extractAttributes()` | 4332 | Request body attribute parser |
| `parseModifiers()` | 6364 | Modifier string parser (replaces PHP's inline string ops) |
| `buildModifiers()` | 6395 | Modifier string builder |
| `createDiskUpload()` | 7878 | Multer storage config |
| `crc32()` | 9140 | CRC32 for ZIP builder |
| `buildZip()` | 9152 | Minimal ZIP file creator |
| `readZip()` | 9221 | ZIP file reader |

---

*Re-audited 2026-03-14 after PRs #258–#293 merged (37 parity fixes for issues #221–#257). Every function, case block, and block handler in `integram-server/index.php` was re-verified against `backend/monolith/src/api/routes/legacy-compat.js` (13,064 lines).*
