# Docker Deployment для Integram.рф

**Production код:** 185.128.105.78 (интеграм.рф)
**Синхронизация:** 2025-12-26

## 🚀 Быстрый запуск

```bash
# 1. Перейти в директорию
cd integram-server/

# 2. Запустить всё одной командой
docker-compose up -d

# 3. Приложение доступно на:
# HTTP:  http://localhost:8080
# HTTPS: https://localhost:8443
```

## 📦 Что включено

- **PHP 8.0 + Apache** - основное приложение
- **MySQL 8.0** - база данных
- **SSL сертификат** - самоподписанный для разработки
- **Vue.js SPA** - новый интерфейс на /app
- **Apache конфигурация** - VirtualHost + routing

## 🔧 Полные команды

### Запуск

```bash
# Запустить контейнеры
docker-compose up -d

# Посмотреть логи
docker-compose logs -f

# Только PHP приложение
docker-compose logs -f integram-php

# Только MySQL
docker-compose logs -f mysql
```

### Остановка

```bash
# Остановить контейнеры
docker-compose down

# Остановить И удалить volumes (БД будет удалена!)
docker-compose down -v
```

### Перезапуск

```bash
# Пересобрать образы
docker-compose build --no-cache

# Перезапустить с новым образом
docker-compose up -d --build

# Перезапустить только PHP
docker-compose restart integram-php
```

## 📊 Проверка статуса

```bash
# Статус контейнеров
docker-compose ps

# Проверка здоровья
docker-compose ps --format table

# Использование ресурсов
docker stats
```

## 🔍 Отладка

### Войти в контейнер

```bash
# PHP контейнер
docker-compose exec integram-php bash

# MySQL контейнер
docker-compose exec mysql bash

# MySQL клиент
docker-compose exec mysql mysql -u integram_user -p integram_db
```

### Логи Apache

```bash
# Внутри PHP контейнера
docker-compose exec integram-php tail -f /var/log/apache2/error.log
docker-compose exec integram-php tail -f /var/log/apache2/access.log
```

### Проверка конфигурации

```bash
# Apache syntax
docker-compose exec integram-php apachectl configtest

# Список модулей
docker-compose exec integram-php apachectl -M

# Список сайтов
docker-compose exec integram-php apache2ctl -S
```

## 🗄️ База данных

### Подключение

```yaml
Host: localhost
Port: 3306 (внутри контейнера)
Database: integram_db
User: integram_user
Password: integram_pass
Root Password: integram_root_pass
```

### Импорт дампа

```bash
# Скопировать дамп в контейнер
docker cp backup.sql integram-mysql:/tmp/

# Импортировать
docker-compose exec mysql mysql -u root -p integram_db < /tmp/backup.sql
```

### Экспорт дампа

```bash
# Создать дамп
docker-compose exec mysql mysqldump -u root -p integram_db > backup.sql
```

## 🌐 Эндпоинты

| URL | Описание |
|-----|----------|
| `http://localhost:8080/` | Главная страница |
| `http://localhost:8080/my` | База "my" (redirect на login) |
| `http://localhost:8080/a2025` | База "a2025" |
| `http://localhost:8080/app/` | Vue.js SPA |
| `http://localhost:8080/login.html` | Страница входа |
| `https://localhost:8443/` | HTTPS версия |

## 📝 API Endpoints

```bash
# Авторизация
curl -X POST "http://localhost:8080/my/auth?JSON_KV" \
  -d "login=d&pwd=d"

# Словарь (список таблиц)
curl "http://localhost:8080/my/_dict?JSON_KV" \
  -H "X-Authorization: YOUR_TOKEN"

# Список объектов
curl "http://localhost:8080/my/_list?typeId=18&JSON_KV" \
  -H "X-Authorization: YOUR_TOKEN"
```

## 🔐 SSL Сертификат

### Для разработки

Используется самоподписанный сертификат (создается автоматически).

**Браузер покажет предупреждение** - это нормально для dev окружения.

### Для production

Заменить сертификат на Let's Encrypt:

```bash
# 1. Получить реальный сертификат на production сервере
# 2. Скопировать в volume
docker cp fullchain.pem integram-php-app:/etc/letsencrypt/live/integram/
docker cp privkey.pem integram-php-app:/etc/letsencrypt/live/integram/

# 3. Перезапустить Apache
docker-compose restart integram-php
```

## 📁 Volumes

| Volume | Описание | Путь |
|--------|----------|------|
| `mysql_data` | База данных MySQL | `/var/lib/mysql` |
| `./logs` | Логи приложения | `/var/www/html/logs` |
| `./download` | Загруженные файлы | `/var/www/html/download` |

## 🛠️ Конфигурация

### PHP настройки

Создать `php.ini`:

```bash
# integram-server/php.ini
upload_max_filesize = 100M
post_max_size = 100M
max_execution_time = 300
memory_limit = 512M
```

Добавить в `docker-compose.yml`:

```yaml
volumes:
  - ./php.ini:/usr/local/etc/php/conf.d/custom.ini
```

### Apache настройки

Файлы конфигурации:
- `apache-config/integram-rf.conf` - главный VirtualHost
- `apache-config/integram-dual.conf` - /app alias

Редактировать → пересобрать образ:

```bash
docker-compose up -d --build
```

## 🔄 Синхронизация с production

```bash
# На production сервере создать дамп
ssh root@185.128.105.78
mysqldump -u root -p integram_db > /tmp/integram_backup.sql
exit

# Скопировать дамп
scp root@185.128.105.78:/tmp/integram_backup.sql ./

# Импортировать в Docker
docker cp integram_backup.sql integram-mysql:/tmp/
docker-compose exec mysql mysql -u root -pintegram_root_pass integram_db < /tmp/integram_backup.sql
```

## ⚠️ Troubleshooting

### Порты заняты

```bash
# Изменить порты в docker-compose.yml:
ports:
  - "9080:80"   # вместо 8080
  - "9443:443"  # вместо 8443
```

### Permission denied

```bash
# Исправить права на host машине
sudo chown -R $USER:$USER ./logs ./download
chmod 755 ./logs ./download
```

### MySQL не стартует

```bash
# Удалить volume и пересоздать
docker-compose down -v
docker-compose up -d
```

### Apache не стартует

```bash
# Проверить конфигурацию
docker-compose exec integram-php apachectl configtest

# Посмотреть логи
docker-compose logs integram-php
```

## 📚 Полезные команды

```bash
# Очистить всё (контейнеры, образы, volumes)
docker-compose down -v --rmi all

# Посмотреть размер контейнеров
docker system df

# Очистить unused данные
docker system prune -a

# Пересоздать всё с нуля
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

## 🎯 Production Deployment

Для deployment на новый сервер:

```bash
# 1. Клонировать репозиторий
git clone https://github.com/unidel2035/integram-standalone.git
cd integram-standalone/integram-server/

# 2. Настроить переменные окружения
cp .env.example .env
nano .env

# 3. Запустить
docker-compose -f docker-compose.prod.yml up -d

# 4. Импортировать БД
docker cp backup.sql integram-mysql:/tmp/
docker-compose exec mysql mysql -u root -p integram_db < /tmp/backup.sql

# 5. Проверить
curl http://localhost:8080/
```

---

**Готово!** Теперь Integram можно развернуть одной командой 🚀
