#!/bin/bash
# ============================================
# Migrate GHL Data from perfect-catch-db to automation DB
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}GHL Data Migration: 5433 → 6432${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

# Check source data
echo -e "${YELLOW}Checking source data (perfect-catch-db:5433)...${NC}"
SOURCE_CONTACTS=$(docker exec perfect-catch-db psql -U postgres -d pricebook -t -c "SELECT count(*) FROM ghl_contacts;")
SOURCE_OPPS=$(docker exec perfect-catch-db psql -U postgres -d pricebook -t -c "SELECT count(*) FROM ghl_opportunities;")
SOURCE_SYNC=$(docker exec perfect-catch-db psql -U postgres -d pricebook -t -c "SELECT count(*) FROM ghl_sync_log;")

echo "  ghl_contacts: $SOURCE_CONTACTS"
echo "  ghl_opportunities: $SOURCE_OPPS"
echo "  ghl_sync_log: $SOURCE_SYNC"
echo ""

# Check target data
echo -e "${YELLOW}Checking target data (postgres:6432)...${NC}"
TARGET_CONTACTS=$(docker exec postgres psql -U postgres -d perfectcatch_automation -t -c "SELECT count(*) FROM ghl_contacts;")
TARGET_OPPS=$(docker exec postgres psql -U postgres -d perfectcatch_automation -t -c "SELECT count(*) FROM ghl_opportunities;")
TARGET_SYNC=$(docker exec postgres psql -U postgres -d perfectcatch_automation -t -c "SELECT count(*) FROM ghl_sync_log;")

echo "  ghl_contacts: $TARGET_CONTACTS"
echo "  ghl_opportunities: $TARGET_OPPS"
echo "  ghl_sync_log: $TARGET_SYNC"
echo ""

# Confirm migration
echo -e "${YELLOW}This will migrate GHL data from perfect-catch-db to automation DB.${NC}"
echo -e "${YELLOW}Target tables will be TRUNCATED before import.${NC}"
read -p "Type 'MIGRATE' to proceed: " confirm

if [ "$confirm" != "MIGRATE" ]; then
  echo -e "${RED}Aborted${NC}"
  exit 1
fi

# Create backup directory
BACKUP_DIR="/tmp/ghl_migration_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Export from source
echo ""
echo -e "${YELLOW}Exporting GHL data from source...${NC}"
docker exec perfect-catch-db pg_dump -U postgres -d pricebook \
  --data-only --inserts \
  -t ghl_contacts -t ghl_opportunities -t ghl_sync_log \
  > "$BACKUP_DIR/ghl_data.sql"

echo -e "${GREEN}✓ Exported to $BACKUP_DIR/ghl_data.sql${NC}"

# Backup target (just in case)
echo -e "${YELLOW}Backing up target tables...${NC}"
docker exec postgres pg_dump -U postgres -d perfectcatch_automation \
  --data-only --inserts \
  -t ghl_contacts -t ghl_opportunities -t ghl_sync_log \
  > "$BACKUP_DIR/ghl_data_target_backup.sql"

echo -e "${GREEN}✓ Target backup saved${NC}"

# Truncate target tables
echo -e "${YELLOW}Truncating target tables...${NC}"
docker exec postgres psql -U postgres -d perfectcatch_automation -c "
  TRUNCATE ghl_sync_log CASCADE;
  TRUNCATE ghl_opportunities CASCADE;
  TRUNCATE ghl_contacts CASCADE;
"

# Import to target
echo -e "${YELLOW}Importing GHL data to target...${NC}"
docker exec -i postgres psql -U postgres -d perfectcatch_automation < "$BACKUP_DIR/ghl_data.sql"

echo -e "${GREEN}✓ Import complete${NC}"

# Verify migration
echo ""
echo -e "${YELLOW}Verifying migration...${NC}"
NEW_CONTACTS=$(docker exec postgres psql -U postgres -d perfectcatch_automation -t -c "SELECT count(*) FROM ghl_contacts;")
NEW_OPPS=$(docker exec postgres psql -U postgres -d perfectcatch_automation -t -c "SELECT count(*) FROM ghl_opportunities;")
NEW_SYNC=$(docker exec postgres psql -U postgres -d perfectcatch_automation -t -c "SELECT count(*) FROM ghl_sync_log;")

echo "  ghl_contacts: $NEW_CONTACTS (was $TARGET_CONTACTS)"
echo "  ghl_opportunities: $NEW_OPPS (was $TARGET_OPPS)"
echo "  ghl_sync_log: $NEW_SYNC (was $TARGET_SYNC)"
echo ""

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Migration Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Backup files saved to: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "  1. Verify data in automation DB"
echo "  2. Run cleanup-pricebook-db.sh to remove stale tables"
echo "  3. Update application .env files"
