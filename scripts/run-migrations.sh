#!/bin/bash
# ============================================
# Database Migration Script
# Run all SQL migrations for Perfect Catch ST Automation
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="${SERVICETITAN_DB_NAME:-servicetitan_mirror}"
DB_USER="${SERVICETITAN_DB_USER:-postgres}"
DB_HOST="${SERVICETITAN_DB_HOST:-localhost}"
DB_PORT="${SERVICETITAN_DB_PORT:-5432}"
MIGRATIONS_DIR="$(dirname "$0")/../src/db/migrations"

echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}Perfect Catch ST Automation - Database Migrations${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql command not found. Please install PostgreSQL client.${NC}"
    exit 1
fi

# Check database connection
echo -e "${YELLOW}Testing database connection...${NC}"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1" &> /dev/null; then
    echo -e "${RED}Error: Cannot connect to PostgreSQL server.${NC}"
    echo "Please check your connection settings:"
    echo "  Host: $DB_HOST"
    echo "  Port: $DB_PORT"
    echo "  User: $DB_USER"
    exit 1
fi

# Create database if it doesn't exist
echo -e "${YELLOW}Checking if database '$DB_NAME' exists...${NC}"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo -e "${YELLOW}Creating database '$DB_NAME'...${NC}"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
    echo -e "${GREEN}Database created successfully.${NC}"
else
    echo -e "${GREEN}Database '$DB_NAME' already exists.${NC}"
fi

# Run migrations in order
echo ""
echo -e "${YELLOW}Running migrations...${NC}"
echo ""

MIGRATION_FILES=(
    "001_pricebook_schema.sql"
    "002_servicetitan_complete.sql"
    "003_workflow_engine.sql"
    "004_callrail_tracking.sql"
    "005_messaging_system.sql"
)

for migration in "${MIGRATION_FILES[@]}"; do
    MIGRATION_PATH="$MIGRATIONS_DIR/$migration"
    if [ -f "$MIGRATION_PATH" ]; then
        echo -e "${YELLOW}Running: $migration${NC}"
        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_PATH" 2>&1; then
            echo -e "${GREEN}✓ $migration completed${NC}"
        else
            echo -e "${RED}✗ $migration failed${NC}"
            exit 1
        fi
        echo ""
    else
        echo -e "${YELLOW}⚠ Skipping $migration (file not found)${NC}"
    fi
done

# Verify tables created
echo -e "${YELLOW}Verifying tables...${NC}"
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
VIEW_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public';")
FUNCTION_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public';")

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Migration Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Summary:"
echo "  Tables created:    $(echo $TABLE_COUNT | xargs)"
echo "  Views created:     $(echo $VIEW_COUNT | xargs)"
echo "  Functions created: $(echo $FUNCTION_COUNT | xargs)"
echo ""
echo "Sample data:"
WORKFLOW_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM workflow_definitions;" 2>/dev/null || echo "0")
TEMPLATE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM messaging_templates;" 2>/dev/null || echo "0")
echo "  Workflow definitions: $(echo $WORKFLOW_COUNT | xargs)"
echo "  Messaging templates:  $(echo $TEMPLATE_COUNT | xargs)"
echo ""
echo -e "${GREEN}Database is ready for use!${NC}"
