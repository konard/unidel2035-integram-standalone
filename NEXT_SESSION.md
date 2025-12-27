# Задание на следующую сессию

Дата создания: 2025-12-26

## Контекст предыдущей сессии

### Выполнено:
1. ✅ Подключен API v2 к компоненту Profile.vue (верхнее меню)
   - Создан endpoint: `GET /api/v2/integram/databases/:database/user/current`
   - Обновлен Profile.vue для использования нового API
   - Данные возвращаются в JSON:API формате

2. ✅ Исправлена проблема с развертыванием
   - Файлы корректно развертываются в `/var/www/integram-standalone/dist/`
   - Исправлена ошибка 404 на /app/welcome

3. ✅ Протестирован и влит PR #102 - Integram MCP Server
   - Добавлен MCP сервер с 70+ инструментами для работы с Integram API
   - Переименован в "integram-tools"
   - Обновлена конфигурация `.mcp.json` и документация

4. ✅ Компонент AppMenu.vue уже использует API v2 для MyRoleMenu

### Текущее состояние:
- **Backend:** API v2 работает, новый endpoint для user/current добавлен
- **Frontend:** Profile.vue и AppMenu.vue мигрированы на API v2
- **MCP Server:** Подключен как "integram-tools" с 70+ инструментами
- **Deployment:** Настроен корректный путь развертывания

## Задачи на следующую сессию

### Приоритет 1: Тестирование и проверка

1. **Протестировать обновленные компоненты в production:**
   - Проверить работу Profile.vue с API v2
   - Убедиться, что данные пользователя корректно отображаются
   - Проверить fallback на localStorage при ошибках

2. **Проверить AppMenu.vue:**
   - Убедиться, что MyRoleMenu загружается через API v2
   - Проверить корректность отображения пунктов меню

### Приоритет 2: Продолжение миграции на API v2

3. **Найти и мигрировать остальные компоненты:**
   - Проверить все компоненты в `src/components/` на использование старого API
   - Составить список компонентов, требующих миграции
   - Мигрировать по приоритету (начать с наиболее используемых)

4. **Возможные кандидаты для миграции:**
   - Компоненты аутентификации (если используют старый API)
   - Компоненты работы с данными таблиц
   - Компоненты отчетов
   - Любые компоненты, использующие прямые вызовы к `/{db}/...`

### Приоритет 3: Issue #65

5. **Проверить и решить Issue #65:**
   - См. https://github.com/unidel2035/integram-standalone/issues/65
   - Ветка уже подготовлена: `issue-65-c78c49fee862`
   - Рабочая директория: `/tmp/gh-issue-solver-1766761635421`

### Приоритет 4: Документация и развертывание

6. **Обновить документацию:**
   - Добавить информацию об API v2 в README.md
   - Документировать endpoints API v2
   - Добавить примеры использования

7. **Развертывание обновлений:**
   - Собрать frontend: `npm run build`
   - Развернуть на production: `scp dist/* root@185.128.105.78:/var/www/integram-standalone/dist/`
   - Перезапустить API v2 сервер при необходимости

### Приоритет 5: Работа с MCP Server

8. **Документировать использование MCP инструментов:**
   - Создать примеры использования integram-tools
   - Добавить типовые сценарии работы
   - Протестировать основные операции (аутентификация, создание таблиц, запросы)

## Технические детали

### Endpoints API v2:
- `GET /api/v2/integram/databases/:database/user/current` - текущий пользователь
- `GET /api/v2/integram/databases/:database/reports/:reportName` - выполнение отчета
- См. полный список в `backend/monolith/src/api/v2/routes/integram.cjs`

### Конфигурация MCP:

**ВАЖНО:** В проекте используется MCP сервер **"integram-tools"** (НЕ "integram" или "integram-dronedoc")

Конфигурация в `/home/hive/.claude.json`:
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

См. полную документацию: `MCP_SERVERS.md`

### Команды для развертывания:
```bash
# Сборка frontend
npm run build

# Развертывание
sshpass -p 'EKZ-EAs-d6P-HnF' scp -r dist/* root@185.128.105.78:/var/www/integram-standalone/dist/

# Перезапуск API v2 (если нужно)
ssh root@185.128.105.78 'pm2 restart integram-api-v2'
```

## Ссылки

- Проект: https://github.com/unidel2035/integram-standalone
- Платформа: https://интеграм.рф
- Issue #65: https://github.com/unidel2035/integram-standalone/issues/65
- Тестовый доступ: логин `test`, пароль `test`

## Вопросы для уточнения

1. Какие компоненты являются наиболее критичными для миграции на API v2?
2. Есть ли специфические требования к Issue #65?
3. Нужны ли дополнительные endpoints в API v2?
4. Требуется ли интеграция MCP инструментов в веб-интерфейс?

---

**Начать следующую сессию с:** проверки текущего состояния развернутых компонентов и тестирования работы Profile.vue + AppMenu.vue в production.
