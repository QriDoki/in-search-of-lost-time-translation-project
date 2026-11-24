#!/usr/bin/env python3
"""Apply per-chapter kinship FIX edits to polish/dev. old must be unique in the whole file."""
import json, glob, os, sys, hashlib
ADIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(ADIR, '../../..'))
dry = '--dry-run' in sys.argv
stats = {'files': 0, 'applied': 0, 'failed': 0, 'changed_files': 0}
fails = []
for jf in sorted(glob.glob(os.path.join(ADIR, 'files', '*.json'))):
    d = json.load(open(jf, encoding='utf-8'))
    edits = d.get('edits') or []
    if not edits:
        continue
    dev = os.path.join(ROOT, d['file'])
    text = open(dev, encoding='utf-8').read()
    orig = text
    stats['files'] += 1
    for e in edits:
        old, new = e['old'], e['new']
        c = text.count(old)
        if c != 1:
            fails.append((d['chapter'], e.get('occurrence'), f'old x{c}', old[:40]))
            stats['failed'] += 1
            continue
        text = text.replace(old, new, 1)
        stats['applied'] += 1
    if text != orig:
        stats['changed_files'] += 1
        if not dry:
            open(dev, 'w', encoding='utf-8').write(text)
print(json.dumps(stats, ensure_ascii=False))
for f in fails:
    print('FAIL', f, file=sys.stderr)
