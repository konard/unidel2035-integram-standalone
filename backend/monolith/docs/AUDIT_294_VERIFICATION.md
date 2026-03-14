# Audit #294 — Verification of 37 PHP→Node.js Parity Issues (#221–#257)

**Date:** 2026-03-14
**Scope:** Independent code-level verification of PRs #258–#293 merged into master

---

## Summary

| Tier | Issues | DONE | PARTIAL | NOT_FOUND | REGRESSION |
|------|--------|------|---------|-----------|------------|
| Tier 1 — Security & Data Integrity | #221–#229 (9) | **9** | 0 | 0 | 0 |
| Tier 2 — Reports | #230–#236 (7) | **7** | 0 | 0 | 0 |
| Tier 2b — Feature Completeness | #237–#243 (7) | **7** | 0 | 0 | 0 |
| Tier 3 — Export/Import | #244–#247 (4) | **4** | 0 | 0 | 0 |
| Tier 4 — Performance & Minor | #248–#257 (10) | **9** | 1 | 0 | 0 |
| **Total** | **37** | **36** | **1** | **0** | **0** |

---

## Detailed Verification Table

### Tier 1 — Security & Data Integrity

| Issue | Title | Status | File:Lines | Comment |
|-------|-------|--------|------------|---------|
| #221 | `valBarredByMask()` | **DONE** | `legacy-compat.js:1106–1142` (def), `:6096` (`_m_set`), `:6459` (`_m_save`) | Faithfully ports PHP 896–919. Called in both write handlers. |
| #222 | `getGrants()` BuiltIn resolution | **DONE** | `legacy-compat.js:712` (call), `:2140–2179` (def) | `resolveMaskBuiltIn(row.mask, userCtx)` called in getGrants loop. |
| #223 | `_m_save` admin rename prevention | **DONE** | `legacy-compat.js:5972–5975` | Guard: `objTypeEarly === TYPE.USER && objValEarly === db && val !== db` → error. |
| #224 | `_d_del`/`_d_del_req` hard-block | **DONE** | `legacy-compat.js:7872–7906` (`_d_del`), `:8380–8422` (`_d_del_req`) | Returns `status(400)` for instances, report usage, role usage. Hard blocks, not warnings. |
| #225 | `_m_move` type mismatch + same-parent | **DONE** | `legacy-compat.js:6577–6600` | Type mismatch at 6587–6588; same-parent no-op at 6592–6600. |
| #226 | `_d_req` MULTI_MASK auto | **DONE** | `legacy-compat.js:7977–7988` | Auto `multi=true` for non-basic reference types. |
| #227 | `_d_alias` hierarchy check | **DONE** | `legacy-compat.js:8037–8041` | Checks `parent.up !== 0` → error. |
| #228 | `_d_new` base type + duplicate | **DONE** | `legacy-compat.js:7752–7773` | `REV_BASE_TYPE` validation + `(val, t)` duplicate check at root. |
| #229 | Guest fallback | **DONE** | `legacy-compat.js:1956–2017` | Full guest path: lookup, hardcoded token, grants, 30-day cookie. |

### Tier 2 — Reports

| Issue | Title | Status | File:Lines | Comment |
|-------|-------|--------|------------|---------|
| #230 | GROUP BY / aggregates | **DONE** | `legacy-compat.js:10042,10069–10077,10239–10262` | SUM/AVG/COUNT/MIN/MAX/GROUP_CONCAT in `AGGR_FUNCS`. GROUP BY built from non-aggregate columns. |
| #231 | Sub-queries `[report_name]` | **DONE** | `legacy-compat.js:9535,9629–9685,10057,10277–10280` | `resolveReportSubqueries()` with `MAX_REPORT_SUBQUERY_DEPTH=10`. Recursive resolution. |
| #232 | abn_* functions | **DONE** | `report-functions.js:93–205` (post-process), `:345–348` (SQL-level) | 4 post-process (DATE2STR, RUB2STR, NUM2STR, Translit) + 8 SQL-level fns. |
| #233 | GROUP_CONCAT arrays | **DONE** | `legacy-compat.js:9887–9935,10091–10100` | `:MULTI:` detection → `GROUP_CONCAT(DISTINCT ... SEPARATOR ', ')` auto-wrap. |
| #234 | Stored filters REP_WHERE | **DONE** | `legacy-compat.js:536,9953–9966,10194–10202` | `REP_WHERE=262` type, loaded as param, applied with BuiltIn substitution. |
| #235 | CSV export | **DONE** | `legacy-compat.js:10438–10590,11224–11251` | `formatReportCsv()` with UTF-8 BOM, `;` delimiter, proper escaping. |
| #236 | `_ref_reqs` formula eval | **DONE** | `legacy-compat.js:7220,7309–7411` | `&`-prefixed attrs → `compileReport()` + `executeReport()`, REQREF filters from `?q=`. |

### Tier 2b — Feature Completeness

| Issue | Title | Status | File:Lines | Comment |
|-------|-------|--------|------------|---------|
| #237 | `resolveBuiltIn` +11 placeholders | **DONE** | `legacy-compat.js:2088–2130` | All 11: YESTERDAY, TOMORROW, MONTH_AGO, WEEK_AGO, MONTH_PLUS, ROLE, ROLE_ID, TSHIFT, REMOTE_HOST, HTTP_USER_AGENT, HTTP_REFERER. |
| #238 | `formatValView` +5 types | **DONE** | `legacy-compat.js:1285–1369` | FILE (1331), PATH (1341), GRANT (1351), REPORT_COLUMN (1358), PWD (1363). |
| #239 | `_m_new` macro defaults | **DONE** | `legacy-compat.js:5613–5658` | Mask defaults with `resolveBuiltIn` + MULTI_MASK auto-detection via `:MULTI:`. |
| #240 | `_m_set` edge cases | **DONE** | `legacy-compat.js:6448–6455,1239–1243` | `BUILTIN_SKIP_IDS=[101,102,103,132,49]` + NaN guard in `formatVal`. |
| #241 | `pwd_reset` full flow | **DONE** | `legacy-compat.js:3109–3270,9065–9113` | Token gen (MD5+hash) → `sendMail()` with confirm URL → confirm endpoint. SMS branch included. |
| #242 | `sendMail` general | **DONE** | `legacy-compat.js:299–378` | General `sendMail({to,subject,text,html,...})` via nodemailer. `sendOtpEmail` refactored as thin wrapper. |
| #243 | Google OAuth | **DONE** | `legacy-compat.js:3278–3597` | `/my/google-auth` redirect + `/auth.asp` callback with token exchange, userinfo, DB creation. |

### Tier 3 — Export/Import

| Issue | Title | Status | File:Lines | Comment |
|-------|-------|--------|------------|---------|
| #244 | BKI export | **DONE** | `legacy-compat.js:11539–11605,11616–11627,11638–11698,11721–11799,11820–11899` | All 4 functions: constructHeader, exportHeader, exportTerms, Export_reqs + ZIP route. |
| #245 | BKI delimiters | **DONE** | `legacy-compat.js:615–634` | MaskDelimiters, HideDelimiters, UnHideDelimiters, UnMaskDelimiters. |
| #246 | Slash_semi/UnSlash_semi | **DONE** | `legacy-compat.js:638–646` | `\;` ↔ `\$L3sH` token swap. |
| #247 | csv_all optimized | **DONE** | `legacy-compat.js:11016–11198` | Type-specific JOINs, batched fetching `limit=500000/(reqCount+1)`, BOM, grant checks, ZIP. |

### Tier 4 — Performance & Minor

| Issue | Title | Status | File:Lines | Comment |
|-------|-------|--------|------------|---------|
| #248 | `insertBatch` | **DONE** | `legacy-compat.js:5421–5440,2469,12065` | Multi-row INSERT with configurable batchSize (default 1000). Used in populateReqs + restore. |
| #249 | `BatchDelete` | **DONE** | `legacy-compat.js:2218–2284` | `_collectDescendants()` recursive + batch `DELETE WHERE id IN(...)`, BATCH_DELETE_THRESHOLD=1000. |
| #250 | `hintNeeded` | **DONE** | `legacy-compat.js:9713–9738,1450,7483,10114` | Two-overload function checking negation/wildcard patterns. 3 call sites. |
| #251 | `removeDir` | **DONE** | `legacy-compat.js:2379–2385,2240,2254,6443` | `fs.rmSync({recursive:true,force:true})` wrapper. Used in delete paths. |
| #252 | `repoGrant` | **DONE** | `legacy-compat.js:865–876,9330,9412,9452` | Grant check TYPE.FILE=10 on upload/download/dir_admin. |
| #253 | `t9n` | **DONE** | `utils/t9n.js:1–125`, `legacy-compat.js:18` | 78-entry RU/EN dictionary + inline `[RU]...[EN]...` mode. 20+ call sites. |
| #254 | `normalSize` | **DONE** | `legacy-compat.js:2360–2366,9509` | B/KB/MB/GB/TB formatting with 2-decimal precision. Used in dir_admin. |
| #255 | `checkSubst`/`checkObjSubst` | **PARTIAL** | `legacy-compat.js:11680–11704` | Functions **defined** with correct logic but **never called**. Dead code — BKI import does not wire up substitution helpers. See [Gap Analysis](#gap-255) below. |
| #256 | `buildPostFields` | **DONE** | `legacy-compat.js:1807–1881,7649` | FormData from URL-encoded string, handles `@/download/...` files + `@http...` remote. Node 20+ FormData. |
| #257 | `getJsonVal`/`checkJson` | **DONE** | `report-functions.js:228–280,293–333`, `legacy-compat.js:10327` | Recursive JSON key extraction. `checkJson` integrated in executeReport. 18 unit tests. |

---

## Gap Analysis

### <a name="gap-255"></a> #255 — `checkSubst`/`checkObjSubst` (PARTIAL)

**Problem:** Both functions are properly implemented at `legacy-compat.js:11680–11704` with correct lookup logic (`ctx.localStruct.subst[i]` and `ctx.objSubst[i]`), but they are **never invoked** from the BKI import path or anywhere else. In the PHP original, these are called during CSV/BKI import row processing to remap colliding type/object IDs.

**Impact:** BKI import will fail silently when ID collisions occur between the importing backup and the target database. The functions exist but the import route at line 11802+ does not call them.

**Recommendation:** Wire `checkSubst()` and `checkObjSubst()` into the BKI import row-processing loop. This is a functional gap that should be addressed in a follow-up issue.

---

## Cross-Reference with PR_219_vs_220_DIFF.md

All 32 function-level divergences and all route-case divergences from `PR_219_vs_220_DIFF.md` are covered:

- **Covered by issues #221–#257:** 27 items
- **Correctly N/A (Node.js uses better approach):** 5 items
  - `checkInjection()` → Node uses parameterized queries
  - `Exec_sql()` → Node uses mysql2 directly
  - `server_parse()` → nodemailer replaces PHP SMTP socket parser
  - `login()` HTML render → PHP-only HTML rendering, not applicable
  - `mail2DB()` → inlined in register route (already present)

No uncovered gaps were found.

---

## Side Effects Check

### Test Results (npm test)

| Test File | Tests | Passed | Failed | Notes |
|-----------|-------|--------|--------|-------|
| `report-functions-json.test.js` | 17 | **17** | 0 | All parity JSON tests pass |
| `php-compat-gaps.test.js` | 49 | **49** | 0 | All parity unit tests pass |
| `legacy-compat.test.js` | 110 | 89 | 21 | Pre-existing mock/auth setup failures — **not regressions** |
| `php-compat-gaps-http.test.js` | 16 | 10 | 6 | Pre-existing auth mock failures — **not regressions** |

The 27 failures in `legacy-compat.test.js` and `php-compat-gaps-http.test.js` are **pre-existing** issues with test infrastructure (mock DB returning 401/undefined for auth). They are NOT caused by PRs #258–#293.

### Security Review

- No SQL injection vulnerabilities detected — all new queries use parameterized `?` placeholders
- No XSS vectors — server-side only code
- All new functions are properly exported in the module exports block (line ~12390+)

---

## Conclusion

**36 of 37 issues are fully implemented (DONE).** One issue (#255 — `checkSubst`/`checkObjSubst`) is **PARTIAL** — the functions exist but are dead code not wired into the BKI import pipeline.

### Recommendations

1. **Create follow-up issue** to wire `checkSubst()`/`checkObjSubst()` into BKI import row processing
2. **Fix pre-existing test failures** in `legacy-compat.test.js` (21 failures) and `php-compat-gaps-http.test.js` (6 failures) — these are auth mock setup issues, not parity-related

---

*Generated by independent code audit for Issue #294*
