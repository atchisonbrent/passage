"""Render both static entrypoints with exact script-hash CSP. No dependencies."""
import base64
import hashlib
import json
import re
from signals import discovery as signal_candidates
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def build():
    source = ROOT / 'src'
    data = ROOT/'public/data'
    manifest = json.loads((data/'manifest.json').read_text())
    manifest['assets'] = []
    for name in ['places.json', 'land.json']:
        content = (data/name).read_bytes()
        manifest['assets'].append({'file': name, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
    (data/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
    html = (source / 'index.html').read_text()
    scripts = [(source / 'analysis.js').read_text(), (source / 'gestures.js').read_text(), (source / 'freshness.js').read_text()+'\n'+(source / 'workspace-math.js').read_text()+'\n'+(source / 'events.js').read_text()+'\nconst passageShifts='+json.dumps(signal_candidates(),separators=(',',':'))+';\n'+'\n'+(source / 'chart-input.js').read_text()+'\n'+(source / 'app.js').read_text()+'\n'+(source / 'depth.js').read_text()+'\n'+(source / 'chart-plot.js').read_text()+'\n'+(source / 'workspace.js').read_text()]
    assert all('</script' not in s.lower() for s in scripts)
    replacements = {'STYLE': (source/'style.css').read_text(), 'MATH': scripts[0], 'GESTURES': scripts[1], 'APP': scripts[2]}
    for key in replacements:
        assert html.count('/*'+key+'*/') == 1, 'Template marker must be unique'
    html = re.sub(r'/\*(STYLE|MATH|GESTURES|APP)\*/', lambda match: replacements[match.group(1)], html)
    for name in ['index.html', 'stories/index.html']:
        (ROOT / 'public' / name).write_text(html)
    hashes = ' '.join("'sha256-" + base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() + "'" for s in scripts)
    (ROOT / 'public/_headers').write_text("/*\n  Content-Security-Policy: default-src 'none'; script-src " + hashes + "; script-src-attr 'none'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n  Strict-Transport-Security: max-age=31536000\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Cache-Control: public, max-age=0, must-revalidate\n")
    print('Rendered two entrypoints; exact script hashes; same-origin static data only')

if __name__ == '__main__':
    build()
