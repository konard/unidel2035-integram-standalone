# Code-Verified Audit: PHP vs Node.js API

**Дата:** 2026-03-14
**Метод:** Каждый пункт верифицирован прямым чтением кода агентами. Никакие предыдущие отчёты не использовались как источник истины.

**PHP:** `integram-server/index.php` (~9181 строк)
**Node.js:** `backend/monolith/src/api/routes/legacy-compat.js` (~13908 строк)

---

## Безопасность: XSRF / Auth / Grants

Верифицировано прямым чтением кода — **реализовано корректно:**

- `legacyXsrfCheck` (line 2517-2532) — реальная проверка `req.body._xsrf === req.legacyUser.xsrf`, применена ко всем 20 POST-маршрутам `_m_*` и `_d_*`.
- `legacyAuthMiddleware` (line 2391-2508) — реальный DB lookup токена, guest fallback, 401 при отсутствии.
- `checkGrant()` (line 1182) — рекурсивная проверка по цепочке родителей, вызывается в каждом `_m_*` хэндлере (8 маршрутов).
- `legacyDdlGrantCheck` (line 2578) — на всех 12 `_d_*` POST-маршрутах, требует `WRITE`.

**Один gap:** `_d_main` (line 7769, `router.all('/:db/_d_main/:typeId')`) — **без middleware** (read-only метаданные типа, но без auth).

---

## VERIFIED — Реальные расхождения (13 штук)

### 1. Формат ошибок: массив vs объект
**PHP** (`my_die`, line 994): `[{"error":"msg"}]` — массив.
**Node.js**: `{"error":"msg"}` — объект.
**Legacy HTML-шаблоны** (`login.html:364`, `index.html:348`, `edit_types.html:614`, `vah.html:348`) обращаются к `json[0].error` — сломается с Node.js форматом.
Исключение: `edit_obj.html:574` использует `json.error`.

### 2. Токен при логине: reuse vs regenerate
**PHP** (`updateTokens`, line 363-383): если токен существует (`$row["tok"]`), **переиспользует** его.
**Node.js** (line 3385-3397): **всегда генерирует новый** токен, удаляя старый. Комментарий в коде «PHP: always generates fresh token» — **ложный**.

### 3. obj_meta при отсутствии объекта
**PHP** (line 8826-8857): нет явной обработки not found — выдаёт битый JSON с HTTP 200.
**Node.js** (line 9574-9576): `res.status(200).json({ error: 'not found' })` — чистый JSON, но формат `{error}` вместо `[{error}]`.

### 4. Report JSON_CR формат
**PHP** (line 3756+): `rows` — **объект** с числовыми ключами. Баг в типизации: переменная `$key` перезаписывается в цикле.
**Node.js**: Две реализации — одна (line 11461) возвращает объект по `row.id` с кастом чисел, другая (line 13805) — массив. Нет единообразия.

### 5. xsrf поле `id`: строка vs число
**PHP** (line 8915): `$GLOBALS["GLOBAL_VARS"]["user_id"]` → `json_encode` выдаёт **строку** `"id":"123"`.
**Node.js** (line 8009): `Number(user.uid)` → **число** `"id":123`.

### 6. `_d_ord` ответ: id/obj
**PHP** (line 8727-8733): `$id` = parentId **только если порядок реально изменился**. Если не изменился — `$id` остаётся reqId.
**Node.js** (line 9140): **всегда** возвращает `parentId`.

### 7. `_m_up`/`_d_up` swap: matching by ord vs id
**PHP** (line 7800-7814): один `UPDATE...CASE WHEN` с `WHERE ord=X OR ord=Y` — по **значениям порядка**.
**Node.js** (line 9359-9361): один `UPDATE...CASE WHEN` с `WHERE id IN (?, ?)` — по **ID строк**.
Оба атомарные, но при дубликатах `ord` PHP обновит все совпавшие строки, Node — только две.

### 8. `_m_new` дефолты — 5 подрасхождений
a) **NUMBER не-unique**: PHP `$val = 1`, Node — пустая строка.
b) **NUMBER MAX+1 scope**: PHP `WHERE t=$id AND up=$up` (по родителю), Node `WHERE t = ?` (глобально).
c) **Reuse пустого NUMBER-объекта**: PHP переключается на edit существующего, Node — нет.
d) **DATE формат**: PHP `Format_Val(date("d"))`, Node `YYYYMMDD` — разные значения.
e) **Fallback**: PHP `else $val = $ord`, Node — ничего.

### 9. `_m_save` boolean cleanup — нет проверки грантов
**PHP** (line 8162-8166): перед удалением нечекнутого boolean проверяет `Check_Grant($id, $key, "WRITE", FALSE)`.
**Node.js** (line 7007-7020): удаляет **без проверки грантов**.

### 10. `_m_save` / `_m_set` empty value → DELETE — нет каскада
**PHP** (line 8147-8155): `DELETE FROM $z WHERE id=$req_id OR up=$req_id` — каскадно удаляет детей.
**Node.js** (line 6977-6991): `deleteRow(db, existing.id)` → `DELETE WHERE id = ?` — **дети остаются сиротами**.
Также: PHP не позволяет очистить имя объекта (`$t != $typ` check), Node — позволяет.
Также: Node добавляет проверку `:!NULL:` перед удалением, которой нет в PHP.

### 11. `_d_req` дубликат реквизита — warning vs error
**PHP** (line 8554-8570): возвращает existing ID + **warning** (soft, UI навигирует к существующему).
**Node.js** (line 8779-8786): возвращает **error** (hard block, операция прервана).

### 12. `populateReqs` (copybtn) — файловые пути
**PHP** (`Populate_Reqs`, line 6942-6975): файлы копируются через `GetSubdir`/`GetFilename` (хеш-директории).
**Node.js** (`populateReqs`, line 2962): `path.basename(child.val)` + плоский `download/db/` + `copy_` prefix.
Также: PHP пропускает реквизиты с `$_REQUEST["t".$ch["t"]]` (пользователь изменил на форме), Node — копирует всё.

### 13. Cabinet fallback auth — неполная реализация
**PHP** (line 7638-7656): two-step fallback — проверяет `my` с JOIN на DATABASE запись, потом логинит в целевую БД как DB-owner.
**Node.js** (line 3261-3288): запрашивает `my`, но **не проверяет** DATABASE-авторизацию на целевую БД, **не логинит** туда — просто возвращает `{ message: 'CABINET' }`.

---

## FALSE — Расхождения НЕ подтверждены (10 штук)

| # | Пункт | Вердикт |
|---|-------|---------|
| 1 | Логаут: все токены vs текущий | **FALSE** — оба удаляют все токены пользователя (`WHERE up=userId AND t=TOKEN`) |
| 2 | checkcode: ACTIVITY update | **FALSE** — оба обновляют (разница: PHP microtime float, Node seconds int) |
| 3 | File BlackList | **FALSE** — одинаковый список расширений (мелочь: PHP абортит запрос, Node пропускает файл) |
| 4 | Рекурсия Populate_Reqs | **FALSE** — обе рекурсивные без лимита глубины |
| 5 | _d_new: дубликаты типов | **FALSE** — оба проверяют для root-типов |
| 6 | _new_db: шаблоны | **FALSE** — оба поддерживают |
| 7 | csv_all: ссылочные JOIN | **FALSE** — одинаковые SQL JOIN |
| 8 | register: email | **FALSE** — оба отправляют |
| 9 | terms: htmlspecialchars | **FALSE** — оба экранируют через `htmlEsc()` |
| 10 | `_d_attrs` obj: хардкод 0 | **FALSE** — оба используют parent, но типы разные (PHP int, Node String) |

---

## Приоритизация VERIFIED расхождений

### P0 — Ломает функциональность
| # | Проблема | Где |
|---|----------|-----|
| 1 | Формат ошибок `{error}` vs `[{error}]` | Все legacy HTML-шаблоны |
| 10 | Empty value DELETE без каскада — сироты в БД | `_m_save`, `_m_set` |
| 8 | _m_new NUMBER дефолты: нет `=1`, глобальный MAX, нет reuse | `_m_new` |

### P1 — Нарушает целостность/безопасность
| # | Проблема | Где |
|---|----------|-----|
| 9 | Boolean cleanup без проверки грантов | `_m_save` |
| 13 | Cabinet fallback не логинит в целевую БД | `auth` |
| 12 | populateReqs: плоские пути для файлов | `_m_save` (copybtn) |

### P2 — Поведенческие отличия
| # | Проблема | Где |
|---|----------|-----|
| 2 | Токен reuse vs regenerate | `auth` |
| 4 | JSON_CR: rows объект vs массив, типизация | `report` |
| 5 | xsrf id: строка vs число | `xsrf` |
| 6 | _d_ord: reqId vs parentId (edge case) | `_d_ord` |
| 7 | _m_up/_d_up: matching by ord vs id | `_m_up`, `_d_up` |
| 11 | _d_req: warning vs error на дубликат | `_d_req` |
| 3 | obj_meta: битый JSON vs чистый error | `obj_meta` |
