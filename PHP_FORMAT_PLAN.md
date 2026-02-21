# PHP Format Parity — Plan

## Цель
Node.js ответы `GET /:db/object/:typeId?JSON` должны точно совпадать с PHP ответами.
Тестируется на ai2o.ru (логин d/d, БД my).

## Статус пунктов

### ✅ DONE — Часть 1: object?JSON основные поля
- Fix `req_type`: было массив, стало объект `{reqKey: name}` (ключ = req.t для user types, req.id для base types)
- Fix `req_order`: добавлен `[reqKey, ...]`
- Fix `req_attrs`: добавлен `{reqKey: attrsString}`
- Fix `base.unique`: был всегда "unique", теперь из `typeRow.ord`
- Fix `reqs`: было `{objId: [vals]}`, стало `{objId: {reqKey: value}}`
- Add `&main.myrolemenu`: запрос GRANT rows под ролью пользователя
- Add `&main.a`: `{"_parent_.title": [typeVal]}`
- Add `&main.a.&uni_obj`: metadata типа как массивы
- Add `&main.a.&uni_obj.&delete/.&export/.&new_req/.&filter_val_rcm`
- Add `arr_type`: `{reqKey: firstChildId}` для user-type reqs
- Add `ref_type`: `{reqKey: req.t}` для user-type reqs
- Add `&main.a.&uni_obj.&uni_obj_head`: заголовки колонок (если есть req types)
- Add `&main.a.&uni_obj.&uni_obj_head_filter` + `.&filter_req_rcm`
- Add `&main.a.&uni_obj.&uni_obj_all`: `{id, align, val}` список объектов
- Add `reqs` в правильном формате (если есть данные)
- Add `&object_reqs`: первое значение req для каждого объекта
- Add `&main.a.&uni_obj.&uni_obj_all.&uni_object_view_reqs`
- Fix root handler `GET /:db/?JSON`: myrolemenu теперь через role_id (не role_val)
- Fix root handler: terms query использует `up <= 1` вместо `up = 0`

### ✅ DONE — Часть 2: myrolemenu из DB
- GRANT (t=5) rows под ролью — это НЕ menu items
- Menu items хранятся как: up=roleObjId(145), t=MenuTypeId(151), val=displayName
- href берётся из дочерних rows: up=menuItemId, t=AddressTypeId(153), val=hrefURL
- Логи подтвердили: _m_save t151=name; t153=href (req types для Menu type)
- Исправлен buildMyrolemenu() helper: queries children of roleObjId + their children
- Обновлены все 3 места: root handler, object handler, edit_obj handler
- Старый запрос `WHERE t = TYPE.GRANT(5)` был полностью неверным
- **Доп. fix (CROSS JOIN)**: role assignment rows имеют `t = roleObjId (145)`, НЕ `t = TYPE.ROLE (42)`.
  Старый LEFT JOIN `role.t = TYPE.ROLE` никогда не совпадал. Исправлено через паттерн из PHP:
  `LEFT JOIN (db r CROSS JOIN db role_def) ON r.up=u.id AND role_def.id=r.t AND role_def.t=TYPE.ROLE`
  Теперь `role_def.id = 145` передаётся в buildMyrolemenu как roleObjId.

### ✅ DONE — Часть 3: edit_obj endpoint (полный переписан)
- `GET /:db/edit_obj/:id?JSON` — PHP-формат полностью реализован
- Точное SQL: PHP GetObjectReqs Query 1 — LEFT JOIN refs + arrs, CASE base_typ/type_val
- reqsMeta как Map (не объект) — сохраняет порядок вставки от SQL ORDER BY a.ord
  (обычные объекты сортируют целые ключи "117","135","154" вместо "117","154","135")
- fetchAlias(attrs, orig): извлекает :ALIAS=xxx: из attrs для ref-type reqs
- formatDate(v): YYYYMMDD → DD.MM.YYYY; Unix ts → через UTC
- formatDatetime(v): Unix ts → DD.MM.YYYY HH:MM:SS UTC (PHP сервер UTC timezone)
- buildFileLink(rowId, val): PHP GetSubdir/GetFilename алгоритм → <a href="/download/...">
- arr: для ARR_typs — Number (int), для обычных значений — String (MySQL string)
- add_obj_ref_reqs: JOIN pars WHERE pars.up!=0 (исключает корневые объекты) + UNION для выбранных
- Убрана неверная фильтрация multiselectedIds (PHP не фильтрует их из dropdown)
- reqs field ordering: reqsMetaOrder array, loop with reqsMeta.get(k)

### ✅ DONE — Часть 4: Bearer token dedup
- extractToken(req, db) helper добавлен, 5 дублей убраны

### ✅ DONE — Часть 5: myrolemenu полный фикс
- buildMyrolemenu: фильтр по `menu_typ.t = TYPE.SHORT (3)` вместо `m.id != m.t`
  Причина: дети role object с t=116 (ROLE_OBJECT/GRANT) некорректно включались в меню
  Правило: только дети с типом где `typ.t = 3 (SHORT)` — это menu item rows (t=151)
- edit_obj myrolemenu: поддержка Basic auth (Authorization: Basic base64(login:pwd))
  Ранее: extractToken возвращал строку "Basic ZDpk", query не совпадал с tok.val → пустое меню
  Фикс: если token.startsWith('Basic '), декодируем login:pwd, верифицируем хэш пароля,
  делаем отдельный запрос через pwd JOIN вместо tok JOIN

## Ключевые находки из анализа DB

### Правило ключа для req fields
```
req rows: WHERE up = typeId ORDER BY ord
- If type_def (row with id=req.t) has up<=1 AND id!=t → key = req.t (user type ref)
- Otherwise → key = req.id (base/internal type)
```

### Имя req поля
- Берётся из `type_def.val` (строка JOIN на type_def.id = req.t)

### attrs req поля
- Берётся из `req.val` (сама строка дочернего row)

### base.unique
- Из `typeRow.ord` — если != '0' и не пустое → "unique"

### arr_type
- Для каждого user-type req: первый дочерний row WHERE up=req.t ORDER BY ord

### PHP response field order
1. &main.myrolemenu
2. &main.a
3. type, base
4. &main.a.&uni_obj + sub-blocks
5. req_base, req_base_id, req_attrs, req_type, arr_type, req_order, ref_type (если есть reqs)
6. &main.a.&uni_obj.&uni_obj_head (если есть reqs)
7. &main.a.&uni_obj.&filter_val_rcm
8. &main.a.&uni_obj.&uni_obj_head_filter + sub (если есть reqs)
9. object
10. &main.a.&uni_obj.&uni_obj_all
11. reqs (если есть данные)
12. &object_reqs (если есть reqs данные)
13. &main.a.&uni_obj.&uni_obj_all.&uni_object_view_reqs
