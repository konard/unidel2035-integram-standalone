# Integram Standalone Application

Полностью независимое приложение для работы с Integram, включающее:
- Авторизацию и регистрацию пользователей
- Welcome страницу с онбордингом
- Полный функционал Integram (таблицы, объекты, редакторы)
- Чаты и коммуникации
- Меню и навигацию

## Установка

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Сборка для production
npm run build

# Запуск собранного приложения
npm run preview
```

## Структура проекта

```
integram-standalone/
├── src/
│   ├── views/
│   │   ├── pages/
│   │   │   ├── auth/           # Страницы авторизации
│   │   │   │   ├── Login.vue
│   │   │   │   ├── Register.vue
│   │   │   │   └── OAuthCallback.vue
│   │   │   ├── Integram/       # Страницы Integram
│   │   │   │   ├── IntegramLogin.vue
│   │   │   │   ├── IntegramMain.vue
│   │   │   │   ├── IntegramLanding.vue
│   │   │   │   ├── IntegramDictionary.vue
│   │   │   │   └── ...
│   │   │   └── Welcome.vue     # Welcome страница
│   ├── components/
│   │   ├── chat/              # Компоненты чата
│   │   ├── integram/          # Компоненты Integram
│   │   ├── layout/            # Layout компоненты (меню, топбар)
│   │   ├── onboarding/        # Онбординг
│   │   └── ensembles/         # Ансамбли
│   ├── stores/                # Pinia stores
│   ├── services/              # API сервисы
│   ├── router/                # Vue Router
│   ├── assets/                # Статические ресурсы
│   └── main.js                # Точка входа
├── backend/
│   └── monolith/
│       └── src/
│           ├── api/routes/    # API маршруты
│           ├── services/      # Backend сервисы
│           └── config/        # Конфигурация
├── public/                    # Публичные файлы
├── package.json
├── vite.config.mjs
└── index.html
```

## Доступные маршруты

### Авторизация
- `/login` - Вход в систему
- `/register` - Регистрация
- `/oauth/callback` - OAuth callback

### Главные страницы
- `/welcome` - Welcome страница (требует авторизации)

### Integram
- `/integram` - Главная страница Integram
- `/integram/login` - Вход в Integram
- `/integram/:database` - Работа с конкретной базой данных
- `/integram/:database/dictionary` - Словарь типов
- `/integram/:database/objects/:typeId` - Просмотр объектов
- `/integram/:database/tables` - Список таблиц

## Конфигурация

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Настройте переменные окружения:
- `VITE_API_URL` - URL backend API
- `VITE_WS_URL` - URL WebSocket сервера
- `VITE_INTEGRAM_URL` - URL Integram API

## Технологии

- **Frontend**: Vue 3, Vite, Vue Router, Pinia
- **UI**: PrimeVue 4, PrimeIcons, FontAwesome
- **Backend**: Node.js, Express
- **API**: Axios, Socket.io

## Особенности

1. **Полная независимость** - не зависит от основного репозитория dronedoc2025
2. **Готовая авторизация** - OAuth, Email, Registration
3. **Integram интеграция** - полный функционал работы с базами данных
4. **Чаты** - встроенная система коммуникаций
5. **Адаптивный дизайн** - работает на всех устройствах

## Разработка

### Добавление нового маршрута

1. Создайте компонент в `src/views/pages/`
2. Добавьте маршрут в `src/router/index-standalone.js`
3. При необходимости добавьте guard для авторизации

### Добавление нового API endpoint

1. Создайте route в `backend/monolith/src/api/routes/`
2. Создайте service в `backend/monolith/src/services/`
3. Подключите в main server file

## Лицензия

Proprietary
