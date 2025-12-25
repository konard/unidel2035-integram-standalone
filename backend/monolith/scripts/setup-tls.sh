#!/bin/bash
# Скрипт автоматической настройки TLS/SSL для mail.drondoc.ru
# Запускать с правами root на сервере mail.drondoc.ru
# Версия: 1.0
# Дата: 2025-12-15

DOMAIN="mail.drondoc.ru"
EMAIL="admin@drondoc.ru"

echo "╔════════════════════════════════════════════════════════╗"
echo "║        Настройка TLS/SSL для ${DOMAIN}                ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
   echo "❌ Ошибка: Скрипт должен быть запущен с правами root"
   echo "Используйте: sudo bash setup-tls.sh"
   exit 1
fi

# Шаг 1: Установка Certbot
echo "1️⃣  Проверка и установка Certbot..."
if ! command -v certbot &> /dev/null; then
    echo "   Certbot не найден. Устанавливаю..."
    apt update
    apt install -y certbot
    echo "   ✅ Certbot установлен"
else
    echo "   ✅ Certbot уже установлен"
fi
echo ""

# Шаг 2: Получение SSL сертификата
echo "2️⃣  Получение SSL сертификата от Let's Encrypt..."
echo "   ⚠️  Важно: Убедитесь, что порт 80 доступен извне!"
echo ""

if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    echo "   ✅ Сертификат уже существует для ${DOMAIN}"
    echo "   Обновление сертификата..."
    certbot renew --cert-name ${DOMAIN}
else
    echo "   Запрос нового сертификата..."
    certbot certonly --standalone \
        --preferred-challenges http \
        --email ${EMAIL} \
        --agree-tos \
        --no-eff-email \
        -d ${DOMAIN}

    if [ $? -eq 0 ]; then
        echo "   ✅ Сертификат успешно получен"
    else
        echo "   ❌ Ошибка получения сертификата"
        echo "   Проверьте:"
        echo "   - DNS A запись для ${DOMAIN} указывает на этот сервер"
        echo "   - Порт 80 открыт и доступен извне"
        echo "   - Firewall не блокирует входящие соединения"
        exit 1
    fi
fi
echo ""

# Шаг 3: Настройка автоматического обновления
echo "3️⃣  Настройка автоматического обновления сертификатов..."

# Создание hook для перезапуска Postfix после обновления сертификата
cat > /etc/letsencrypt/renewal-hooks/deploy/postfix-reload.sh <<'EOF'
#!/bin/bash
systemctl reload postfix
EOF

chmod +x /etc/letsencrypt/renewal-hooks/deploy/postfix-reload.sh

# Добавление cron задачи (если еще не добавлена)
if ! crontab -l | grep -q "certbot renew"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload postfix'") | crontab -
    echo "   ✅ Cron задача для обновления сертификатов добавлена"
else
    echo "   ✅ Cron задача уже существует"
fi
echo ""

# Шаг 4: Настройка Postfix для TLS
echo "4️⃣  Настройка Postfix для TLS..."

# Backup конфигурации
cp /etc/postfix/main.cf /etc/postfix/main.cf.backup.$(date +%Y%m%d_%H%M%S)

# Добавление TLS настроек в main.cf (если еще не добавлены)
if grep -q "smtpd_tls_cert_file" /etc/postfix/main.cf; then
    echo "   ⚠️  TLS настройки уже присутствуют в main.cf"
    echo "   Обновление путей к сертификатам..."

    # Обновление путей
    sed -i "s|^smtpd_tls_cert_file.*|smtpd_tls_cert_file = /etc/letsencrypt/live/${DOMAIN}/fullchain.pem|" /etc/postfix/main.cf
    sed -i "s|^smtpd_tls_key_file.*|smtpd_tls_key_file = /etc/letsencrypt/live/${DOMAIN}/privkey.pem|" /etc/postfix/main.cf
else
    echo "   Добавление TLS настроек..."
    cat >> /etc/postfix/main.cf <<EOF

# TLS Configuration for ${DOMAIN}
# Добавлено автоматически: $(date)

# Пути к сертификатам
smtpd_tls_cert_file = /etc/letsencrypt/live/${DOMAIN}/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/${DOMAIN}/privkey.pem
smtpd_tls_CAfile = /etc/letsencrypt/live/${DOMAIN}/chain.pem

# Включение TLS для входящих соединений (порт 25)
smtpd_tls_security_level = may
smtpd_tls_loglevel = 1
smtpd_tls_received_header = yes
smtpd_tls_session_cache_database = btree:\${data_directory}/smtpd_scache

# Настройки для исходящих соединений
smtp_tls_security_level = may
smtp_tls_loglevel = 1
smtp_tls_session_cache_database = btree:\${data_directory}/smtp_scache

# TLS параметры
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtp_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtpd_tls_mandatory_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtp_tls_mandatory_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1

# Предпочитаемые cipher suites
smtpd_tls_mandatory_ciphers = high
tls_high_cipherlist = ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA256
EOF
fi

echo "   ✅ TLS настроен в main.cf"
echo ""

# Шаг 5: Настройка порта 587 (submission)
echo "5️⃣  Настройка порта 587 (submission) с обязательным TLS..."

# Backup конфигурации
cp /etc/postfix/master.cf /etc/postfix/master.cf.backup.$(date +%Y%m%d_%H%M%S)

# Проверка, не настроен ли уже порт 587
if grep -q "^submission.*inet.*smtpd" /etc/postfix/master.cf; then
    echo "   ⚠️  Порт 587 уже настроен"
else
    echo "   Добавление настроек порта 587..."
    cat >> /etc/postfix/master.cf <<EOF

# Submission port (587) with mandatory TLS
# Добавлено автоматически: $(date)
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=no
  -o smtpd_client_restrictions=permit_mynetworks,reject
  -o smtpd_relay_restrictions=permit_mynetworks,reject
EOF
    echo "   ✅ Порт 587 настроен"
fi
echo ""

# Шаг 6: Проверка конфигурации
echo "6️⃣  Проверка конфигурации Postfix..."
if postfix check; then
    echo "   ✅ Конфигурация Postfix корректна"
else
    echo "   ❌ Ошибка в конфигурации Postfix"
    exit 1
fi
echo ""

# Шаг 7: Перезапуск Postfix
echo "7️⃣  Перезапуск Postfix..."
systemctl restart postfix

if systemctl is-active --quiet postfix; then
    echo "   ✅ Postfix успешно перезапущен"
else
    echo "   ❌ Ошибка перезапуска Postfix"
    systemctl status postfix --no-pager
    exit 1
fi
echo ""

# Шаг 8: Проверка работы TLS
echo "════════════════════════════════════════════════════════"
echo "✅ TLS успешно настроен!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "🔍 Проверка TLS..."
echo ""

# Проверка порта 25 (STARTTLS)
echo "Порт 25 (STARTTLS):"
if timeout 5 bash -c "echo QUIT | openssl s_client -connect ${DOMAIN}:25 -starttls smtp 2>/dev/null" | grep -q "Verify return code"; then
    echo "   ✅ TLS работает на порту 25"
else
    echo "   ⚠️  TLS не работает на порту 25 (возможно, нужно время)"
fi

# Проверка порта 587 (STARTTLS mandatory)
echo ""
echo "Порт 587 (Submission с обязательным TLS):"
if netstat -tuln | grep -q ":587"; then
    echo "   ✅ Порт 587 слушается"

    if timeout 5 bash -c "echo QUIT | openssl s_client -connect ${DOMAIN}:587 -starttls smtp 2>/dev/null" | grep -q "Verify return code"; then
        echo "   ✅ TLS работает на порту 587"
    else
        echo "   ⚠️  TLS не работает на порту 587"
    fi
else
    echo "   ⚠️  Порт 587 не слушается (проверьте master.cf)"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "📝 Следующие шаги:"
echo "════════════════════════════════════════════════════════"
echo ""
echo "1. Обновите backend конфигурацию (.env):"
echo "   SMTP_HOST=mail.drondoc.ru"
echo "   SMTP_PORT=587"
echo "   SMTP_SECURE=false  # false = STARTTLS, true = SSL/TLS"
echo ""
echo "2. Протестируйте отправку через порт 587:"
echo "   openssl s_client -connect ${DOMAIN}:587 -starttls smtp"
echo ""
echo "3. Проверьте логи Postfix:"
echo "   tail -f /var/log/mail.log"
echo ""
echo "4. Проверьте TLS соединение:"
echo "   echo QUIT | openssl s_client -connect ${DOMAIN}:587 -starttls smtp"
echo ""
echo "5. Сертификат будет автоматически обновляться через cron"
echo "   Проверка: certbot certificates"
echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ Настройка завершена!"
echo ""

exit 0
