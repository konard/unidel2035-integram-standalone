#!/bin/bash

# Quick Start скрипт для Docker Integram
# Автор: DronDoc Team
# Дата: 2025-12-26

set -e

echo "🚀 Integram Docker Quick Start"
echo "================================"
echo ""

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен!"
    echo "Установите Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose не установлен!"
    echo "Установите Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker найден: $(docker --version)"
echo "✅ Docker Compose найден: $(docker-compose --version)"
echo ""

# Переход в директорию скрипта
cd "$(dirname "$0")"

# Меню
echo "Выберите действие:"
echo "1) Запустить контейнеры (docker-compose up -d)"
echo "2) Остановить контейнеры (docker-compose down)"
echo "3) Перезапустить с rebuild (docker-compose up -d --build)"
echo "4) Посмотреть логи (docker-compose logs -f)"
echo "5) Посмотреть статус (docker-compose ps)"
echo "6) Полная очистка (docker-compose down -v)"
echo "7) Импорт дампа MySQL"
echo "8) Экспорт дампа MySQL"
echo "0) Выход"
echo ""
read -p "Ваш выбор: " choice

case $choice in
    1)
        echo ""
        echo "🚀 Запуск контейнеров..."
        docker-compose up -d
        echo ""
        echo "✅ Готово!"
        echo ""
        echo "Приложение доступно на:"
        echo "  HTTP:  http://localhost:8080"
        echo "  HTTPS: https://localhost:8443"
        echo ""
        echo "Эндпоинты:"
        echo "  /          - Главная страница"
        echo "  /my        - База 'my'"
        echo "  /a2025     - База 'a2025'"
        echo "  /app/      - Vue.js SPA"
        echo ""
        echo "Проверка статуса: docker-compose ps"
        echo "Логи: docker-compose logs -f"
        ;;
    2)
        echo ""
        echo "🛑 Остановка контейнеров..."
        docker-compose down
        echo "✅ Контейнеры остановлены"
        ;;
    3)
        echo ""
        echo "🔄 Пересборка и перезапуск..."
        docker-compose down
        docker-compose build --no-cache
        docker-compose up -d
        echo "✅ Готово!"
        ;;
    4)
        echo ""
        echo "📜 Логи (Ctrl+C для выхода)..."
        docker-compose logs -f
        ;;
    5)
        echo ""
        echo "📊 Статус контейнеров:"
        docker-compose ps
        ;;
    6)
        echo ""
        read -p "⚠️  ВНИМАНИЕ! Это удалит ВСЕ данные включая БД. Продолжить? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            docker-compose down -v --rmi all
            echo "✅ Всё удалено"
        else
            echo "❌ Отменено"
        fi
        ;;
    7)
        echo ""
        read -p "Путь к SQL дампу: " dump_file
        if [ -f "$dump_file" ]; then
            echo "📥 Импорт дампа..."
            docker cp "$dump_file" integram-mysql:/tmp/dump.sql
            docker-compose exec -T mysql mysql -u integram_user -pintegram_pass integram_db < "$dump_file"
            echo "✅ Дамп импортирован"
        else
            echo "❌ Файл не найден: $dump_file"
        fi
        ;;
    8)
        echo ""
        read -p "Имя файла для сохранения: " output_file
        echo "📤 Экспорт дампа..."
        docker-compose exec -T mysql mysqldump -u integram_user -pintegram_pass integram_db > "$output_file"
        echo "✅ Дамп сохранён: $output_file"
        ;;
    0)
        echo "👋 До свидания!"
        exit 0
        ;;
    *)
        echo "❌ Неверный выбор"
        exit 1
        ;;
esac
