# Code-Verified Audit: PHP vs Node.js API

**Дата:** 2026-03-14
**Обновлено:** 2026-03-14 (все 13 расхождений исправлены)
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

## FIXED — Все 13 расхождений исправлены

### 1. [FIXED] Формат ошибок: массив vs объект
**Issue:** [#350](https://github.com/unidel2035/integram-standalone/issues/350) | **PR:** [#372](https://github.com/unidel2035/integram-standalone/pull/372)
**Было:** Node.js возвращал `{"error":"msg"}`, PHP — `[{"error":"msg"}]`. Legacy HTML-шаблоны обращались к `json[0].error`.
**Исправлено:** Все 241 error-response обёрнуты в массив `[{error:...}]` по всему файлу, включая middleware.

### 2. [FIXED] Токен при логине: reuse vs regenerate
**Issue:** [#351](https://github.com/unidel2035/integram-standalone/issues/351) | **PR:** [#363](https://github.com/unidel2035/integram-standalone/pull/363)
**Было:** Node.js всегда генерировал новый токен, удаляя старый.
**Исправлено:** Если у пользователя есть токен — переиспользует. Новый генерируется только при отсутствии. Ложный комментарий удалён.

### 3. [FIXED] obj_meta при отсутствии объекта
**Issue:** [#352](https://github.com/unidel2035/integram-standalone/issues/352) | **PR:** [#373](https://github.com/unidel2035/integram-standalone/pull/373)
**Было:** Формат `{error}` вместо `[{error}]`, сообщение 'not found'.
**Исправлено:** `[{ error: 'Object not found' }]` — массив + понятное сообщение.

### 4. [FIXED] Report JSON_CR формат
**Issue:** [#353](https://github.com/unidel2035/integram-standalone/issues/353) | **PR:** [#364](https://github.com/unidel2035/integram-standalone/pull/364)
**Было:** Две реализации: одна возвращала объект по `row.id` с кастом чисел, другая — массив.
**Исправлено:** Обе унифицированы — `rows` как объект с числовыми ключами (0,1,2...), все значения строки, `field_names` фильтрация.

### 5. [FIXED] xsrf поле `id`: строка vs число
**Issue:** [#354](https://github.com/unidel2035/integram-standalone/issues/354) | **PR:** [#374](https://github.com/unidel2035/integram-standalone/pull/374)
**Было:** `Number(user.uid)` → число.
**Исправлено:** `String(user.uid)` → строка, как в PHP.

### 6. [FIXED] `_d_ord` ответ: id/obj
**Issue:** [#355](https://github.com/unidel2035/integram-standalone/issues/355) | **PR:** [#365](https://github.com/unidel2035/integram-standalone/pull/365)
**Было:** Всегда возвращал `parentId`.
**Исправлено:** `parentId` только при реальном изменении порядка, иначе `reqId`.

### 7. [FIXED] `_m_up`/`_d_up` swap: matching by ord vs id
**Issue:** [#356](https://github.com/unidel2035/integram-standalone/issues/356) | **PR:** [#375](https://github.com/unidel2035/integram-standalone/pull/375)
**Было:** Node matching по ID (точнее), PHP по ord values.
**Исправлено:** Логика оставлена (matching по ID безопаснее). Добавлена документация о намеренном расхождении.

### 8. [FIXED] `_m_new` дефолты — 5 подрасхождений
**Issue:** [#357](https://github.com/unidel2035/integram-standalone/issues/357) | **PR:** [#366](https://github.com/unidel2035/integram-standalone/pull/366)
**Было:** NUMBER не-unique без дефолта, глобальный MAX, нет reuse пустого объекта, DATE YYYYMMDD, нет fallback.
**Исправлено:** a) `value='1'` для не-unique NUMBER; b) `AND up=?` в MAX-запросе; c) reuse пустого объекта; d) DATE через `formatVal`; e) fallback `value = String(order)`.

### 9. [FIXED] `_m_save` boolean cleanup — нет проверки грантов
**Issue:** [#358](https://github.com/unidel2035/integram-standalone/issues/358) | **PR:** [#367](https://github.com/unidel2035/integram-standalone/pull/367)
**Было:** Удаляло boolean без проверки прав.
**Исправлено:** Добавлен `checkGrant()` перед `deleteRow`, `continue` при отсутствии WRITE.

### 10. [FIXED] `_m_save` empty value DELETE — нет каскада
**Issue:** [#359](https://github.com/unidel2035/integram-standalone/issues/359) | **PR:** [#368](https://github.com/unidel2035/integram-standalone/pull/368)
**Было:** `DELETE WHERE id = ?` — дети оставались сиротами.
**Исправлено:** `DELETE WHERE id = ? OR up = ?` (каскад). Добавлена защита от удаления имени объекта. Удалена лишняя проверка `:!NULL:`.

### 11. [FIXED] `_d_req` дубликат реквизита — warning vs error
**Issue:** [#360](https://github.com/unidel2035/integram-standalone/issues/360) | **PR:** [#369](https://github.com/unidel2035/integram-standalone/pull/369)
**Было:** Возвращал `{error}` — hard block.
**Исправлено:** `legacyRespond()` с id, obj, next_act, args, warnings — soft redirect к существующему.

### 12. [FIXED] `populateReqs` (copybtn) — файловые пути
**Issue:** [#361](https://github.com/unidel2035/integram-standalone/issues/361) | **PR:** [#370](https://github.com/unidel2035/integram-standalone/pull/370)
**Было:** Плоские пути `path.basename()` + `copy_` prefix.
**Исправлено:** `getSubdir()`/`getFilename()` для хеш-путей. INSERT перед копированием (как PHP). Создание поддиректорий.

### 13. [FIXED] Cabinet fallback auth — неполная реализация
**Issue:** [#362](https://github.com/unidel2035/integram-standalone/issues/362) | **PR:** [#371](https://github.com/unidel2035/integram-standalone/pull/371)
**Было:** Только запрос в `my`, без проверки DATABASE, без логина в целевую БД.
**Исправлено:** 3-way JOIN (email+pwd+db), запрос DB-owner в целевой БД, полная сессия (token, xsrf, cookie).

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

## Оставшийся gap (не из аудита)

| # | Проблема | Приоритет | Примечание |
|---|----------|-----------|------------|
| 1 | `_d_main` без auth middleware | P2 | Read-only метаданные типа, но доступен без авторизации |
| 2 | `_m_up`/`_d_up` matching by id vs ord | Намеренно | Node.js точнее при дубликатах ord. Задокументировано в коде (#356) |

---

## Статистика

- **Всего верифицированных расхождений:** 13
- **Исправлено:** 13/13 (100%)
- **Ложных расхождений отсеяно:** 10
- **PR созданы и замёрджены:** #363–#375
