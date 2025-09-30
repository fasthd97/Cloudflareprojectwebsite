#!/bin/bash

# Resume Website Preview Script
# Supports multiple preview methods

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Resume Website Preview${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to find available port
find_port() {
    local port=8080
    while lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; do
        port=$((port + 1))
    done
    echo $port
}

# Function to open browser
open_browser() {
    local url=$1
    echo -e "${GREEN}🌐 Opening $url in your browser...${NC}"
    
    if command_exists open; then
        # macOS
        open "$url"
    elif command_exists xdg-open; then
        # Linux
        xdg-open "$url"
    elif command_exists start; then
        # Windows
        start "$url"
    else
        echo -e "${YELLOW}💡 Manually open $url in your browser${NC}"
    fi
}

# Determine which version to preview
VERSION="cloudflare"
if [[ "$1" == "aws" ]]; then
    VERSION="aws"
    DIRECTORY="aws-version/frontend"
else
    DIRECTORY="public"
fi

echo -e "${BLUE}📁 Previewing: ${VERSION} version${NC}"
echo -e "${BLUE}📂 Directory: ${DIRECTORY}${NC}"
echo ""

# Check if directory exists
if [[ ! -d "$DIRECTORY" ]]; then
    echo -e "${RED}❌ Directory '$DIRECTORY' not found!${NC}"
    echo "Make sure you're running this from the project root."
    exit 1
fi

# Find available port
PORT=$(find_port)
URL="http://localhost:$PORT"

echo -e "${GREEN}🔍 Available preview methods:${NC}"
echo ""

# Method 1: Python HTTP Server
if command_exists python3; then
    echo -e "${GREEN}✅ Python 3 HTTP Server (Recommended)${NC}"
    echo -e "   Command: python3 -m http.server $PORT --directory $DIRECTORY"
    echo ""
    
    echo -e "${YELLOW}Starting Python HTTP server...${NC}"
    echo -e "${BLUE}📱 Local URL: $URL${NC}"
    echo -e "${BLUE}🛑 Press Ctrl+C to stop${NC}"
    echo ""
    
    # Open browser after a short delay
    (sleep 2 && open_browser "$URL") &
    
    # Start server
    cd "$DIRECTORY" && python3 -m http.server "$PORT"
    
elif command_exists python; then
    echo -e "${GREEN}✅ Python 2 HTTP Server${NC}"
    echo -e "   Command: python -m SimpleHTTPServer $PORT"
    echo ""
    
    echo -e "${YELLOW}Starting Python HTTP server...${NC}"
    echo -e "${BLUE}📱 Local URL: $URL${NC}"
    echo -e "${BLUE}🛑 Press Ctrl+C to stop${NC}"
    echo ""
    
    # Open browser after a short delay
    (sleep 2 && open_browser "$URL") &
    
    # Start server
    cd "$DIRECTORY" && python -m SimpleHTTPServer "$PORT"

# Method 2: Node.js HTTP Server
elif command_exists node; then
    echo -e "${GREEN}✅ Node.js HTTP Server${NC}"
    
    # Create a simple Node.js server
    cat > temp_server.js << EOF
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, '$DIRECTORY', req.url === '/' ? 'index.html' : req.url);
    
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, '$DIRECTORY', 'index.html');
    }
    
    const ext = path.extname(filePath);
    const contentType = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
    }[ext] || 'text/plain';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(500);
            res.end('Server Error');
            return;
        }
        
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        });
        res.end(content);
    });
});

server.listen($PORT, () => {
    console.log('Server running at $URL');
});
EOF
    
    echo -e "${YELLOW}Starting Node.js HTTP server...${NC}"
    echo -e "${BLUE}📱 Local URL: $URL${NC}"
    echo -e "${BLUE}🛑 Press Ctrl+C to stop${NC}"
    echo ""
    
    # Open browser after a short delay
    (sleep 2 && open_browser "$URL") &
    
    # Start server and cleanup
    node temp_server.js
    rm -f temp_server.js

# Method 3: PHP Built-in Server
elif command_exists php; then
    echo -e "${GREEN}✅ PHP Built-in Server${NC}"
    echo -e "   Command: php -S localhost:$PORT -t $DIRECTORY"
    echo ""
    
    echo -e "${YELLOW}Starting PHP HTTP server...${NC}"
    echo -e "${BLUE}📱 Local URL: $URL${NC}"
    echo -e "${BLUE}🛑 Press Ctrl+C to stop${NC}"
    echo ""
    
    # Open browser after a short delay
    (sleep 2 && open_browser "$URL") &
    
    # Start server
    php -S "localhost:$PORT" -t "$DIRECTORY"

else
    echo -e "${RED}❌ No suitable HTTP server found!${NC}"
    echo ""
    echo -e "${YELLOW}Please install one of the following:${NC}"
    echo "  • Python 3: brew install python3 (macOS) or apt install python3 (Linux)"
    echo "  • Node.js: https://nodejs.org/"
    echo "  • PHP: brew install php (macOS) or apt install php (Linux)"
    echo ""
    echo -e "${YELLOW}Or manually serve the files from the '$DIRECTORY' directory${NC}"
    exit 1
fi