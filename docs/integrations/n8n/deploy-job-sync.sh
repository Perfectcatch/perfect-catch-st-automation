#!/bin/bash

# ═══════════════════════════════════════════════════════════════
# Perfect Catch ST Automation - Job Sync Modernization Deployment
# ═══════════════════════════════════════════════════════════════

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="/opt/perfectcatch-st-automation"

echo "════════════════════════════════════════════════════════════"
echo "  Perfect Catch Job Sync Modernization - Deployment Script"
echo "════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════
# Step 1: Verify Prerequisites
# ═══════════════════════════════════════════════════════════════

echo "[1/8] Verifying prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

if ! command -v psql &> /dev/null; then
    echo "⚠️  psql not found. Will use Docker exec for database operations."
    USE_DOCKER_PSQL=true
else
    USE_DOCKER_PSQL=false
fi

echo "✅ Prerequisites verified"
echo ""

# ═══════════════════════════════════════════════════════════════
# Step 2: Check Database Connection
# ═══════════════════════════════════════════════════════════════

echo "[2/8] Checking database connection..."

if [ "$USE_DOCKER_PSQL" = true ]; then
    DB_CHECK=$(docker-compose exec -T postgres psql -U postgres -tc "SELECT 1" 2>/dev/null || echo "")
else
    DB_CHECK=$(psql -h localhost -U postgres -tc "SELECT 1" 2>/dev/null || echo "")
fi

if [ -z "$DB_CHECK" ]; then
    echo "❌ Cannot connect to PostgreSQL. Is it running?"
    echo "   Try: docker-compose up -d postgres"
    exit 1
fi

echo "✅ Database connection verified"
echo ""

# ═══════════════════════════════════════════════════════════════
# Step 3: Create Database (if not exists)
# ═══════════════════════════════════════════════════════════════

echo "[3/8] Creating database (if not exists)..."

if [ "$USE_DOCKER_PSQL" = true ]; then
    docker-compose exec -T postgres psql -U postgres <<EOF
SELECT 'CREATE DATABASE perfectcatch_automation'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'perfectcatch_automation')\gexec
EOF
else
    psql -h localhost -U postgres <<EOF
SELECT 'CREATE DATABASE perfectcatch_automation'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'perfectcatch_automation')\gexec
EOF
fi

echo "✅ Database ready"
echo ""

# ═══════════════════════════════════════════════════════════════
# Step 4: Run Schema Migration
# ═══════════════════════════════════════════════════════════════

echo "[4/8] Running schema migration..."

if [ ! -f "$SCRIPT_DIR/job-sync-schema.sql" ]; then
    echo "❌ Schema file not found: $SCRIPT_DIR/job-sync-schema.sql"
    exit 1
fi

if [ "$USE_DOCKER_PSQL" = true ]; then
    cat "$SCRIPT_DIR/job-sync-schema.sql" | docker-compose exec -T postgres psql -U postgres -d perfectcatch_automation
else
    psql -h localhost -U postgres -d perfectcatch_automation -f "$SCRIPT_DIR/job-sync-schema.sql"
fi

echo "✅ Schema migration complete"
echo ""

# ═══════════════════════════════════════════════════════════════
# Step 5: Verify Schema
# ═══════════════════════════════════════════════════════════════

echo "[5/8] Verifying schema..."

EXPECTED_TABLES=(
    "sync_state"
    "customers"
    "jobs"
    "sync_logs"
    "business_units"
)

if [ "$USE_DOCKER_PSQL" = true ]; then
    TABLE_COUNT=$(docker-compose exec -T postgres psql -U postgres -d perfectcatch_automation -tc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" | xargs)
else
    TABLE_COUNT=$(psql -h localhost -U postgres -d perfectcatch_automation -tc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" | xargs)
fi

if [ "$TABLE_COUNT" -lt 5 ]; then
    echo "❌ Expected at least 5 tables, found $TABLE_COUNT"
    exit 1
fi

echo "✅ Schema verified ($TABLE_COUNT tables created)"
echo ""

# ═══════════════════════════════════════════════════════════════
# Step 6: Install Dependencies
# ═══════════════════════════════════════════════════════════════

echo "[6/8] Installing Node.js dependencies..."

cd "$PROJECT_ROOT"

if [ ! -f "package.json" ]; then
    echo "❌ package.json not found in $PROJECT_ROOT"
    exit 1
fi

# Check if pg is already installed
if ! npm list pg &> /dev/null; then
    echo "Installing pg (PostgreSQL driver)..."
    npm install pg
    echo "✅ pg installed"
else
    echo "✅ pg already installed"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# Step 7: Deploy Code Files
# ═══════════════════════════════════════════════════════════════

echo "[7/8] Deploying code files..."

# Create directories if they don't exist
mkdir -p "$PROJECT_ROOT/src/services"
mkdir -p "$PROJECT_ROOT/src/routes"

# Copy database service
if [ -f "$SCRIPT_DIR/database.service.js" ]; then
    cp "$SCRIPT_DIR/database.service.js" "$PROJECT_ROOT/src/services/database.js"
    echo "✅ Deployed database.service.js → src/services/database.js"
else
    echo "⚠️  database.service.js not found, skipping"
fi

# Copy database routes
if [ -f "$SCRIPT_DIR/db-sync.routes.js" ]; then
    cp "$SCRIPT_DIR/db-sync.routes.js" "$PROJECT_ROOT/src/routes/db-sync.routes.js"
    echo "✅ Deployed db-sync.routes.js → src/routes/db-sync.routes.js"
else
    echo "⚠️  db-sync.routes.js not found, skipping"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# Step 8: Update Environment Variables
# ═══════════════════════════════════════════════════════════════

echo "[8/8] Checking environment variables..."

if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
fi

# Check if DATABASE_URL is set
if ! grep -q "DATABASE_URL" "$PROJECT_ROOT/.env"; then
    echo "Adding DATABASE_URL to .env..."
    echo "" >> "$PROJECT_ROOT/.env"
    echo "# Database Configuration (added by deployment script)" >> "$PROJECT_ROOT/.env"
    echo "DATABASE_URL=postgresql://postgres:password@postgres:5432/perfectcatch_automation" >> "$PROJECT_ROOT/.env"
    echo "DATABASE_MAX_CONNECTIONS=20" >> "$PROJECT_ROOT/.env"
    echo "⚠️  Please update DATABASE_URL in .env with your actual credentials!"
else
    echo "✅ DATABASE_URL already configured"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# Final Instructions
# ═══════════════════════════════════════════════════════════════

echo "════════════════════════════════════════════════════════════"
echo "  ✅ Deployment Complete!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "1. Update .env with your database credentials:"
echo "   vi $PROJECT_ROOT/.env"
echo ""
echo "2. Add database routes to your main router:"
echo "   Edit: src/routes/index.js"
echo "   Add:  import dbSyncRoutes from './db-sync.routes.js';"
echo "   Add:  router.use('/db', dbSyncRoutes);"
echo ""
echo "3. Restart the ServiceTitan API server:"
echo "   docker-compose restart servicetitan-api"
echo ""
echo "4. Test the database endpoints:"
echo "   curl http://localhost:3001/db/sync-state"
echo "   curl http://localhost:3001/db/business-units"
echo ""
echo "5. Import the new n8n workflow:"
echo "   File: $SCRIPT_DIR/get-jobs-modernized-v2.json"
echo ""
echo "6. Review the implementation guide:"
echo "   File: $SCRIPT_DIR/IMPLEMENTATION_GUIDE.md"
echo ""
echo "════════════════════════════════════════════════════════════"
