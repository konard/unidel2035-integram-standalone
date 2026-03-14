# Промпт для параллельно-последовательного решения issues агентами

## Стратегия

**Файл-bottleneck:** `legacy-compat.js` — все 13 issues правят один файл. Параллельное редактирование одного файла невозможно без worktree.

**Решение:** Группировка по зонам файла + worktree-изоляция для параллельных групп, затем последовательный merge.

---

## Группы (по зоне файла и независимости изменений)

### Группа A — Auth/Session (линии 2391-3700)
- #351 — Token reuse vs regenerate
- #362 — Cabinet fallback auth

### Группа B — DML Core: _m_new (линии 6186-6500)
- #357 — _m_new defaults (NUMBER, DATE, DATETIME, SIGNED, fallback)

### Группа C — DML Core: _m_save/_m_set (линии 6655-7400)
- #358 — Boolean cleanup grant check
- #359 — Empty value cascade delete

### Группа D — DDL: _d_* (линии 8538-9300)
- #355 — _d_ord response id/obj
- #360 — _d_req warning vs error

### Группа E — Response format (по всему файлу)
- #350 — Error format array vs object

### Группа F — Utilities/Helpers (линии 2700-3000)
- #361 — populateReqs file paths

### Группа G — Report engine (линии 10000+)
- #353 — JSON_CR format

### Группа H — Minor parity (точечные правки)
- #352 — obj_meta not found
- #354 — xsrf id type
- #356 — _m_up/_d_up swap matching

---

## Фаза 1: Параллельные worktree-агенты (6 штук)

Группы A, B, C, D, F, G — запускаются параллельно в изолированных worktree.
Группы E и H — откладываются на фазу 2 (E трогает весь файл, H — мелкие точечные правки поверх).

```
Запуск 6 агентов параллельно, каждый с isolation: "worktree":
```

### Агент 1 — Группа A (Auth/Session)

```
You are a senior Node.js developer fixing PHP→Node.js port issues in legacy-compat.js.
Do NOT read any .md docs — work only from the issue descriptions and actual code.

Fix these two issues:

**Issue #351 — Token reuse vs regenerate**
PHP reuses existing token on login (updateTokens, index.php lines 363-383).
Node.js always generates a new one (legacy-compat.js ~line 3385-3397).
Fix: if user already has a token, reuse it. Only generate new when none exists.
Also fix the incorrect comment that says "PHP: always generates fresh token".

**Issue #362 — Cabinet fallback auth**
PHP (index.php lines 7638-7656) does two-step fallback:
1. Verifies user in `my` AND checks DATABASE record for target DB
2. Re-queries target DB and logs in as DB-owner user

Node.js (~line 3261-3288) only queries `my`, does NOT check DATABASE record,
does NOT log into target DB — just returns { message: 'CABINET' }.

Fix: Add the DATABASE record JOIN check. After verification, query the target DB
for the DB-owner user and establish a session (token, xsrf, grants).

After fixing, run: cd backend/monolith && npx vitest run --reporter=verbose 2>&1 | tail -50
Commit each fix separately with descriptive message referencing issue number.
```

### Агент 2 — Группа B (_m_new defaults)

```
You are a senior Node.js developer fixing PHP→Node.js port issues in legacy-compat.js.
Do NOT read any .md docs — work only from the issue description and actual code.

**Issue #357 — _m_new missing NUMBER defaults, wrong MAX scope, no empty object reuse**

Read PHP index.php lines 8378-8408 for the reference implementation, then fix
Node.js legacy-compat.js _m_new route (~line 6272-6293):

a) Non-unique NUMBER default: add `value = '1'` when NUMBER type is not unique.
b) NUMBER MAX+1 scope: add `AND up = ?` with parentId to the MAX query.
c) Empty object reuse: when unique NUMBER, check if an "empty" object with max value
   exists (has no requisites). If so, redirect to edit it instead of creating new.
   Read PHP lines 8387-8393 for exact logic.
d) DATE format: verify Format_Val is called on the default date value.
   Read PHP line 8400 for exact logic.
e) Fallback to ord: add `else { value = String(attrOrder); }` for other types.

After fixing, run: cd backend/monolith && npx vitest run --reporter=verbose 2>&1 | tail -50
Commit with message referencing #357.
```

### Агент 3 — Группа C (_m_save cleanup)

```
You are a senior Node.js developer fixing PHP→Node.js port issues in legacy-compat.js.
Do NOT read any .md docs — work only from the issue descriptions and actual code.

Fix these two issues:

**Issue #358 — Boolean cleanup without grant check**
In _m_save boolean cleanup (~line 7007-7020), before `deleteRow`, add:
```js
const hasGrant = await checkGrant(pool, db, req.legacyUser.grants, objectId, bTypeId, 'WRITE', req.legacyUser.username);
if (!hasGrant) continue;
```
Read PHP lines 8162-8166 for reference.

**Issue #359 — Empty value DELETE not cascading**
In _m_save empty value handling (~line 6977-6991):
1. Change `deleteRow(db, existing.id)` to cascade:
   `DELETE FROM db WHERE id = ? OR up = ?` with [existing.id, existing.id]
2. Add protection for object's own type: if typeIdNum === objectType, skip deletion
   and set warning "Object name cannot be blank!" (read PHP line 8151-8155).
3. Review the `:!NULL:` guard — PHP does NOT have it at this point.
   Consider removing for parity or keeping with a comment explaining the divergence.

After fixing, run: cd backend/monolith && npx vitest run --reporter=verbose 2>&1 | tail -50
Commit each fix separately with descriptive message referencing issue number.
```

### Агент 4 — Группа D (DDL responses)

```
You are a senior Node.js developer fixing PHP→Node.js port issues in legacy-compat.js.
Do NOT read any .md docs — work only from the issue descriptions and actual code.

Fix these two issues:

**Issue #355 — _d_ord always returns parentId**
In _d_ord route (~line 9092+), match PHP behavior (index.php lines 8727-8733):
Only reassign id/obj to parentId when the order ACTUALLY changed.
If newOrd === currentOrd, keep id = reqId.

**Issue #360 — _d_req returns error instead of warning on duplicate**
In _d_req route (~line 8739+), when duplicate is found (~line 8779-8786):
Instead of returning `{ error: "..." }`, return via `legacyRespond()` with:
- id: existing requisite ID
- obj: parentId (the typeId)
- next_act: 'edit_types'
- args: 'ext'
- warning: 'Requisite already exists'
Read PHP lines 8554-8570 for exact response shape.

After fixing, run: cd backend/monolith && npx vitest run --reporter=verbose 2>&1 | tail -50
Commit each fix separately with descriptive message referencing issue number.
```

### Агент 5 — Группа F (populateReqs)

```
You are a senior Node.js developer fixing PHP→Node.js port issues in legacy-compat.js.
Do NOT read any .md docs — work only from the issue description and actual code.

**Issue #361 — populateReqs uses flat file paths**

In populateReqs function (~line 2941-2992), fix file copy logic:
1. Source path: use getSubdir(db, child.id) + '/' + getFilename(db, child.id) + extension
   instead of path.basename(child.val)
2. Destination path: use getSubdir(db, newInsertId) + '/' + getFilename(db, newInsertId) + extension
   instead of copy_${Date.now()}_filename
3. Create the destination subdirectory if it doesn't exist (fs.mkdirSync recursive)
4. Store the correct hash-based relative path in the database val column

Read PHP Populate_Reqs (index.php lines 6942-6975) for reference implementation.
Also read getSubdir/getFilename in both PHP (lines 586-594) and Node.js (~line 2861-2877).

After fixing, run: cd backend/monolith && npx vitest run --reporter=verbose 2>&1 | tail -50
Commit with message referencing #361.
```

### Агент 6 — Группа G (Report JSON_CR)

```
You are a senior Node.js developer fixing PHP→Node.js port issues in legacy-compat.js.
Do NOT read any .md docs — work only from the issue description and actual code.

**Issue #353 — Report JSON_CR format**

Find ALL JSON_CR implementations in legacy-compat.js (there are at least two:
~line 11461 and ~line 13805). Unify them to match PHP format (index.php lines 3756-3870):

1. `rows` must be an **object** keyed by numeric row index (0, 1, 2...),
   NOT an array and NOT keyed by row.id
2. Each row value is an object of {column_name: value}
3. Value typing: keep all values as strings (PHP has a bug in type detection
   where $key gets overwritten, so effectively all are strings)
4. Include `totalCount` field
5. Include `columns` array with type info

Read PHP JSON_CR output (search for "JSON_CR" in index.php) to see exact format.

After fixing, run: cd backend/monolith && npx vitest run --reporter=verbose 2>&1 | tail -50
Commit with message referencing #353.
```

---

## Фаза 2: Последовательный merge + мелкие правки

После завершения всех 6 worktree-агентов:

```
1. Merge каждый worktree branch в master последовательно:
   git merge --no-ff <branch-A>
   git merge --no-ff <branch-B>
   ...
   Разрешать конфликты вручную (все в разных зонах файла — конфликтов быть не должно).

2. Запустить полный тест: npx vitest run

3. Если тесты зелёные — фаза 3.
```

---

## Фаза 3: Глобальные и точечные правки (последовательно)

### Агент 7 — Группа E (Error format — весь файл)

```
You are a senior Node.js developer. Fix issue #350.

In legacy-compat.js, PHP's my_die() returns [{"error":"msg"}] (array).
Node.js returns {"error":"msg"} (object).

Legacy HTML templates use json[0].error — they WILL break with object format.

Decision needed (pick ONE approach):
Option A: Wrap all error responses in array: res.json([{ error: "..." }])
Option B: Keep object format and update all legacy templates to use json.error

Recommended: Option A (less files to change, PHP parity).

Find ALL occurrences of res.json({ error: ... }) and res.status(X).json({ error: ... })
in legacy-compat.js. Wrap each in array: res.json([{ error: ... }]).

IMPORTANT: Do NOT change non-error responses. Only change error responses
that correspond to PHP my_die() paths.

Also check: legacyXsrfCheck, legacyAuthMiddleware, legacyDdlGrantCheck error responses.

After fixing, run full tests.
Commit with message referencing #350.
```

### Агент 8 — Группа H (Minor parity — точечные)

```
You are a senior Node.js developer. Fix these 3 minor issues in legacy-compat.js:

**Issue #352 — obj_meta not found**
At ~line 9574-9576, the response is already HTTP 200 (matching PHP).
No change needed unless error format was changed by #350 — verify consistency.

**Issue #354 — xsrf id type**
At ~line 8009, change `id: Number(user.uid)` to `id: String(user.uid)`.
PHP returns id as string.

**Issue #356 — _m_up/_d_up swap matching**
At ~lines 9359 and 9071, the current approach (matching by ID) is arguably safer.
Add a comment explaining the PHP difference:
// PHP matches by ord values (WHERE ord=X OR ord=Y), which updates all rows
// with those ord values. Node.js matches by id (WHERE id IN) for precision.
// This diverges from PHP when duplicate ord values exist.
Do NOT change the logic — just document the intentional divergence.

After fixing, run full tests.
Commit with message referencing all three issues.
```

---

## Фаза 4: Финальная верификация + отчёт

### Агент 9 — Верификация и отчёт

```
You are a senior code reviewer verifying that all 13 issues have been resolved.

1. Read the current legacy-compat.js and verify each fix:
   - #350: error responses wrapped in array
   - #351: token reuse logic present
   - #352: obj_meta not found consistent with #350
   - #353: JSON_CR unified, rows as object
   - #354: xsrf id is string
   - #355: _d_ord conditional parentId
   - #356: _m_up/_d_up documented divergence
   - #357: _m_new all 5 defaults fixed
   - #358: boolean grant check added
   - #359: cascade delete + self-type protection
   - #360: _d_req returns warning not error
   - #361: populateReqs hash-based paths
   - #362: cabinet fallback with DATABASE check

2. Run full test suite: cd backend/monolith && npx vitest run

3. Update backend/monolith/docs/CODE_VERIFIED_AUDIT.md:
   - Change each VERIFIED item to [FIXED] with the commit SHA
   - Add "Resolution" section under each item describing what was done
   - Update the summary statistics

4. If any fix is incomplete or breaks tests, document what's wrong.
```

---

## Запуск (копипаст в Claude Code)

### Фаза 1 — одним сообщением, 6 параллельных вызовов Agent:

```
Запусти 6 агентов параллельно в worktree:
- Agent 1: Группа A (issues #351, #362) — auth/session
- Agent 2: Группа B (issue #357) — _m_new defaults
- Agent 3: Группа C (issues #358, #359) — _m_save cleanup
- Agent 4: Группа D (issues #355, #360) — DDL responses
- Agent 5: Группа F (issue #361) — populateReqs paths
- Agent 6: Группа G (issue #353) — report JSON_CR

Каждый в isolation: "worktree". Промпты выше.
```

### Фаза 2 — после завершения фазы 1:

```
Слей все worktree ветки в master последовательно. Запусти тесты.
```

### Фаза 3 — после фазы 2:

```
Запусти Agent 7 (#350 error format) и после него Agent 8 (#352, #354, #356).
```

### Фаза 4 — после фазы 3:

```
Запусти Agent 9 для верификации и обновления отчёта.
```
