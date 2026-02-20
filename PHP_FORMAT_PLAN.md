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
- Menu items хранятся как: up=roleRowId, t=MenuTypeId(151), val=displayName
- href берётся из дочерних rows: up=menuItemId, t=AddressTypeId(153), val=hrefURL
- Логи подтвердили: _m_save t151=name; t153=href (req types для Menu type)
- Исправлен buildMyrolemenu() helper: queries children of roleRow + their children
- Обновлены все 3 места: root handler, object handler, edit_obj handler
- Старый запрос `WHERE t = TYPE.GRANT(5)` был полностью неверным

### ✅ DONE — Часть 3: edit_obj endpoint
- `GET /:db/edit_obj/:id?JSON` — PHP-формат реализован
- obj: {id, val, parent, typ, typ_name, base_typ}
- &main.myrolemenu — через role token
- &main.a.&object — {typ x2, up, typ_name x2, val x2, id, disabled}
- &main.a.&object.&edit_req — {type, typ, _parent_.val, _parent_.disabled}
- reqs: {reqKey: {type, order, value, base, arr, arr_type}} — только непустые значения
- &main.a.&object.&object_reqs — все не-FILE req поля
- &main.a.&object.&object_reqs.&editreq_memo — MEMO req поля
- &main.a.&object.&object_reqs.&editreq_file — FILE req поля (reqid)

### ✅ DONE — Часть 4: Bearer token dedup
- extractToken(req, db) helper добавлен, 5 дублей убраны

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
