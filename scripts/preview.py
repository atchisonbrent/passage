"""Loopback-only verification preview; production remains Cloudflare static assets."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT/'public'), **kwargs)
    def end_headers(self):
        for line in (ROOT/'public/_headers').read_text().splitlines()[1:]:
            if ':' not in line:
                continue
            name,value=line.strip().split(':',1)
            self.send_header(name,value.strip())
        super().end_headers()
    def list_directory(self,path):
        self.send_error(404)
        return None

if __name__=='__main__':
    server=ThreadingHTTPServer(('127.0.0.1',8653),Handler)
    print('Preview on http://127.0.0.1:8653',flush=True)
    server.serve_forever()
