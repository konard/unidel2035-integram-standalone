# PR #219 vs PR #220 — Различия в оценках

Совпадающие записи вычеркнуты. Ниже только строки, где PR расходятся в статусе или деталях.

---

## 1. Функции — расхождения в статусе

| # | PHP Function | PHP Lines | PR #219 Status | PR #220 Status | Кто прав? |
|---|---|---|---|---|---|
| 4 | `Validate_Token()` | 1114–1286 | **Full** | **Partial** — нет Basic auth, guest fallback, admin hash bypass, activity tracking | ? |
| 10 | `getGrants()` | 1287–1325 | **Full** | **Partial** — нет `BuiltIn()` resolution в масках | ? |
| 10/14 | `login()` | 472–492 | **Full** | **N/A** — PHP рендерит HTML login | ? |
| 15/24 | `pwd_reset()` | 7369–7437 | **Partial** | **Stub** — нет смены пароля, нет email | ? |
| 18/35 | `Val_barred_by_mask()` | 896–919 | **Full** — "Used in checkValGranted()" | **Missing** — маска write-ограничений не реализована | ? |
| 25 | `BatchDelete()` | 1529–1573 | **Partial** — "Non-recursive flat delete" | **Missing** — Performance-only | ? |
| 29 | `Get_Current_Values()` | 6977–7010 | **Partial** — "Less comprehensive" | **Full** — Inlined in edit route | ? |
| 3 | `createDb()` | 350–362 | **Full** | **Partial** — нет template SQL import | ? |
| 5 | `newDb()` | 385–421 | **Partial** — "Template-based DB creation simplified" | **Partial** — "No admin user/role setup" | = (оба Partial, разные описания) |
| 31 | `Format_Val_View()` | 1399–1490 | **Full** | **Partial** — нет FILE/PATH link, GRANT/REPORT_COLUMN display, PWD masking | ? |
| 33 | `BuiltIn()` | 1576–1618 | **Full** | **Partial** — 11 плейсхолдеров не реализованы | ? |
| 50 | `Exec_sql()` | 508–533 | **Partial** — "Missing timing/logging" | **N/A** — PHP wrapper, Node uses mysql2 | ? |
| 2 | `mail2DB()` | 341–349 | **Missing** | **Full** — Inlined in register route | ? |
| 55 | `RemoveDir()` | 596–616 | **Full** — "fs.rmSync() inline" | **Missing** — Recursive dir removal | ? |
| 58 | `checkInjection()` | 617–622 | **Full** — "Parameterized queries" | **Missing** — Node uses parameterized (better approach) | ? |
| 66 | `smtpmail()` | 7263–7346 | **Full** | **Partial** — OTP-only, нет general-purpose | ? |
| 67 | `server_parse()` | 7348–7361 | **Full** — "Inside nodemailer" | **N/A** — SMTP socket parser; Node uses nodemailer | ? |
| 68 | `mysendmail()` | 7362–7368 | **Full** | **Partial** — OTP only | ? |
| 71 | `t9n()` | 560–572 | **Stub** — "returns first lang only" | **Missing** — нет i18n | ? |
| 91 | `ResolveType()` | 3970–3990 | **Full** — "Inline type checks" | **Missing** — BKI import system | ? |
| 89 | `FetchAlias()` | 3959–3962 | **Missing** | **Full** — `parseModifiers()` | ? |
| 67 | `maskCsvDelimiters()` | 4005–4011 | **Full** | **Partial** — Different quoting approach | ? |

### Экспорт/Импорт функции — серьёзное расхождение

| # | PHP Function | PHP Lines | PR #219 Status | PR #220 Status | Кто прав? |
|---|---|---|---|---|---|
| 43 | `exportHeader()` | 1683–1689 | **Full** — "Inline in CSV export" | **Missing** — BKI export header | ? |
| 44 | `exportTerms()` | 1690–1706 | **Full** — "Inline in backup handler" | **Missing** — BKI type definition exporter | ? |
| 45 | `Export_reqs()` | 1708–1749 | **Full** — "Inline in backup handler" | **Missing** — BKI requisite exporter | ? |
| 82 | `constructHeader()` | 1635–1682 | **Full** — "Inline in export" | **Missing** — BKI export header builder | ? |

---

## 2. Route Cases — расхождения

PR #219 помечает почти все DML/DDL как **Full**. PR #220 находит конкретные пробелы.

### DML Routes

| # | PHP Case | PR #219 Status | PR #220 Status | PR #220 что именно Missing | Кто прав? |
|---|---|---|---|---|---|
| `_m_set` | 7859–7989 | **Full** | **Partial** | Multi-value array handling, BuiltIn type ID skip, NUMBER/SIGNED pre-cast | ? |
| `_m_save` | 7991–8235 | **Full** | **Partial** | MULTI ref skip, CheckRepColGranted for REP_COL, admin rename prevention, NOT_NULL enforcement, search redirect | ? |
| `_m_move` | 8237–8273 | **Full** | **Partial** | Type mismatch check, metadata protection, same-parent skip | ? |
| `_m_new` | 8311–8548 | **Full** | **Partial** | Default value from type masks/calculatables, MULTI_MASK auto-detection | ? |

### DDL Routes

| # | PHP Case | PR #219 Status | PR #220 Status | PR #220 что именно Missing | Кто прав? |
|---|---|---|---|---|---|
| `_d_req` | 8550–8580 | **Full** | **Partial** | Base-type hierarchy validation, self-requisite check, MULTI_MASK auto-application | ? |
| `_d_alias` | 8600–8626 | **Full** | **Partial** | Hierarchy check (parent.up=0), alias manipulation preserving trailing masks | ? |
| `_d_new` | 8628–8643 | **Full** | **Partial** | Base type validation against `$GLOBALS["basics"]`, combined val+t duplicate check | ? |
| `_d_del` | 8739–8756 | **Full** | **Partial** | Instance count hard-block vs soft (die vs warn); report/role usage checks soft | ? |
| `_d_del_req` | 8758–8797 | **Full** | **Partial** | Ref vs base-type usage count; no report/role usage checks; forced cleanup missing | ? |

### Query & System

| # | PHP Case | PR #219 Status | PR #220 Status | PR #220 что Missing | Кто прав? |
|---|---|---|---|---|---|
| `_ref_reqs` | 8944–9086 | **Partial** — "Missing some grant mask" | **Partial** — No dynamic formula, simplified mask filtering | = (оба Partial, #220 детальнее) |
| `_new_db` | 8799–8824 | **Partial** | **Partial** | = |

---

## 3. Структурные различия в классификации

| Аспект | PR #219 | PR #220 | Комментарий |
|---|---|---|---|
| Route cases total | 42 (включая template routes как top-level) | 35 (pre-auth 6 + post-auth 29) | PR #219 смешивает top-level routes c nested `&main` actions |
| Block handlers | 82 | 65 | PR #219 считает больше — возможно включает дубли |
| Nested `&main` actions | Не выделены (смешаны в routes) | 6 (отдельная категория) | PR #220 структурно правильнее |
| Init sections | 5 | 8 | PR #220 детальнее |
| `include/funcs.php` | 5 функций (отдельная секция) | Не отдельная секция, упомянуты в gap list | PR #219 выделяет явно |
| Node.js-only functions | Не перечислены | 13 функций (Appendix) | PR #220 полнее |

---

## 4. Категории для верификации

Нужно проверить по исходному коду, кто прав:

### Приоритет 1 — Безопасность

| Функция | Вопрос | Как проверить |
|---|---|---|
| `Val_barred_by_mask()` | Реализована или нет? #219 говорит Full, #220 говорит Missing | Grep `barred` или `mask.*write` в legacy-compat.js |
| `Validate_Token()` | Есть ли Basic auth, guest fallback? | Grep `legacyAuthMiddleware` и проверить ветки |
| `getGrants()` | Есть ли BuiltIn() resolution в масках? | Читать `getGrants()` в Node |
| `_m_save` NOT_NULL enforcement | Есть ли цикл проверки? | Читать `_m_save` route |

### Приоритет 2 — Функциональность

| Функция | Вопрос | Как проверить |
|---|---|---|
| `BuiltIn()` / `resolveBuiltIn()` | Сколько плейсхолдеров реализовано? | Grep `resolveBuiltIn` |
| `Format_Val_View()` | Есть ли FILE/PATH/GRANT обработка? | Grep `formatValView` |
| Export functions (`exportHeader`, `exportTerms`, `Export_reqs`) | Inlined в backup или Missing? | Grep в backup route |
| `RemoveDir()` | Используется `fs.rmSync` или нет? | Grep `rmSync\|removeDir\|rmdir` |
| `mail2DB()` | Inlined в register или Missing? | Grep register route |

### Приоритет 3 — Классификация

| Функция | Вопрос | Как проверить |
|---|---|---|
| `checkInjection()` | Full (parameterized = лучше) или Missing? | Философский: Node подход лучше, но функция как таковая отсутствует |
| `Exec_sql()` | Partial или N/A? | Node wrapper vs native |
| `server_parse()` | Full (inside nodemailer) или N/A? | Nodemailer заменяет |
| Block handlers count | 82 или 65? | Пересчитать в PHP |

---

*Создано для верификации расхождений между PR #219 (konard) и PR #220 (judas-priest).*
