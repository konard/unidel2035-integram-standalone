# Аудит портирования PHP → Node.js: верификация по коду
**Дата:** 2026-03-14
**Метод:** Прямое чтение и сравнение исходного кода PHP (`integram-server/index.php`, 9180 строк) и Node.js (`legacy-compat.js`, 13738 строк)
**Предыдущие отчёты:** 10 документов (`CODE_VERIFIED_AUDIT.md`, `PHP_NODE_FUNCTION_MAP.md` и др.) — заявляли «все расхождения устранены»

---

## КРИТИЧЕСКИЕ РАСХОЖДЕНИЯ (влияют на работу клиентов)

### 1. CORS: `*` vs whitelist — BREAKING CHANGE
| | PHP | Node.js |
|---|---|---|
| `Access-Control-Allow-Origin` | `*` (всегда) | Whitelist из 10 доменов |
| `Access-Control-Allow-Credentials` | не установлен | `true` |
| `Access-Control-Allow-Methods` | `POST, GET, OPTIONS` | `GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD` |
| `Access-Control-Allow-Headers` | `X-Authorization, x-authorization, Content-Type, content-type, Origin, Authorization, authorization` | `Content-Type, Authorization, X-Requested-With, X-Authorization, X-YouTube-Token, X-Integram-Token, X-Integram-XSRF` |

**Последствия:** Любой клиент, не включённый в whitelist, получит CORS-ошибку. PHP разрешал всё. Пропущен заголовок `content-type` (lowercase) из Allow-Headers. Добавлен `X-Requested-With`, которого не было в PHP.

**Файлы:** `index.php:5-7` vs `index.js` (ensureCorsHeaders)

---

### 2. Cache-Control заголовки отсутствуют
| | PHP | Node.js |
|---|---|---|
| `Cache-Control` | `no-store, no-cache, must-revalidate` | НЕ УСТАНОВЛЕН |
| `Expires` | Текущая дата (`date("r")`) | НЕ УСТАНОВЛЕН |
| `Content-Type` (по умолчанию) | `text/html; charset=UTF-8` | — (Express дефолт) |

**Последствия:** Браузеры и прокси могут кэшировать JSON-ответы Node.js-бэкенда. PHP явно запрещал кэширование.

**Файл:** `index.php:2-4` — нет аналога в Node.js

---

### 3. OPTIONS preflight — разное поведение
| | PHP | Node.js |
|---|---|---|
| Код ответа | 200 | 204 |
| Тело | пустое + `Allow: GET,POST,OPTIONS` | пустое |
| `Content-Length: 0` | ДА | НЕТ |

**Файл:** `index.php:242-246` vs Helmet/cors middleware

---

### 4. Аутентификация: отсутствует `secret` из POST/GET
**PHP (index.php:1114-1128):** Первым делом проверяет `$_POST["secret"]` и `$_GET["secret"]` — находит пользователя по типу SECRET (не TOKEN). Это отдельный flow от Bearer-токенов.

**Node.js (legacy-compat.js:3141-3200):** Обрабатывает `req.body.secret || req.query.secret` ТОЛЬКО в endpoint `ALL /:db/auth`, но НЕ в `legacyAuthMiddleware`. Middleware `extractToken()` (строки 313-317) проверяет только:
- `req.cookies[db]`
- `Authorization: Bearer <token>`
- `X-Authorization` header

**Пропущено:** `$_POST["token"]` (из тела запроса, не из заголовка) — PHP проверяет `$_POST["token"]` как вторую по приоритету опцию (строка 1123). В Node.js `extractToken()` этого нет.

**Последствия:** Клиенты, передающие `secret` или `token` в теле POST для auth middleware, получат 401.

---

### 5. Admin backdoor не портирован
**PHP (index.php:7683-7689):**
```php
if((strtolower($u) == "admin") && (sha1(sha1(SERVER_NAME.$z.$p).$z) === sha1(ADMINHASH.$z))) {
    // user_id = 0, role = "admin", token = sha1(ADMINHASH.$z)
}
```

**PHP (Validate_Token, index.php:1189-1197):** Также проверяет cookie на совпадение с `sha1(ADMINHASH.$z)`.

**Node.js:** Нет аналога. Вход `admin` пользователем через hash невозможен. Токен `sha1(ADMINHASH.$z)` не будет принят `legacyAuthMiddleware`.

**Примечание:** Это может быть НАМЕРЕННЫМ удалением (security improvement), но в отчётах не документировано.

---

### 6. Cookie: expiry 30 дней vs 360 дней (Google OAuth)
| Контекст | PHP | Node.js |
|---|---|---|
| Обычный логин | 30 дней (`COOKIES_EXPIRE`) | 30 дней |
| Google OAuth | **360 дней** (`2592000*12`) | **30 дней** |
| JWT auth (authJWT) | **360 дней** | **30 дней** |
| Secret auth | **Session** (`0`) | НЕ ПОДДЕРЖАН |

**Файлы:** `index.php:222,235,374` vs `legacy-compat.js:3533-3537`

---

### 7. `api_dump()` заголовки не воспроизведены
PHP `api_dump()` (index.php:7448) устанавливает на ВСЕ JSON API ответы:
```
Content-Type: application/json; charset=UTF-8
Content-Disposition: attachment;filename={name}
Content-Transfer-Encoding: binary
```

Node.js использует Express дефолт: `application/json; charset=utf-8` (lowercase `utf-8`). Нет `Content-Disposition` и `Content-Transfer-Encoding`.

**Последствия:** Клиенты, парсящие JSON по `Content-Disposition`, могут сломаться. Браузер может пытаться скачать JSON вместо показа (attachment).

---

## СРЕДНИЕ РАСХОЖДЕНИЯ (формат ответов)

### 8. Auth POST response: несовпадение полей
| | PHP (index.php:7695) | Node.js (legacy-compat.js:3542) |
|---|---|---|
| Поля | `{_xsrf, token, id, msg}` | `{_xsrf, token, id, msg}` |
| Тип `id` | String (`"123"`, из MySQL) | String (`String(user.uid)`) |

**MATCH** для POST auth. Но GET auth (Node.js-only, строка 3134) возвращает `id: Number(u.uid)` — **Number** вместо String. Несовместимость с POST auth форматом.

---

### 9. Auth error: разный текст сообщения
| | PHP | Node.js |
|---|---|---|
| Ошибка auth | `"Неверный логин или пароль {user} @ {db}. Логин и пароль следует отправлять POST-параметрами."` | `"Invalid login or password"` |
| Формат | `[{"error":"..."}]` | `[{"error":"..."}]` |

**Файлы:** `index.php:7691` vs `legacy-compat.js:3570`

PHP ошибка **включает имя пользователя и базу** в текст ошибки. Node.js — нет. Это может ломать клиентов, парсящих текст ошибки.

---

### 10. `xsrf` ошибка: `id` тип непоследователен
| Контекст | `id` тип в Node.js |
|---|---|
| Успех (строка 7985) | `String(user.uid)` — string |
| Ошибка — нет токена (строка 7950) | `0` — **number** |
| Ошибка — invalid token (строка 7970) | `'0'` — string |
| Ошибка — exception (строка 7990) | `0` — **number** |

PHP всегда возвращает string (из MySQL) или 0 (число) для admin. Node.js непоследователен в своих собственных ошибках.

---

### 11. `_d_main` и `_dict`, `_list`, `_list_join` — нет auth middleware
| Endpoint | PHP auth | Node.js auth |
|---|---|---|
| `_d_main` | Требует `Validate_Token()` | **НЕТ** (`router.all`, без middleware) |
| `_dict` | Требует `Validate_Token()` | **НЕТ** |
| `_list` | Требует `Validate_Token()` | **НЕТ** |
| `_list_join` | Требует `Validate_Token()` | **НЕТ** |
| `export/:typeId` | Требует `Validate_Token()` | **НЕТ** |

**Файлы:**
- `legacy-compat.js:7441` (`_dict`)
- `legacy-compat.js:7511` (`_list`)
- `legacy-compat.js:7654` (`_list_join`)
- `legacy-compat.js:7756` (`_d_main`)
- `legacy-compat.js:11479` (`export/:typeId`)

**Последствия:** Данные всех типов, объектов и их значения доступны без аутентификации. Любой может прочитать всю базу.

**PHP:** Все эти endpoints выполняются ПОСЛЕ `Validate_Token()` (строка 1114), которая вызывается на строке ~7789 перед switch. Без валидного токена PHP перенаправляет на страницу логина.

---

### 12. `_ref_reqs` ответ: простой формат vs вложенный
**PHP (index.php:8944-9086):** Возвращает плоский объект `{id: "display_value", ...}` где ключ — ID объекта, значение — склеенная строка `"main_val / req1_val / req2_val"`.

**Node.js (legacy-compat.js:8074-8077):** Возвращает плоский объект `{id: "val"}`. **Формат совпадает** для простых случаев, но:
- При наличии **формулы/отчёта** (PHP строки 8980-9086): PHP вычисляет через REQREF[$N] макросы. Node.js пытается запустить отчёт, но сложная логика формул (REQREF, REQVAL, %search%) не полностью воспроизведена.
- Значения `--` для пустых реквизитов: PHP выводит `" / --"`, Node.js выводит `"--"` (без пробела и слэша).

---

### 13. `report` JSON format — разные имена полей
**Default JSON (не JSON_DATA/JSON_KV/JSON_CR):**

| | PHP | Node.js |
|---|---|---|
| Столбцы | `"columns"` | `"columns"` |
| Данные | `"rows":{0:{...},1:{...}}` (объект с числовыми ключами) | `"data":[[col0_values],[col1_values]]` (column-major массив) |
| Счётчик | `"totalCount"` | `"rownum"` |
| Заголовок | `"header"` | `"title"` |
| Подвал | `"footer":["..."]` | — (отсутствует) |
| Поле `granted` в колонке | `"granted":1` | отсутствует |

**Файлы:** `index.php:4592-4750` (report rendering) vs `legacy-compat.js:11090+`

---

### 14. `terms` response format
**PHP (index.php:8919-8926):** Возвращает `[{"id":N,"type":N,"name":"..."},...]`

**Node.js:** Нужно проверить. Agent report не показал точный формат — endpoint на строке 7843 с `legacyAuthMiddleware`.

---

### 15. Security headers: Node.js добавляет Helmet
Node.js добавляет заголовки, которых нет в PHP:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security`
- `Referrer-Policy`
- `Content-Security-Policy`
- `Permissions-Policy`

**Это не баг — это improvement, но может сломать встраивание в iframe (X-Frame-Options: DENY).**

---

## НИЗКИЕ РАСХОЖДЕНИЯ (edge cases)

### 16. Password salt env variable inconsistency
В самом Node.js коде есть два разных env variable для соли:
- `legacy-compat.js:595`: `process.env.AUTH_SALT || 'DronedocSalt2025'` (через PHP_SALT)
- Agent #2 report: упоминает `process.env.INTEGRAM_SALT || 'default_salt'`

PHP использует константу `DronedocSalt2025`. Если env variable не установлен, Node.js совпадает. Если установлен неверно — все хэши паролей будут несовместимы.

---

### 17. Guest XSRF — разный второй аргумент
| | PHP | Node.js |
|---|---|---|
| Guest XSRF | `xsrf("gtuoeksetn", "guest")` = `sha1(SALT + GTUOEKSETN + db + guest)` | `generateXsrf('gtuoeksetn', 'guest', db)` = `sha1(SALT + GTUOEKSETN + db + guest)` |

**MATCH.** Совпадает.

---

### 18. `_m_new` — `val` из параметра vs из `t{typeId}`
**PHP:** Значение объекта берётся из `$_POST["val"]` ИЛИ `$_POST["t{typeId}"]`. Если оба пустые — пустая строка.

**Node.js (строка 6195+):** Берёт `req.body.val` или `req.body['t' + typeId]`. Нужно подтвердить приоритет.

---

### 19. `_m_save` — boolean handling (`b{reqId}`)
**PHP:** Явно проверяет `$_POST["b{reqId}"]` для boolean-реквизитов (checkbox). Если не установлен — ставит 0.

**Node.js:** Проверяет `req.body['b' + reqId]`. Нужно подтвердить логику.

---

### 20. `_new_db` — валидация имени
| | PHP | Node.js |
|---|---|---|
| Regex | `/^[a-z]\w{2,14}$/i` | `isValidDbName()` — нужно проверить |
| Reserved words check | Список SQL reserved words | Нужно проверить |
| Min length | 3 | Нужно проверить |

---

### 21. Upload: auth и валидация
| | PHP (`upload.php`) | Node.js (`legacy-compat.js:10012`) |
|---|---|---|
| Auth | **НЕТ** | `legacyAuthMiddleware` + WRITE grant |
| Size limit | Без ограничений | 10 MB |
| Type check | Без ограничений | Whitelist расширений + magic bytes |
| Upload dir | `/tmp/uploads/` | `download/{db}/` |

Это **намеренное security improvement**, но ломает обратную совместимость — клиенты, полагающиеся на отсутствие auth для upload, получат 401.

---

## СВОДНАЯ ТАБЛИЦА

| # | Расхождение | Severity | Файлы | Статус в отчётах |
|---|---|---|---|---|
| 1 | CORS wildcard → whitelist | CRITICAL | index.php:5-7, index.js | **НЕ УПОМЯНУТО** |
| 2 | Cache-Control отсутствует | CRITICAL | index.php:2-4 | **НЕ УПОМЯНУТО** |
| 3 | OPTIONS 200→204 | MEDIUM | index.php:242 | **НЕ УПОМЯНУТО** |
| 4 | `secret`/POST `token` auth не в middleware | CRITICAL | index.php:1114-1128 | **НЕ УПОМЯНУТО** |
| 5 | Admin backdoor не портирован | HIGH | index.php:7683-7689 | **НЕ УПОМЯНУТО** |
| 6 | Cookie expiry 360→30 дней (OAuth) | MEDIUM | index.php:222 | **НЕ УПОМЯНУТО** |
| 7 | `api_dump()` заголовки отсутствуют | MEDIUM | index.php:7448 | **НЕ УПОМЯНУТО** |
| 8 | GET auth `id` Number vs String | LOW | legacy-compat.js:3134 | **НЕ УПОМЯНУТО** |
| 9 | Auth error текст без user@db | LOW | index.php:7691 | **НЕ УПОМЯНУТО** |
| 10 | `xsrf` error `id` тип непоследователен | LOW | legacy-compat.js:7950,7990 | **НЕ УПОМЯНУТО** |
| 11 | `_d_main/_dict/_list/export` без auth | **CRITICAL** | legacy-compat.js:7441-7756,11479 | `_d_main` упомянут как P2 |
| 12 | `_ref_reqs` формулы/отчёт не полностью | MEDIUM | legacy-compat.js:8094+ | Частично упомянуто |
| 13 | `report` JSON: `rows`→`data`, `totalCount`→`rownum` | HIGH | legacy-compat.js:11090+ | **НЕ УПОМЯНУТО** |
| 14 | `terms` format | LOW | legacy-compat.js:7843 | **НЕ УПОМЯНУТО** |
| 15 | Helmet headers ломают iframe | MEDIUM | index.js | **НЕ УПОМЯНУТО** |

---

## ЗАКЛЮЧЕНИЕ

Предыдущие отчёты утверждали, что «все 13 расхождений исправлены» и портирование на уровне ~100%. **Это не соответствует действительности.**

Обнаружено **15 реальных расхождений**, из которых:
- **4 CRITICAL** (CORS, Cache-Control, secret auth, публичные endpoints без auth)
- **3 HIGH** (admin backdoor, report JSON format, cookie expiry)
- **5 MEDIUM** (OPTIONS, api_dump headers, _ref_reqs формулы, Helmet/iframe)
- **3 LOW** (id типы, error текст, terms format)

Из 15 расхождений **13 не были упомянуты ни в одном из 10 предыдущих отчётов**.

### Приоритеты исправления

1. **P0 (блокер):** #11 — `_dict`, `_list`, `_list_join`, `_d_main`, `export` без auth → утечка данных
2. **P0 (блокер):** #1 — CORS whitelist ломает клиентов вне списка
3. **P1:** #4 — `secret`/POST `token` auth не работает в middleware
4. **P1:** #13 — report JSON format полностью другой (`rows`→`data`, `totalCount`→`rownum`)
5. **P2:** #2 — Cache-Control отсутствует (кэширование API ответов)
6. **P2:** #6 — Cookie expiry для OAuth (360→30 дней)
7. **P2:** #7 — `api_dump()` заголовки
8. **P3:** Остальные
