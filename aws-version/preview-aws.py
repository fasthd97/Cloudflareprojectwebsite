#!/usr/bin/env python3
"""
Preview server for AWS version of resume website
"""
import http.server
import socketserver
import os
import webbrowser

PORT = 8081
DIRECTORY = "frontend"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def main():
    if not os.path.exists(DIRECTORY):
        print(f"❌ Directory '{DIRECTORY}' not found!")
        return
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"🚀 AWS Resume website preview server starting...")
        print(f"📱 Local URL: {url}")
        print(f"🛑 Press Ctrl+C to stop")
        
        try:
            webbrowser.open(url)
            print(f"🌐 Opening {url} in your browser...")
        except:
            print(f"💡 Manually open {url} in your browser")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print(f"\n👋 Server stopped!")

if __name__ == "__main__":
    main()