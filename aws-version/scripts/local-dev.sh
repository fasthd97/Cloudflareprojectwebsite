#!/bin/bash

# Local Development Setup Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛠️  Setting up local development environment${NC}"

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
        exit 1
    fi
}

# Setup local environment
setup_local_env() {
    echo -e "${YELLOW}📝 Creating local environment file...${NC}"
    
    cat > app/.env.local << EOF
NODE_ENV=development
PORT=3000
JWT_SECRET=local-development-secret-key-not-for-production
DATABASE_URL=postgresql://postgres:password@localhost:5432/resumedb
AWS_S3_BUCKET=local-dev-bucket
AWS_REGION=us-east-1
EOF

    echo -e "${GREEN}✅ Environment file created${NC}"
}

# Start local services with Docker Compose
start_services() {
    echo -e "${YELLOW}🐳 Starting local services...${NC}"
    
    # Create docker-compose.yml for local development
    cat > docker-compose.yml << EOF
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: resumedb
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  localstack:
    image: localstack/localstack:latest
    environment:
      SERVICES: s3
      DEBUG: 1
      DATA_DIR: /tmp/localstack/data
    ports:
      - "4566:4566"
    volumes:
      - localstack_data:/tmp/localstack
      - /var/run/docker.sock:/var/run/docker.sock

  app:
    build: ./app
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      PORT: 3000
      JWT_SECRET: local-development-secret-key-not-for-production
      DATABASE_URL: postgresql://postgres:password@postgres:5432/resumedb
      AWS_S3_BUCKET: local-dev-bucket
      AWS_REGION: us-east-1
      AWS_ENDPOINT_URL: http://localstack:4566
    depends_on:
      postgres:
        condition: service_healthy
      localstack:
        condition: service_started
    volumes:
      - ./app:/app
      - /app/node_modules
    command: npm run dev

volumes:
  postgres_data:
  localstack_data:
EOF

    # Start services
    docker-compose up -d postgres localstack
    
    # Wait for services to be ready
    echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
    sleep 10
    
    # Create S3 bucket in LocalStack
    aws --endpoint-url=http://localhost:4566 s3 mb s3://local-dev-bucket || true
    
    echo -e "${GREEN}✅ Local services started${NC}"
}

# Install dependencies and start app
start_app() {
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    
    cd app
    npm install
    
    echo -e "${YELLOW}🚀 Starting application...${NC}"
    npm run dev &
    
    cd ..
    
    echo -e "${GREEN}✅ Application started on http://localhost:3000${NC}"
}

# Setup frontend development server
setup_frontend() {
    echo -e "${YELLOW}🌐 Setting up frontend development...${NC}"
    
    cd frontend
    
    # Create a simple HTTP server for frontend
    cat > serve.js << EOF
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, 'index.html');
    }
    
    const ext = path.extname(filePath);
    const contentType = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json'
    }[ext] || 'text/plain';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(500);
            res.end('Server Error');
            return;
        }
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
});

server.listen(8080, () => {
    console.log('Frontend server running on http://localhost:8080');
});
EOF

    # Update script.js to use local API
    sed -i.bak 's/https:\/\/api\.\${window\.location\.hostname}/http:\/\/localhost:3000/g' script.js
    
    node serve.js &
    
    cd ..
    
    echo -e "${GREEN}✅ Frontend server started on http://localhost:8080${NC}"
}

# Show development info
show_dev_info() {
    echo -e "${BLUE}🎉 Local Development Environment Ready!${NC}"
    echo -e "${GREEN}Frontend: http://localhost:8080${NC}"
    echo -e "${GREEN}API: http://localhost:3000${NC}"
    echo -e "${GREEN}Database: postgresql://postgres:password@localhost:5432/resumedb${NC}"
    echo -e "${GREEN}S3 (LocalStack): http://localhost:4566${NC}"
    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo -e "  docker-compose logs app     # View app logs"
    echo -e "  docker-compose logs postgres # View database logs"
    echo -e "  docker-compose down         # Stop all services"
    echo -e "  docker-compose up -d        # Start all services"
}

# Cleanup function
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up...${NC}"
    docker-compose down
    rm -f docker-compose.yml
    rm -f app/.env.local
    rm -f frontend/serve.js
    rm -f frontend/script.js.bak
}

# Main function
main() {
    case "${1:-start}" in
        start)
            check_docker
            setup_local_env
            start_services
            start_app
            setup_frontend
            show_dev_info
            ;;
        stop)
            cleanup
            echo -e "${GREEN}✅ Local development environment stopped${NC}"
            ;;
        *)
            echo "Usage: $0 {start|stop}"
            exit 1
            ;;
    esac
}

# Handle script interruption
trap cleanup EXIT

# Run main function
main "$@"