# PHP vs Node.js Backend Route Comparison

**Last Audit:** 2026-02-20
**File audited:** `backend/monolith/src/api/routes/legacy-compat.js` (~5 600 строк)
**PHP reference:** `integram-server/index.php` (457 KB)

---

## Итог

| Метрика | Значение |
|---------|----------|
| Всего роутов | 58+ |
| Полностью реализованы | ~52 (90%) |
| Стабы / частичная реализация | 3 |
| Критических пропусков | 0 |

---

## Аутентификация (6 роутов)

| PHP Route | Node.js Route | Статус | Примечание |
|-----------|---------------|--------|------------|
| `POST /:db/auth` (password) | `router.post('/:db/auth')` | ✅ | SHA1 hash, token/xsrf, cookie |
| `POST /:db/auth?reset` | то же, ветка `?reset` | ⚠️ PARTIAL | Email/SMS не отправляется — задокументированное ограничение |
| `GET /:db/auth` (secret) | `router.all('/:db/auth')` GET | ✅ | secret→xsrf flow |
| `GET /:db/xsrf` | `router.all('/:db/xsrf')` | ✅ | Возвращает полную строку сессии |
| `GET /:db/validate` | `router.get('/:db/validate')` | ✅ | Проверка уникальности login/email |
| `GET /:db/exit` | `router.all('/:db/exit')` | ✅ | Удаляет token, очищает cookie |

### 2FA

| PHP Route | Node.js Route | Статус | Примечание |
|-----------|---------------|--------|------------|
| `POST /:db/getcode` | `router.post('/:db/getcode')` | ⚠️ PARTIAL | OTP не отправляется — задокументированное ограничение |
| `POST /:db/checkcode` | `router.post('/:db/checkcode')` | ✅ | Верификация OTP, регенерация токена |
| `POST /:db/confirm` | `router.post('/:db/confirm')` | ⚠️ PARTIAL | Форм-валидация есть, проверки кода нет |

---

## Регистрация

| PHP Route | Node.js Route | Статус | Примечание |
|-----------|---------------|--------|------------|
| `POST /my/register` | `router.post('/my/register')` | ✅ | Валидация, создание юзера |
| `GET /my/register?u=<id>&c=<code>` | **ОТСУТСТВУЕТ** | ❌ | PHP отправляет email и требует подтверждения — в Node.js юзер создаётся сразу без confirmation flow |

---

## DML — Объекты (9 роутов)

| PHP Route | Node.js Route | Статус |
|-----------|---------------|--------|
| `POST /:db/_m_new/:up` | `router.post('/:db/_m_new/:up?', upload.any(), ...)` | ✅ |
| `POST /:db/_m_save/:id` | `router.post('/:db/_m_save/:id')` | ✅ |
| `POST /:db/_m_del/:id` | `router.post('/:db/_m_del/:id')` | ✅ |
| `POST /:db/_m_set/:id` | `router.post('/:db/_m_set/:id')` | ✅ |
| `POST /:db/_m_move/:id` | `router.post('/:db/_m_move/:id')` | ✅ |
| `POST /:db/_m_up/:id` | `router.post('/:db/_m_up/:id')` | ✅ |
| `POST /:db/_m_ord/:id` | `router.post('/:db/_m_ord/:id')` | ✅ |
| `POST /:db/_m_id/:id` | `router.post('/:db/_m_id/:id')` | ✅ |
| `POST /:db/upload` | `router.post('/:db/upload', multer)` | ✅ |

**Формат ответа `api_dump()`** — соответствует PHP:
```json
{"id": <id>, "obj": <type>, "next_act": "object", "args": "F_U=<parentId>", "warnings": ""}
```
- `_m_del`: `{id:0, obj:0, next_act:"terms"}` ✅

---

## DDL — Типы и реквизиты (12 роутов)

| PHP Route | Node.js Route | Статус |
|-----------|---------------|--------|
| `POST /:db/_d_new` | `router.post('/:db/_d_new/:parentTypeId?')` | ✅ |
| `POST /:db/_d_save/:id` | `router.post('/:db/_d_save/:typeId')` | ✅ |
| `POST /:db/_d_del/:id` | `router.post('/:db/_d_del/:typeId')` | ✅ |
| `POST /:db/_d_req/:id` | `router.post('/:db/_d_req/:typeId')` | ✅ |
| `POST /:db/_d_alias/:id` | `router.post('/:db/_d_alias/:reqId')` | ✅ |
| `POST /:db/_d_null/:id` | `router.post('/:db/_d_null/:reqId')` | ✅ |
| `POST /:db/_d_multi/:id` | `router.post('/:db/_d_multi/:reqId')` | ✅ |
| `POST /:db/_d_attrs/:id` | `router.post('/:db/_d_attrs/:reqId')` | ✅ |
| `POST /:db/_d_up/:id` | `router.post('/:db/_d_up/:reqId')` | ✅ |
| `POST /:db/_d_ord/:id` | `router.post('/:db/_d_ord/:reqId')` | ✅ |
| `POST /:db/_d_del_req/:id` | `router.post('/:db/_d_del_req/:reqId')` | ✅ |
| `POST /:db/_d_ref/:id` | `router.post('/:db/_d_ref/:parentTypeId')` | ✅ |

Модификаторы реквизитов (`:ALIAS=xxx:`, `:!NULL:`, `:MULTI:`) — парсинг/сборка соответствует PHP ✅

---

## Query / Чтение данных (7 роутов)

| PHP Route | Node.js Route | Статус |
|-----------|---------------|--------|
| `GET /:db/_dict/:typeId?` | `router.all('/:db/_dict/:typeId?')` | ✅ |
| `GET /:db/_list/:typeId` | `router.all('/:db/_list/:typeId')` | ✅ |
| `GET /:db/_list_join/:typeId` | `router.all('/:db/_list_join/:typeId')` | ✅ |
| `GET /:db/_ref_reqs/:refId` | `router.all('/:db/_ref_reqs/:refId')` | ✅ |
| `GET /:db/metadata/:typeId?` | `router.all('/:db/metadata/:typeId?')` | ✅ |
| `GET /:db/obj_meta/:id` | `router.all('/:db/obj_meta/:id')` | ✅ |
| `GET /:db/terms` | `router.get('/:db/terms')` | ✅ |

---

## Файлы и административные роуты (3 роута)

| PHP Route | Node.js Route | Статус |
|-----------|---------------|--------|
| `GET /:db/download/:filename` | `router.get('/:db/download/:filename')` | ✅ |
| `GET /:db/dir_admin` | `router.get('/:db/dir_admin')` | ✅ |
| `GET/POST /my/_new_db` | `router.all('/my/_new_db')` | ✅ |

---

## Сессия / JWT (4 роута)

| PHP Route | Node.js Route | Статус |
|-----------|---------------|--------|
| `POST /:db/jwt` | `router.post('/:db/jwt')` | ✅ |
| `POST /:db/confirm` | `router.post('/:db/confirm')` | ⚠️ PARTIAL |

---

## Бэкап / Отчёты (3 роута)

| PHP Route | Node.js Route | Статус |
|-----------|---------------|--------|
| `GET /:db/backup` | `router.get('/:db/backup')` | ✅ ZIP-архив |
| `GET /:db/csv_all` | `router.get('/:db/csv_all')` | ✅ ZIP-архив |
| `GET /:db/restore` | `router.post('/:db/restore')` | ✅ SQL-генерация |

---

## Страницы (5 роутов)

| PHP Route | Node.js Route | Статус |
|-----------|---------------|--------|
| `GET /` | catch-all | ✅ |
| `GET /:db` | `router.get('/:db')` | ✅ |
| `GET /:db/:page*` | catch-all | ✅ |
| `GET /:db/login` | redirect | ✅ |
| `GET/:db/exit` | `router.all('/:db/exit')` | ✅ |

---

## Форматы ответов

### `api_dump()` (все мутирующие действия)
```json
{"id": <id>, "obj": <obj>, "next_act": "<action>", "args": "<qs>", "warnings": ""}
```
| Endpoint | `next_act` | `args` |
|----------|------------|--------|
| `_m_*` (кроме del) | `"object"` | `"F_U=<parentId>"` если parentId > 1 |
| `_m_del` | `"terms"` | `""`, id=0, obj=0 |
| `_d_*` (кроме del) | `"edit_types"` | `""` |
| `_d_del` | `"terms"` | `""`, id=0, obj=0 |

### Форматы запросов
- `isApiRequest()` детектирует: `JSON`, `JSON_DATA`, `JSON_KV`, `JSON_CR`, `JSON_HR` ✅
- Ошибки в API-режиме: HTTP 200 + `[{"error":"..."}]` ✅
- Фильтры в report: `FR_*`, `TO_*`, `EQ_*`, `LIKE_*` ✅

### metadata
```json
{
  "num": <ord>,
  "id": <req_id>,
  "val": <label>,
  "orig": <raw_modifier_string>,
  "type": <base_type_id>,
  "arr_id": <type_id>,
  "ref": <ref_type_id_or_null>
}
```

---

## XSRF / Крипто (полное соответствие PHP)

| Функция | Node.js | Статус |
|---------|---------|--------|
| `phpSalt(a,b,db)` | `PHP_SALT + a.toUpperCase() + db + b` | ✅ |
| `generateXsrf(a,b,db)` | `sha1(phpSalt).substring(0, 22)` | ✅ |
| Normal login XSRF | `generateXsrf(token, db, db)` | ✅ |
| 2FA checkcode XSRF | `generateXsrf(token, email, db)` | ✅ |
| Secret auth XSRF | `generateXsrf(secret, username, db)` | ✅ |

---

## Известные проблемы / Что нужно доделать

### P1 — Отсутствует confirmation flow при регистрации
**Severity:** MEDIUM

PHP при регистрации:
1. Создаёт юзера со статусом "unconfirmed"
2. Отправляет письмо со ссылкой `/my/register?u=<id>&c=<code>`
3. `GET /my/register?u=<id>&c=<code>` активирует юзера

Node.js — создаёт юзера сразу, без подтверждения email.
**Нужно:** добавить `GET /my/register` handler с параметрами `u` + `c`.

---

### P2 — Email/SMS не отправляются (standalone-ограничение)
**Severity:** LOW (задокументировано)

| Endpoint | Что не работает |
|----------|-----------------|
| `POST /:db/getcode` | OTP-код не отправляется |
| `POST /:db/auth?reset` | Письмо сброса пароля не отправляется |

Код возвращает правильный HTTP-формат для совместимости с UI, но реальной доставки нет.
**Нужно:** интегрировать Nodemailer / внешний SMTP.

---

### P3 — `/confirm` не проверяет код
**Severity:** LOW

`POST /:db/confirm` принимает `code` + `password` + `password2`, но не верифицирует значение `code` против сохранённого.

---

## Тесты

Файл: `backend/monolith/src/api/routes/__tests__/legacy-compat.test.js`
Запуск: `cd backend/monolith && npx vitest run src/api/routes/__tests__/legacy-compat.test.js`

| Тест | Статус |
|------|--------|
| POST /:db/auth — valid credentials | ✅ |
| POST /:db/auth — wrong credentials | ✅ |
| POST /:db/auth — user not found | ✅ |
| GET /:db/xsrf — valid token | ✅ |
| GET /:db/xsrf — no cookie | ✅ |
| GET /:db/terms — authenticated | ✅ |
| GET /:db/metadata/:typeId | ✅ |
| POST /:db/_m_new/:up — creates object | ✅ |
| POST /:db/_m_new/:up — missing type | ✅ |
| POST /:db/_m_save/:id | ✅ |
| POST /:db/_m_del/:id | ✅ |
| POST /:db/_m_id/:id — rename | ✅ |
| POST /:db/_m_id/:id — id in use | ✅ |
| POST /:db/_m_id/:id — missing new_id | ✅ |
| POST /:db/_d_new | ✅ |
| GET /:db/backup — admin | ✅ |
| GET /:db/backup — no auth | ✅ |
| **Итого** | **17/17** |

**Не покрыты тестами:** DDL-роуты (`_d_*`), `_list`, `_list_join`, report, file upload/download.
