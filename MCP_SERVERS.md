# Integram MCP Серверы

## Обзор

В системе используются **два разных** MCP сервера для работы с Integram API:

---

## 1. integram-tools (текущий проект)

**Назначение:** MCP сервер для проекта **integram-standalone**

**Расположение:**
```
/home/hive/integram-standalone/backend/monolith/src/services/mcp/integram-server.js
```

**Конфигурация:**
- Уровень: Project-specific (локальная для проекта)
- Файл: `/home/hive/.claude.json` → секция `"/home/hive/integram-standalone"`

**Когда использовать:**
- ✅ При работе с проектом integram-standalone
- ✅ Для тестирования API v2
- ✅ Для разработки новых функций

**Пример конфигурации:**
```json
{
  "mcpServers": {
    "integram-tools": {
      "type": "stdio",
      "command": "/home/hive/.nvm/versions/node/v20.19.6/bin/node",
      "args": [
        "/home/hive/integram-standalone/backend/monolith/src/services/mcp/integram-server.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

---

## 2. integram-dronedoc (старый проект)

**Назначение:** MCP сервер для проекта **dronedoc2025** (legacy)

**Расположение:**
```
/home/hive/dronedoc2025/backend/monolith/src/services/mcp/integram-server.js
```

**Конфигурация:**
- Уровень: Global (глобальная для всех проектов)
- Файл: `/home/hive/.claude.json` → секция `mcpServers`

**Когда использовать:**
- ⚠️ Только для работы со старым проектом dronedoc2025
- ⚠️ Legacy код, не рекомендуется для нового развития

---

## Важные различия

| Параметр | integram-tools | integram-dronedoc |
|----------|----------------|-------------------|
| Проект | integram-standalone (новый) | dronedoc2025 (старый) |
| Путь | `/home/hive/integram-standalone/...` | `/home/hive/dronedoc2025/...` |
| API версия | v2 (современная) | Legacy |
| Статус | ✅ Активная разработка | ⚠️ Legacy |
| Область действия | Локальная (только в проекте) | Глобальная (все проекты) |

---

## Как избежать путаницы

### ✅ Правильно:
1. **В проекте integram-standalone** всегда используйте `integram-tools`
2. Проверяйте активный сервер через `/mcp` команду в Claude Code
3. При создании нового issue или документации указывайте название сервера

### ❌ Неправильно:
1. Использовать `integram-dronedoc` в новом проекте
2. Путать пути к файлам серверов
3. Использовать старое название "integram" без уточнения

---

## Проверка активного сервера

В Claude Code выполните:
```
/mcp
```

Должны видеть:
- ✅ **integram-tools** - для integram-standalone
- ⚠️ **integram-dronedoc** - для dronedoc2025

---

## Перезагрузка MCP серверов

После изменения конфигурации:
```
/mcp reload
```

Или перезапустите Claude Code.

---

## Инструменты

Оба сервера предоставляют одинаковый набор из **70+ инструментов**:
- Аутентификация (2)
- DDL операции (40+)
- DML операции (15+)
- Запросы и отчеты (10+)
- Высокоуровневые операции

Полный список: см. `backend/monolith/src/services/mcp/README.md`

---

## Контакты

При возникновении вопросов:
- Issues: https://github.com/unidel2035/integram-standalone/issues
- Документация: `backend/monolith/src/services/mcp/README.md`

---

**Последнее обновление:** 2025-12-26
