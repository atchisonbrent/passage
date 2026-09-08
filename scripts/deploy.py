"""Existing Passage Pages upload protocol; bounded to static assets, no DNS changes.
Usage: python3 scripts/deploy.py upload|status --receipts /absolute/artifact/verification
Credentials are read by the process from the environment variables, never printed.
"""
import argparse
import os
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'passage-imf'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def assets():
    public = ROOT / 'public'
    manifest = json.loads((public / 'data/manifest.json').read_text())
    names = {'index.html', 'stories/index.html', '404.html', 'robots.txt', '_headers', 'data/manifest.json', 'data/places.json', 'data/land.json', 'data/network.json', 'data/LICENSE.txt'}
    historical = json.loads((public/'data/history-manifest.json').read_text())
    names.add('data/history-manifest.json')
    for ident, row in historical['files'].items():
        assert re.fullmatch(r'(port|chokepoint|fso)\d+', ident)
        assert row['file'] == 'history-'+ident+'.json'
        names.add('data/'+row['file'])
    for row in manifest['activity']:
        assert re.fullmatch(r'activity-\d{4}-\d{2}\.json', row['file'])
        names.add('data/' + row['file'])
    for row in manifest['exposure']:
        assert re.fullmatch(r'exposure-port\d+\.json', row['file'])
        names.add('data/' + row['file'])
    assert not any(p.is_symlink() for p in public.rglob('*')), 'Symlink in public bundle'
    assert names == {p.relative_to(public).as_posix() for p in public.rglob('*') if p.is_file()}, 'Unexpected public file'
    for name in names:
        assert (public / name).stat().st_size < 25 * 1024 * 1024, name
    return names

def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['upload', 'status', 'check'])
    parser.add_argument('--receipts', type=Path)
    args = parser.parse_args()
    if args.mode == 'check':
        print('Allowlisted assets:', len(assets()))
        return
    assert args.receipts and args.receipts.is_absolute(), 'Explicit absolute receipt directory required'
    expected = set()
    if args.mode == 'upload':
        expected = assets()
        assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT).strip(), 'Deploy only a committed clean tree'
    auth = os.environ['CLOUDFLARE_API_TOKEN']
    account = os.environ['CLOUDFLARE_ACCOUNT_ID']
    prefix = f'/accounts/{account}/pages/projects/{PROJECT}'
    def api(path, method='GET', data=None, credential=None, content_type='application/json'):
        body = data if isinstance(data, bytes) else json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request('https://api.cloudflare.com/client/v4'+path, data=body, method=method, headers={'Authorization': 'Bearer '+(credential or auth), 'Content-Type': content_type})
        try:
            with urllib.request.build_opener(NoRedirect()).open(req, timeout=120) as response:
                result = json.load(response)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f'Cloudflare HTTP {exc.code}; response body withheld') from None
        if not result.get('success'):
            raise RuntimeError('Cloudflare reported failure; response withheld')
        return result.get('result')
    args.receipts.mkdir(parents=True, exist_ok=True)
    def save(name, data):
        (args.receipts/name).write_text(json.dumps(data, indent=2)+'\n')
        print(json.dumps(data))
    if args.mode == 'status':
        project = api(prefix)
        deployment = project.get('canonical_deployment') or {}
        domains = api(prefix+'/domains')
        save('status.json', {'project': PROJECT, 'deployment': {k: deployment.get(k) for k in ['id','latest_stage','uses_functions']}, 'domains': [{k:d.get(k) for k in ['name','status']} for d in domains]})
        return
    public = ROOT / 'public'
    revision = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    jwt = api(prefix+'/upload-token')['jwt']
    manifest, receipts, content = {}, {}, {}
    for name in sorted(expected-{'_headers'}):
        b = (public/name).read_bytes()
        key = hashlib.sha256(b+Path(name).suffix.encode()).hexdigest()[:32]
        manifest['/'+name] = key
        content[key] = (name,b)
        receipts[name] = hashlib.sha256(b).hexdigest()
    missing = api('/pages/assets/check-missing','POST',{'hashes':list(manifest.values())},jwt)
    assert isinstance(missing,list), 'Unexpected check-missing result'
    # Existing array upload protocol, bounded payloads for per-place histories.
    batches, batch, size = [], [], 0
    for key in dict.fromkeys(missing):
        name,b = content[key]
        if batch and (len(batch)>=10 or size+len(b)>3*1024*1024):
            batches.append(batch);batch=[];size=0
        mime = 'application/json' if name.endswith('.json') else 'text/html' if name.endswith('.html') else 'text/plain'
        batch.append({'key':key,'value':base64.b64encode(b).decode(),'metadata':{'contentType':mime+'; charset=utf-8'},'base64':True});size+=len(b)
    if batch:batches.append(batch)
    for i,batch in enumerate(batches):
        api('/pages/assets/upload','POST',batch,jwt)
        print('Uploaded batch',i+1,'/',len(batches),'assets',len(batch),flush=True)
    api('/pages/assets/upsert-hashes','POST',{'hashes':list(manifest.values())},jwt)
    assert api('/pages/assets/check-missing','POST',{'hashes':list(manifest.values())},jwt) == [], 'Assets were not confirmed present'
    boundary = 'passage-'+uuid.uuid4().hex
    parts=[]
    for name,value in {'manifest':json.dumps(manifest),'branch':'main','commit_hash':revision,'commit_dirty':'false','commit_message':'Publish reviewed maritime atlas'}.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="_headers"; filename="_headers"\r\nContent-Type: text/plain\r\n\r\n'.encode()+(public/'_headers').read_bytes()+b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    result=api(prefix+'/deployments','POST',b''.join(parts),content_type='multipart/form-data; boundary='+boundary)
    result=api(prefix+'/deployments/'+result['id'])
    save('deployment.json',{**{k:result.get(k) for k in ['id','url','environment','latest_stage','uses_functions']},'commit':revision,'sha256':receipts})

if __name__ == '__main__':
    run()
