#!/bin/bash
# Database Setup Script for DronDoc Monolithic Backend
# This script automates database creation and migration for PostgreSQL

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$(dirname "$BACKEND_DIR")")"

echo -e "${BLUE}===========================================
DronDoc Database Setup Script
===========================================${NC}\n"

# Load .env if it exists
if [ -f "$BACKEND_DIR/.env" ]; then
    echo -e "${GREEN}✓${NC} Loading environment variables from .env"
    export $(grep -v '^#' "$BACKEND_DIR/.env" | xargs)
fi

# Function to print section headers
section() {
    echo -e "\n${BLUE}[$(date +%H:%M:%S)]${NC} $1"
}

# Function to print success messages
success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error messages
error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to print warning messages
warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Function to URL encode special characters in passwords
urlencode() {
    local string="${1}"
    local strlen=${#string}
    local encoded=""
    local pos c o

    for (( pos=0 ; pos<strlen ; pos++ )); do
        c=${string:$pos:1}
        case "$c" in
            [-_.~a-zA-Z0-9] ) o="${c}" ;;
            * ) printf -v o '%%%02x' "'$c"
        esac
        encoded+="${o}"
    done
    echo "${encoded}"
}

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    error "PostgreSQL client (psql) is not installed"
    echo "  Install it with: sudo apt-get install postgresql-client"
    exit 1
fi

success "PostgreSQL client is installed"

# Get database configuration
section "Database Configuration"

# Read configuration from .env or prompt user
if [ -z "$DB_HOST" ]; then
    read -p "Database host [localhost]: " DB_HOST
    DB_HOST=${DB_HOST:-localhost}
fi

if [ -z "$DB_PORT" ]; then
    read -p "Database port [5432]: " DB_PORT
    DB_PORT=${DB_PORT:-5432}
fi

if [ -z "$DB_NAME" ]; then
    read -p "Database name [dronedoc]: " DB_NAME
    DB_NAME=${DB_NAME:-dronedoc}
fi

if [ -z "$DB_USER" ]; then
    read -p "Database user [dronedoc]: " DB_USER
    DB_USER=${DB_USER:-dronedoc}
fi

if [ -z "$DB_PASSWORD" ]; then
    read -sp "Database password: " DB_PASSWORD
    echo
fi

# URL encode the password for DATABASE_URL
DB_PASSWORD_ENCODED=$(urlencode "$DB_PASSWORD")

# Construct DATABASE_URL
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD_ENCODED}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo -e "\n${GREEN}Configuration:${NC}"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Password: $(echo "$DB_PASSWORD" | sed 's/./*/g')"
echo "  Connection URL: postgresql://${DB_USER}:***@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Test connection to PostgreSQL server
section "Testing PostgreSQL Connection"

if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c '\q' 2>/dev/null; then
    success "Successfully connected to PostgreSQL server"
else
    error "Failed to connect to PostgreSQL server"
    echo "  Please check your credentials and ensure PostgreSQL is running"
    exit 1
fi

# Create database if it doesn't exist
section "Creating Database"

if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    warning "Database '$DB_NAME' already exists"
else
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null; then
        success "Database '$DB_NAME' created successfully"
    else
        warning "Could not create database (may already exist or insufficient permissions)"
    fi
fi

# Test connection to the database
section "Testing Database Connection"

if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c '\q' 2>/dev/null; then
    success "Successfully connected to database '$DB_NAME'"
else
    error "Failed to connect to database '$DB_NAME'"
    exit 1
fi

# Run migrations
section "Running Database Migrations"

MIGRATION_DIR="$BACKEND_DIR/migrations"

if [ ! -d "$MIGRATION_DIR" ]; then
    error "Migration directory not found: $MIGRATION_DIR"
    exit 1
fi

# Find all SQL migration files (sorted)
MIGRATIONS=($(find "$MIGRATION_DIR" -name "*.sql" | sort))

if [ ${#MIGRATIONS[@]} -eq 0 ]; then
    warning "No migration files found in $MIGRATION_DIR"
else
    echo "Found ${#MIGRATIONS[@]} migration files"

    for migration in "${MIGRATIONS[@]}"; do
        migration_name=$(basename "$migration")
        echo -ne "  Applying $migration_name... "

        if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${YELLOW}⚠${NC} (may already be applied)"
        fi
    done

    success "All migrations processed"
fi

# Verify tables were created
section "Verifying Database Schema"

EXPECTED_TABLES=(
    "ai_model_providers"
    "ai_models"
    "ai_access_tokens"
    "ai_token_usage"
    "ai_provider_api_keys"
    "user_model_preferences"
    "ai_token_transactions"
    "backend_error_logs"
    "backend_health_metrics"
    "backend_recovery_actions"
    "backend_health_config"
    "backend_error_patterns"
    "backend_restart_history"
)

echo "Checking for required tables..."

TABLES_FOUND=0
for table in "${EXPECTED_TABLES[@]}"; do
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM pg_tables WHERE tablename='$table'" 2>/dev/null | grep -q 1; then
        echo -e "  ${GREEN}✓${NC} $table"
        TABLES_FOUND=$((TABLES_FOUND + 1))
    else
        echo -e "  ${RED}✗${NC} $table (missing)"
    fi
done

if [ $TABLES_FOUND -eq ${#EXPECTED_TABLES[@]} ]; then
    success "All required tables exist"
else
    warning "Some tables are missing. Database may not be fully initialized."
fi

# Test AI models query
section "Testing AI Models Query"

MODEL_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM ai_models" 2>/dev/null || echo "0")

if [ "$MODEL_COUNT" -gt 0 ]; then
    success "Found $MODEL_COUNT AI models in database"

    # Show available models
    echo -e "\n${BLUE}Available AI Models:${NC}"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT
            p.display_name as \"Provider\",
            m.display_name as \"Model\",
            m.model_id as \"Model ID\"
        FROM ai_models m
        JOIN ai_model_providers p ON m.provider_id = p.id
        WHERE m.is_active = true
        ORDER BY p.name, m.display_name
        LIMIT 10;
    " 2>/dev/null
else
    warning "No AI models found in database"
fi

# Update .env file
section "Updating .env File"

ENV_FILE="$BACKEND_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    warning ".env file not found, creating from .env.example"
    if [ -f "$BACKEND_DIR/.env.example" ]; then
        cp "$BACKEND_DIR/.env.example" "$ENV_FILE"
    else
        touch "$ENV_FILE"
    fi
fi

# Update or add DATABASE_URL
if grep -q "^DATABASE_URL=" "$ENV_FILE"; then
    # Update existing
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL|" "$ENV_FILE"
    success "Updated DATABASE_URL in .env"
else
    # Add new
    echo "DATABASE_URL=$DATABASE_URL" >> "$ENV_FILE"
    success "Added DATABASE_URL to .env"
fi

# Update individual DB variables
for var in DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD; do
    value="${!var}"
    if grep -q "^$var=" "$ENV_FILE"; then
        sed -i "s|^$var=.*|$var=$value|" "$ENV_FILE"
    else
        echo "$var=$value" >> "$ENV_FILE"
    fi
done

success ".env file updated with database configuration"

# Final summary
section "Setup Complete!"

echo -e "
${GREEN}✓ Database Setup Successful!${NC}

${BLUE}Summary:${NC}
  • Database: $DB_NAME
  • Host: $DB_HOST:$DB_PORT
  • User: $DB_USER
  • Tables: $TABLES_FOUND/${#EXPECTED_TABLES[@]} created
  • AI Models: $MODEL_COUNT available

${BLUE}Next Steps:${NC}
  1. Set your AI provider API keys in .env:
     ${YELLOW}DEEPSEEK_API_KEY=your-api-key-here${NC}
     ${YELLOW}OPENAI_API_KEY=your-api-key-here${NC}

  2. Start the backend server:
     ${YELLOW}cd $BACKEND_DIR${NC}
     ${YELLOW}npm start${NC}

  3. Test the API:
     ${YELLOW}curl http://localhost:8001/api/health${NC}
     ${YELLOW}curl http://localhost:8001/api/ai-tokens/models${NC}

${BLUE}Documentation:${NC}
  • Database setup: $BACKEND_DIR/docs/DATABASE_SETUP.md
  • Deployment: $BACKEND_DIR/DEPLOYMENT.md
  • API reference: $BACKEND_DIR/README.md

${GREEN}Happy coding! 🚀${NC}
"
