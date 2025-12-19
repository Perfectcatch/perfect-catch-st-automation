#!/bin/bash
# ============================================
# Decommission perfect-catch-db Container
# Final step after data migration and cleanup
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}Decommission perfect-catch-db (Port 5433)${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

# Pre-flight checks
echo -e "${YELLOW}Pre-flight checks...${NC}"

# Check if container exists
if ! docker ps -a --format '{{.Names}}' | grep -q '^perfect-catch-db$'; then
  echo -e "${GREEN}Container 'perfect-catch-db' does not exist. Nothing to do.${NC}"
  exit 0
fi

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q '^perfect-catch-db$'; then
  echo "  Container is currently RUNNING"
else
  echo "  Container is STOPPED"
fi

# Check table count
TABLE_COUNT=$(docker exec perfect-catch-db psql -U postgres -d pricebook -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null || echo "0")
echo "  Tables remaining: $TABLE_COUNT"

if [ "$TABLE_COUNT" -gt "0" ]; then
  echo ""
  echo -e "${YELLOW}WARNING: Database still has tables!${NC}"
  echo "Run cleanup-pricebook-db.sql first to remove tables."
  echo ""
  docker exec perfect-catch-db psql -U postgres -d pricebook -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
  echo ""
fi

# Verify GHL data was migrated
echo ""
echo -e "${YELLOW}Verifying GHL data migration...${NC}"
AUTOMATION_CONTACTS=$(docker exec postgres psql -U postgres -d perfectcatch_automation -t -c "SELECT count(*) FROM ghl_contacts;" 2>/dev/null || echo "0")
AUTOMATION_OPPS=$(docker exec postgres psql -U postgres -d perfectcatch_automation -t -c "SELECT count(*) FROM ghl_opportunities;" 2>/dev/null || echo "0")

echo "  Automation DB ghl_contacts: $AUTOMATION_CONTACTS"
echo "  Automation DB ghl_opportunities: $AUTOMATION_OPPS"

if [ "$AUTOMATION_CONTACTS" -lt "1" ] && [ "$AUTOMATION_OPPS" -lt "1" ]; then
  echo ""
  echo -e "${RED}WARNING: GHL data may not have been migrated!${NC}"
  echo "Run migrate-ghl-data.sh first."
fi

echo ""
echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}DECOMMISSION OPTIONS${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""
echo "1. STOP container (recommended first step)"
echo "   docker stop perfect-catch-db"
echo ""
echo "2. REMOVE container (after 1 week verification)"
echo "   docker rm perfect-catch-db"
echo ""
echo "3. REMOVE volume (DANGEROUS - permanent data loss)"
echo "   docker volume rm <volume_name>"
echo ""

# Prompt for action
echo "What would you like to do?"
echo "  [S] Stop container only (safe)"
echo "  [R] Remove container (keeps volume)"
echo "  [N] Nothing (exit)"
echo ""
read -p "Enter choice [S/R/N]: " choice

case $choice in
  [Ss])
    echo ""
    echo -e "${YELLOW}Stopping container...${NC}"
    docker stop perfect-catch-db
    echo -e "${GREEN}✓ Container stopped${NC}"
    echo ""
    echo "Container can be restarted with: docker start perfect-catch-db"
    echo "After 1 week verification, run this script again to remove."
    ;;
  [Rr])
    echo ""
    echo -e "${RED}WARNING: This will remove the container!${NC}"
    read -p "Type 'REMOVE' to confirm: " confirm
    if [ "$confirm" = "REMOVE" ]; then
      echo "Stopping container..."
      docker stop perfect-catch-db 2>/dev/null || true
      echo "Removing container..."
      docker rm perfect-catch-db
      echo -e "${GREEN}✓ Container removed${NC}"
      echo ""
      echo "Volume still exists. To remove permanently:"
      echo "  docker volume ls | grep perfect"
      echo "  docker volume rm <volume_name>"
    else
      echo "Aborted"
    fi
    ;;
  *)
    echo "No action taken"
    ;;
esac

echo ""
echo -e "${GREEN}Done${NC}"
