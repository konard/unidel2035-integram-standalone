#!/bin/bash

# Integram Standalone - Deployment Script
# Автоматический деплой проекта на production сервер

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Конфигурация
DEPLOY_DIR="/var/www/integram-standalone"
REPO_URL="https://github.com/unidel2035/integram-standalone.git"
BRANCH="${1:-master}"
NODE_VERSION="20"

echo -e "${GREEN}=== Integram Standalone Deployment ===${NC}"
echo -e "Deploy directory: ${YELLOW}$DEPLOY_DIR${NC}"
echo -e "Branch: ${YELLOW}$BRANCH${NC}"
echo ""

# Проверка Node.js
echo -e "${GREEN}Checking Node.js version...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found! Installing...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

NODE_VER=$(node --version)
echo -e "Node.js version: ${GREEN}$NODE_VER${NC}"

# Проверка Git
if ! command -v git &> /dev/null; then
    echo -e "${RED}Git not found! Installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y git
fi

# Создать директорию
echo -e "${GREEN}Creating deployment directory...${NC}"
sudo mkdir -p $DEPLOY_DIR
sudo chown -R $USER:$USER $DEPLOY_DIR

# Клонировать или обновить репозиторий
if [ -d "$DEPLOY_DIR/.git" ]; then
    echo -e "${GREEN}Updating existing repository...${NC}"
    cd $DEPLOY_DIR
    git fetch origin
    git reset --hard origin/$BRANCH
    git pull origin $BRANCH
else
    echo -e "${GREEN}Cloning repository...${NC}"
    git clone -b $BRANCH $REPO_URL $DEPLOY_DIR
    cd $DEPLOY_DIR
fi

echo -e "${GREEN}Current commit: ${YELLOW}$(git rev-parse --short HEAD)${NC}"

# Установить зависимости frontend
echo -e "${GREEN}Installing frontend dependencies...${NC}"
npm ci --production=false

# Собрать frontend
echo -e "${GREEN}Building frontend...${NC}"
npm run build

# Установить зависимости backend
echo -e "${GREEN}Installing backend dependencies...${NC}"
cd backend/monolith
npm ci --production

# Вернуться в корневую директорию
cd $DEPLOY_DIR

# Создать .env если не существует
if [ ! -f "$DEPLOY_DIR/.env" ]; then
    echo -e "${YELLOW}Creating .env file from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env file with your configuration${NC}"
fi

# Настроить права
echo -e "${GREEN}Setting permissions...${NC}"
sudo chown -R www-data:www-data $DEPLOY_DIR/dist
sudo chown -R www-data:www-data $DEPLOY_DIR/backend

# Перезапустить сервис если существует
if sudo systemctl is-active --quiet integram-standalone; then
    echo -e "${GREEN}Restarting integram-standalone service...${NC}"
    sudo systemctl restart integram-standalone
    sudo systemctl status integram-standalone --no-pager
elif sudo systemctl is-enabled --quiet integram-standalone 2>/dev/null; then
    echo -e "${GREEN}Starting integram-standalone service...${NC}"
    sudo systemctl start integram-standalone
    sudo systemctl status integram-standalone --no-pager
else
    echo -e "${YELLOW}⚠️  Service not found. Run setup-service.sh to create systemd service${NC}"
fi

# Перезагрузить nginx если установлен
if command -v nginx &> /dev/null; then
    echo -e "${GREEN}Reloading nginx...${NC}"
    sudo nginx -t && sudo systemctl reload nginx
fi

echo ""
echo -e "${GREEN}=== Deployment completed successfully! ===${NC}"
echo -e "Application directory: ${YELLOW}$DEPLOY_DIR${NC}"
echo -e "Frontend build: ${YELLOW}$DEPLOY_DIR/dist${NC}"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "1. Check logs: ${YELLOW}sudo journalctl -u integram-standalone -f${NC}"
echo "2. Test application: ${YELLOW}http://$(hostname -I | awk '{print $1}')${NC}"
echo "3. Configure nginx for production"
