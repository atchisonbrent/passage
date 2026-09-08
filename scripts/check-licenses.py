"""Keep code licensing separate from data redistribution terms."""
from pathlib import Path

def validate(root):
    required={
        'LICENSE':['MIT License','Copyright (c) 2026 Brent Atchison'],
        'LICENSES.md':['public/data/','tests/fixtures/','does **not** cover','src/events.js'],
        'public/data/LICENSE.txt':['NOT licensed','IMF PortWatch','https://www.imf.org/en/about/copyright-and-terms','Natural Earth','No endorsement'],
        'tests/fixtures/LICENSE.txt':['NOT licensed','IMF PortWatch'],
    }
    for name,markers in required.items():
        path=root/name
        if not path.is_file():raise ValueError('Missing license boundary: '+name)
        text=path.read_text()
        if any(marker.lower() not in text.lower() for marker in markers):
            raise ValueError('Incomplete license boundary: '+name)

if __name__=='__main__':
    validate(Path(__file__).resolve().parents[1])
    print('Code/data license boundaries verified')
