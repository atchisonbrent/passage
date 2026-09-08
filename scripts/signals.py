"""Build-time screening of bundled calls; no network or scheduled job.
One strongest absolute 7-day vs preceding-28-day shift per place.
Equal absolute changes select the earliest qualifying window.
"""
import collections
import datetime as dt
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def strongest(rows, ending_since=None):
    for row in rows:
        if len(row) != 2 or not isinstance(row[0], str) or dt.date.fromisoformat(row[0]).isoformat() != row[0]:
            raise ValueError('Signal dates must be canonical YYYY-MM-DD strings')
    rows = sorted(rows, key=lambda r: r[0])
    if len({r[0] for r in rows}) != len(rows):
        raise ValueError('Duplicate dates in signal input')
    best = None
    for i in range(34, len(rows)):
        if ending_since and rows[i][0] < ending_since:
            continue
        window = rows[i-34:i+1]
        values = [r[1] for r in window]
        if any(not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) or v < 0 for v in values):
            continue
        if (dt.date.fromisoformat(window[-1][0]) - dt.date.fromisoformat(window[0][0])).days != 34:
            continue
        reference = sum(values[:28]) / 28
        if reference < 20:
            continue
        mean = sum(values[28:]) / 7
        difference = mean-reference
        percent = difference/reference*100
        if abs(percent) < 50 or not (all(v < reference for v in values[28:]) or all(v > reference for v in values[28:])):
            continue
        candidate = dict(start=window[28][0], end=window[-1][0], referenceStart=window[0][0], referenceEnd=window[27][0], mean=mean, reference=reference, percent=percent, difference=difference)
        if best is None or abs(difference) > abs(best['difference']):
            best = candidate
    return best

def recent(rows, cutoff, days=30):
    since=(dt.date.fromisoformat(cutoff)-dt.timedelta(days=days-1)).isoformat()
    return strongest([r for r in rows if r[0]<=cutoff], ending_since=since)


def discover(rows,catalog,contexts,archive,cutoff):
    """Keep identities, not stale metrics. Sources are joined only by exact window."""
    keys=dict(archive)
    recent_ids=set()
    for ident, observations in rows.items():
        for hit,is_recent in [(strongest(observations),False),(recent(observations,cutoff),True)]:
            if hit:
                key=ident+':'+hit['start']
                keys[key]={'place':ident,'start':hit['start'],'end':hit['end']}
                if is_recent: recent_ids.add(key)
    output=[]
    for key,saved in sorted(keys.items()):
        ident,start,end=saved['place'],saved['start'],saved['end']
        if ident not in catalog or key!=ident+':'+start or (dt.date.fromisoformat(end)-dt.date.fromisoformat(start)).days!=6:
            raise ValueError('Invalid archived discovery identity')
        rs=(dt.date.fromisoformat(start)-dt.timedelta(days=28)).isoformat()
        observed=sorted(r for r in rows[ident] if rs<=r[0]<=end)
        hit=strongest(observed)
        valid=len(observed)==35 and all(isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) and v>=0 for _,v in observed) and len({d for d,v in observed})==35
        reference=sum(v for d,v in observed[:28])/28 if valid else None
        mean=sum(v for d,v in observed[28:])/7 if valid else None
        difference=mean-reference if valid else None
        context=next((c for c in contexts if c['place']==ident and c['start']==start and c['end']==end),None)
        output.append(dict(id=key,place=ident,name=catalog[ident]['name'],start=start,end=end,referenceStart=rs,referenceEnd=(dt.date.fromisoformat(start)-dt.timedelta(days=1)).isoformat(),mean=mean,reference=reference,difference=difference,percent=difference/reference*100 if reference else None,context=context,qualifies=hit is not None,recent=key in recent_ids))
    output.sort(key=lambda h:(not h['recent'],-abs(h['difference'] or 0),h['id']))
    return output,keys


def discovery():
    data=ROOT/'public/data'
    manifest=json.loads((data/'manifest.json').read_text())
    catalog={p['id']:p for p in json.loads((data/'places.json').read_text())}
    rows=collections.defaultdict(list)
    for part in manifest['activity']:
        source=json.loads((data/part['file']).read_text())
        if len(source)!=part['rows']: raise ValueError('Snapshot count mismatch')
        for row in source: rows[row[0]].append([row[1],row[2]])
    contexts=json.loads((ROOT/'src/signal-context.json').read_text())
    cutoff=min(manifest[s+'_latest'] for s in ['Daily_Ports_Data','Daily_Chokepoints_Data'])
    hits,keys=discover(rows,catalog,contexts,manifest.get('discovery_archive',{}),cutoff)
    manifest['discovery_archive']=keys
    (data/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
    return hits


def generate():
    data=ROOT/'public/data'
    manifest=json.loads((data/'manifest.json').read_text())
    catalog={p['id']:p for p in json.loads((data/'places.json').read_text())}
    rows=collections.defaultdict(list)
    for part in manifest['activity']:
        source=json.loads((data/part['file']).read_text())
        if len(source)!=part['rows']:
            raise ValueError('Snapshot count mismatch')
        for row in source:
            rows[row[0]].append([row[1],row[2]])
    contexts=json.loads((ROOT/'src/signal-context.json').read_text())
    output=[]
    for id, observations in rows.items():
        hit=strongest(observations)
        if hit:
            context=next((c for c in contexts if c['place']==id and c['start']==hit['start'] and c['end']==hit['end']),None)
            output.append(dict(id=id+':'+hit['start'],place=id,name=catalog[id]['name'],context=context,**hit))
    output.sort(key=lambda h:(-abs(h['difference']),h['id']))
    return output

if __name__=='__main__':
    print(json.dumps(generate(),indent=2))
