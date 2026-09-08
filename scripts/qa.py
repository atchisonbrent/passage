"""Offline local build, tests and browser acceptance; no deployment or acquisition."""
import argparse
from pathlib import Path
import subprocess
import sys
import threading
from http.server import ThreadingHTTPServer
from preview import Handler

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    output=args.output.resolve()
    if output.is_relative_to(ROOT):parser.error('output must be outside the repository')
    def run(*cmd):subprocess.run(cmd,cwd=ROOT,check=True)
    run(sys.executable,'scripts/build.py')
    run(sys.executable,'-m','unittest','discover','-s','tests')
    for test in sorted((ROOT/'tests').glob('*.test.cjs')):run('node',str(test))
    run(sys.executable,'scripts/check-licenses.py')
    run(sys.executable,'scripts/deploy.py','check')
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:run('node','scripts/browser-smoke.cjs',f'http://127.0.0.1:{server.server_port}/',str(output))
    finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':main()
