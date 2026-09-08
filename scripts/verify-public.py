"""Read back canonical public HTML, CSP and data hashes; no credentials."""
import argparse
import base64
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import urllib.request
from refresh import request_bytes

ROOT=Path(__file__).resolve().parents[1]
MAX_HTML_BYTES=24*1024*1024


def read_html_response(response):
    body=response.read(MAX_HTML_BYTES+1)
    if len(body)>MAX_HTML_BYTES:
        raise ValueError('Oversized public HTML response')
    length=response.headers.get('Content-Length')
    if length is not None and int(length)!=len(body):
        raise ValueError('Incomplete public HTML response')
    return body


class ScriptAttributes(HTMLParser):
    def handle_starttag(self,tag,attrs):
        if tag!='script' or hasattr(self,'attributes'):
            raise ValueError('Unexpected appendage tag')
        self.attributes=attrs


def verify_html(expected, actual, csp, expected_csp):
    """Only inert Cloudflare script appendages may differ from the source HTML."""
    if csp.strip()!=expected_csp.strip():
        raise ValueError('Public CSP differs from expected policy')
    if actual==expected:return
    prefix,marker,tail=expected.partition(b'</body>')
    suffix=marker+tail
    if not marker or not actual.startswith(prefix) or not actual.endswith(suffix):
        raise ValueError('Public HTML source bytes differ')
    addition=actual[len(prefix):-len(suffix)]
    pattern=re.compile(rb'<script\b([^>]*)>(.*?)</script>',re.S)
    scripts=pattern.findall(addition)
    if not scripts or pattern.sub(b'',addition).strip():
        raise ValueError('Unexpected public HTML appendage')
    parts=[part.strip().split() for part in csp.split(';') if part.strip()]
    directives={part[0]:part[1:] for part in parts}
    if len(directives)!=len(parts) or directives.get('script-src-attr',["'none'"])!=["'none'"]:
        raise ValueError('Ambiguous policy or allowed script attributes')
    allowed=directives.get('script-src',[])
    if not allowed or any(not item.startswith("'sha256-") for item in allowed) or 'script-src-elem' in directives:
        raise ValueError('Appendages require hash-only script policy')
    for attrs,body in scripts:
        parser=ScriptAttributes()
        parser.feed('<script'+attrs.decode()+'></script>')
        attributes=dict(parser.attributes)
        if len(attributes)!=len(parser.attributes) or not set(attributes)<= {'src','type','integrity','data-cf-beacon','crossorigin','async','defer'}:
            raise ValueError('Unexpected script attributes')
        digest="'sha256-"+base64.b64encode(hashlib.sha256(body).digest()).decode()+"'"
        if digest in allowed or any(item.strip("'") in (value or '') for item in allowed for value in attributes.values()):
            raise ValueError('Additional script would be authorized')
        source=attributes.get('src')
        if source:
            if not re.fullmatch(r'https://static\.cloudflareinsights\.com/beacon\.min\.js(?:/v[0-9a-f]+)?',source) or attributes.get('type') not in (None,'module'):
                raise ValueError('Unexpected external appendage')
        elif attrs.strip() or b'/cdn-cgi/challenge-platform/' not in body:
            raise ValueError('Unexpected inline appendage')


def verify(base='https://passage.batchison.dev/'):
    manifest=json.loads((ROOT/'public/data/manifest.json').read_text())
    names=['index.html','stories/index.html','data/manifest.json']+[ 'data/'+p['file'] for p in manifest['activity'] ]
    # Static reference datasets are fully validated before deploy; sample their live delivery.
    history=json.loads((ROOT/'public/data/history-manifest.json').read_text())
    names += ['data/'+history['files']['chokepoint6']['file']]
    expected_csp=next(line.split(':',1)[1].strip() for line in (ROOT/'public/_headers').read_text().splitlines() if line.strip().startswith('Content-Security-Policy:'))
    csp=''
    for name in names:
        route='' if name=='index.html' else 'stories/' if name=='stories/index.html' else name
        expected=(ROOT/'public'/name).read_bytes()
        if name.endswith('.html'):
            req=urllib.request.Request(base+route,headers={'User-Agent':'Passage-Snapshot/1.0'})
            with urllib.request.urlopen(req,timeout=90) as response:
                body=read_html_response(response)
                csp=response.headers.get('Content-Security-Policy','')
            verify_html(expected,body,csp,expected_csp)
        elif hashlib.sha256(request_bytes(base+route)).digest()!=hashlib.sha256(expected).digest():
            raise ValueError('Public bytes differ: '+name)
    for script in re.findall(r'<script>(.*?)</script>',(ROOT/'public/index.html').read_text(),re.S):
        digest=base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
        if "'sha256-"+digest+"'" not in csp:
            raise ValueError('Public CSP does not authorize expected script')
    if "connect-src 'self'" not in csp:
        raise ValueError('Unexpected public connection policy')
    return {'verified_files':len(names),'source_revision':manifest.get('source_revision')}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--base',default='https://passage.batchison.dev/',choices=['https://passage.batchison.dev/','http://127.0.0.1:8653/'])
    args=parser.parse_args()
    for attempt in range(5):
        try:
            print(json.dumps(verify(args.base)))
            return
        except Exception:
            if attempt==4:raise
            time.sleep(10)

if __name__=='__main__':main()
