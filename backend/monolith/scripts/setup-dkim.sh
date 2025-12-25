#!/bin/bash
# Скрипт автоматической настройки DKIM для mail.example.integram.io
# Запускать с правами root на сервере mail.example.integram.io
# Версия: 1.0
# Дата: 2025-12-15

DOMAIN="example.integram.io"
SELECTOR="default"
OPENDKIM_DIR="/etc/opendkim"
KEYS_DIR="${OPENDKIM_DIR}/keys/${DOMAIN}"

echo "╔════════════════════════════════════════════════════════╗"
echo "║        Настройка DKIM для ${DOMAIN}                    ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
   echo "❌ Ошибка: Скрипт должен быть запущен с правами root"
   echo "Используйте: sudo bash setup-dkim.sh"
   exit 1
fi

# Шаг 1: Установка OpenDKIM
echo "1️⃣  Проверка и установка OpenDKIM..."
if ! command -v opendkim &> /dev/null; then
    echo "   OpenDKIM не найден. Устанавливаю..."
    apt update
    apt install -y opendkim opendkim-tools
    echo "   ✅ OpenDKIM установлен"
else
    echo "   ✅ OpenDKIM уже установлен"
fi
echo ""

# Шаг 2: Создание директорий
echo "2️⃣  Создание директорий для ключей..."
mkdir -p "${KEYS_DIR}"
echo "   ✅ Директория ${KEYS_DIR} создана"
echo ""

# Шаг 3: Генерация ключей
echo "3️⃣  Генерация DKIM ключей..."
if [ -f "${KEYS_DIR}/${SELECTOR}.private" ]; then
    echo "   ⚠️  Ключи уже существуют. Создать новые? (y/n)"
    read -r response
    if [ "$response" != "y" ]; then
        echo "   ⏭️  Пропускаю генерацию ключей"
    else
        rm -f "${KEYS_DIR}/${SELECTOR}.private" "${KEYS_DIR}/${SELECTOR}.txt"
        opendkim-genkey -b 2048 -s ${SELECTOR} -d ${DOMAIN} -D ${KEYS_DIR}
        echo "   ✅ Новые ключи созданы"
    fi
else
    opendkim-genkey -b 2048 -s ${SELECTOR} -d ${DOMAIN} -D ${KEYS_DIR}
    echo "   ✅ Ключи созданы"
fi

# Установка правильных прав
chown -R opendkim:opendkim ${KEYS_DIR}
chmod 600 ${KEYS_DIR}/${SELECTOR}.private
echo "   ✅ Права на ключи установлены"
echo ""

# Шаг 4: Настройка конфигурации OpenDKIM
echo "4️⃣  Настройка OpenDKIM..."

# Основной конфиг
cat > ${OPENDKIM_DIR}/opendkim.conf <<EOF
# Основная конфигурация OpenDKIM для ${DOMAIN}
# Создано автоматически: $(date)

# Режим работы
Mode                    sv
Syslog                  yes
SyslogSuccess           yes
LogWhy                  yes

# Домен и селектор
Domain                  ${DOMAIN}
Selector                ${SELECTOR}

# Пути к ключам
KeyTable                ${OPENDKIM_DIR}/KeyTable
SigningTable            ${OPENDKIM_DIR}/SigningTable
ExternalIgnoreList      ${OPENDKIM_DIR}/TrustedHosts
InternalHosts           ${OPENDKIM_DIR}/TrustedHosts

# Сокет для Postfix
Socket                  inet:8891@localhost
PidFile                 /var/run/opendkim/opendkim.pid

# Каноникализация
Canonicalization        relaxed/simple

# Алгоритм подписи
SignatureAlgorithm      rsa-sha256

# Другие параметры
AutoRestart             yes
AutoRestartRate         10/1h
UMask                   002
UserID                  opendkim:opendkim
EOF

# KeyTable
cat > ${OPENDKIM_DIR}/KeyTable <<EOF
# KeyTable for OpenDKIM
# Формат: selector._domainkey.domain domain:selector:keyfile
${SELECTOR}._domainkey.${DOMAIN} ${DOMAIN}:${SELECTOR}:${KEYS_DIR}/${SELECTOR}.private
EOF

# SigningTable
cat > ${OPENDKIM_DIR}/SigningTable <<EOF
# SigningTable for OpenDKIM
# Формат: pattern key
*@${DOMAIN} ${SELECTOR}._domainkey.${DOMAIN}
EOF

# TrustedHosts
cat > ${OPENDKIM_DIR}/TrustedHosts <<EOF
# Trusted hosts for OpenDKIM
127.0.0.1
localhost
185.204.3.24
*.${DOMAIN}
${DOMAIN}
EOF

echo "   ✅ Конфигурация OpenDKIM создана"
echo ""

# Шаг 5: Настройка Postfix
echo "5️⃣  Настройка Postfix для DKIM..."

# Проверка, не добавлены ли уже настройки
if grep -q "milter_default_action" /etc/postfix/main.cf; then
    echo "   ⚠️  Настройки milter уже присутствуют в main.cf"
    echo "   ⏭️  Пропускаю изменение Postfix"
else
    cat >> /etc/postfix/main.cf <<EOF

# OpenDKIM milter configuration
# Добавлено автоматически: $(date)
milter_default_action = accept
milter_protocol = 6
smtpd_milters = inet:127.0.0.1:8891
non_smtpd_milters = inet:127.0.0.1:8891
EOF
    echo "   ✅ Postfix настроен для работы с DKIM"
fi
echo ""

# Шаг 6: Перезапуск сервисов
echo "6️⃣  Перезапуск сервисов..."
systemctl restart opendkim
systemctl restart postfix

# Проверка статуса
if systemctl is-active --quiet opendkim; then
    echo "   ✅ OpenDKIM запущен"
else
    echo "   ❌ Ошибка: OpenDKIM не запустился"
    systemctl status opendkim --no-pager
    exit 1
fi

if systemctl is-active --quiet postfix; then
    echo "   ✅ Postfix запущен"
else
    echo "   ❌ Ошибка: Postfix не запустился"
    systemctl status postfix --no-pager
    exit 1
fi
echo ""

# Шаг 7: Включение автозапуска
echo "7️⃣  Включение автозапуска OpenDKIM..."
systemctl enable opendkim
echo "   ✅ Автозапуск включен"
echo ""

# Шаг 8: Вывод DNS записи
echo "════════════════════════════════════════════════════════"
echo "✅ DKIM успешно настроен!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "📋 Следующий шаг: Добавить DNS TXT запись"
echo ""
echo "Тип записи: TXT"
echo "Имя: ${SELECTOR}._domainkey.${DOMAIN}"
echo ""
echo "Значение (скопируйте все, кроме комментариев):"
echo "----------------------------------------"
cat ${KEYS_DIR}/${SELECTOR}.txt | grep -v "^;" | tr -d '\n' | sed 's/"\s*"//g'
echo ""
echo "----------------------------------------"
echo ""
echo "Или в более читаемом виде:"
cat ${KEYS_DIR}/${SELECTOR}.txt
echo ""

# Шаг 9: Тест конфигурации
echo "🔍 Проверка конфигурации..."
echo ""

# Проверка сокета
if netstat -tuln | grep -q 8891; then
    echo "   ✅ OpenDKIM слушает порт 8891"
else
    echo "   ⚠️  OpenDKIM не слушает порт 8891 (возможна проблема)"
fi

# Проверка ключа
if opendkim-testkey -d ${DOMAIN} -s ${SELECTOR} -vvv; then
    echo "   ✅ DKIM ключ валиден (после добавления DNS записи)"
else
    echo "   ⚠️  DKIM ключ не найден в DNS (нормально до добавления DNS записи)"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "📝 Инструкции для завершения настройки:"
echo "════════════════════════════════════════════════════════"
echo ""
echo "1. Скопируйте DNS запись выше"
echo "2. Добавьте TXT запись в DNS панели для ${DOMAIN}"
echo "3. Подождите 10-30 минут (распространение DNS)"
echo "4. Проверьте: dig TXT ${SELECTOR}._domainkey.${DOMAIN} +short"
echo "5. Протестируйте DKIM:"
echo "   opendkim-testkey -d ${DOMAIN} -s ${SELECTOR} -vvv"
echo "6. Отправьте тестовое письмо на check-auth@verifier.port25.com"
echo "7. Или используйте https://www.mail-tester.com/"
echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ Настройка завершена!"
echo ""

exit 0
