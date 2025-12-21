#!/bin/bash
# ============================================
# Perfect Catch ST Automation - Local Setup
# ============================================
# This script sets up everything for local development
# Usage: ./scripts/local-setup.sh

set -e

echo "============================================"
echo "Perfect Catch ST Automation - Local Setup"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required tools
check_requirements() {
    echo "Checking requirements..."

    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        echo "Install Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi

    if ! command -v docker compose &> /dev/null; then
        echo -e "${RED}Error: Docker Compose is not installed${NC}"
        exit 1
    fi

    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed${NC}"
        echo "Install Node.js 18+: https://nodejs.org/"
        exit 1
    fi

    echo -e "${GREEN}All requirements met!${NC}"
}

# Create .env.local if it doesn't exist
create_env_local() {
    if [ ! -f .env.local ]; then
        echo "Creating .env.local from .env.example..."
        cp .env.example .env.local

        # Update database URLs for local Docker
        sed -i.bak 's|DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:localdev123@localhost:5432/perfectcatch_automation|g' .env.local
        sed -i.bak 's|SERVICETITAN_DATABASE_URL=.*|SERVICETITAN_DATABASE_URL=postgresql://postgres:localdev123@localhost:5432/perfectcatch_automation|g' .env.local
        sed -i.bak 's|REDIS_URL=.*|REDIS_URL=redis://localhost:6379|g' .env.local
        rm -f .env.local.bak

        echo -e "${YELLOW}Created .env.local - Please update with your API keys:${NC}"
        echo "  - SERVICE_TITAN_CLIENT_ID"
        echo "  - SERVICE_TITAN_CLIENT_SECRET"
        echo "  - SERVICE_TITAN_TENANT_ID"
        echo "  - SERVICE_TITAN_APP_KEY"
        echo ""
    else
        echo -e "${GREEN}.env.local already exists${NC}"
    fi
}

# Install npm dependencies
install_deps() {
    echo "Installing npm dependencies..."
    npm install
    echo -e "${GREEN}Dependencies installed!${NC}"
}

# Start Docker services
start_docker() {
    echo "Starting Docker services (PostgreSQL, Redis)..."
    docker compose -f docker-compose.local.yml up -d postgres redis

    echo "Waiting for PostgreSQL to be ready..."
    sleep 5

    # Wait for postgres to be healthy
    until docker compose -f docker-compose.local.yml exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
        echo "Waiting for PostgreSQL..."
        sleep 2
    done

    echo -e "${GREEN}Database services are ready!${NC}"
}

# Run database migrations
run_migrations() {
    echo "Running database migrations..."

    # Check if migrations have been run
    TABLES=$(docker compose -f docker-compose.local.yml exec -T postgres psql -U postgres -d perfectcatch_automation -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo "0")

    if [ "$TABLES" -lt 10 ]; then
        echo "Running SQL migrations..."
        for f in src/db/migrations/*.sql; do
            echo "  Running: $f"
            docker compose -f docker-compose.local.yml exec -T postgres psql -U postgres -d perfectcatch_automation -f "/docker-entrypoint-initdb.d/$(basename $f)" 2>/dev/null || true
        done
    else
        echo "Migrations appear to have already been run (found $TABLES tables)"
    fi

    # Generate Prisma client
    echo "Generating Prisma client..."
    npx prisma generate

    echo -e "${GREEN}Database setup complete!${NC}"
}

# Display status and next steps
show_status() {
    echo ""
    echo "============================================"
    echo -e "${GREEN}Setup Complete!${NC}"
    echo "============================================"
    echo ""
    echo "Services running:"
    echo "  - PostgreSQL: localhost:5432"
    echo "  - Redis:      localhost:6379"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Update .env.local with your ServiceTitan credentials"
    echo ""
    echo "2. Start the API server (choose one):"
    echo "   ${YELLOW}npm run dev${NC}                    # Local Node.js (hot reload)"
    echo "   ${YELLOW}docker compose -f docker-compose.local.yml up${NC}  # Full Docker stack"
    echo ""
    echo "3. Access the API:"
    echo "   http://localhost:3001/health"
    echo "   http://localhost:3001/api/sync/status"
    echo ""
    echo "4. View database:"
    echo "   ${YELLOW}npx prisma studio${NC}              # Web UI at localhost:5555"
    echo "   ${YELLOW}docker compose -f docker-compose.local.yml exec postgres psql -U postgres -d perfectcatch_automation${NC}"
    echo ""
    echo "5. Run a sync:"
    echo "   ${YELLOW}npm run sync:full${NC}              # Full sync from ServiceTitan"
    echo ""
}

# Main execution
main() {
    cd "$(dirname "$0")/.."

    check_requirements
    create_env_local
    install_deps
    start_docker
    run_migrations
    show_status
}

main "$@"
