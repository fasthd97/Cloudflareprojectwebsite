#!/usr/bin/env python3
"""
Simple HTTP server to preview the resume website locally
"""
import http.server
import socketserver
import os
import webbrowser
from pathlib import Path

# Configuration
PORT = 8080
DIRECTORY = "public"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Add CORS headers for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

def main():
    # Check if directory exists
    if not os.path.exists(DIRECTORY):
        print(f"❌ Directory '{DIRECTORY}' not found!")
        print("Make sure you're running this from the project root.")
        return
    
    # Start server
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"🚀 Resume website preview server starting...")
        print(f"📱 Local URL: {url}")
        print(f"📁 Serving: {os.path.abspath(DIRECTORY)}")
        print(f"🛑 Press Ctrl+C to stop")
        
        # Try to open browser
        try:
            webbrowser.open(url)
            print(f"🌐 Opening {url} in your default browser...")
        except:
            print(f"💡 Manually open {url} in your browser")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print(f"\n👋 Server stopped!")

if __name__ == "__main__":
    main()