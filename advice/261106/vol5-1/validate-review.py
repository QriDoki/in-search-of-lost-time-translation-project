"""在本 worktree 根目录运行，核对审校覆盖、精确重放与原文完整性。"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
base = Path(__file__).resolve().parent
manifest = json.loads((base / 'manifest.json').read_text())
paras = manifest['paragraphs']
assert len(paras) == 239
progress = json.loads((base / 'progress.json').read_text())
completed = set(progress['completed'])
assert len(completed) == len(progress['completed']) and completed <= set(range(1, 240))
if '--partial' not in sys.argv:
    assert sorted(completed) == list(range(1, 240)), '尚有未完成段落；阶段检查请显式使用 --partial'
assert len(set(progress['agents'][str(i)] for i in completed)) == len(completed), '每段须由不同 agent 审校'
reviewed_paras = [p for p in paras if p['id'] in completed]
for para in reviewed_paras:
    pid = para['id']
    report = base / f'paragraphs/p{pid:03}.md'
    assert report.exists() and len(report.read_text()) > 150, f'{pid} 缺少详细报告'
    data = json.loads((base / f'reports/p{pid:03}.json').read_text())
    assert data['id'] == pid
    spans = []
    for change in data['changes']:
        assert para['translation'].count(change['old']) == 1, (pid, '替换不唯一')
        start = para['translation'].index(change['old'])
        end = start + len(change['old'])
        assert all(end <= a or start >= b for a, b in spans), (pid, '建议重叠')
        spans.append((start, end))
source = root / manifest['source_path']
assert hashlib.sha256(source.read_bytes()).hexdigest() == manifest['source_sha256']
original_bytes = subprocess.check_output(['git', 'show', manifest['base'] + ':' + manifest['translation_path']], cwd=root)
assert hashlib.sha256(original_bytes).hexdigest() == manifest['translation_sha256']
current = (root / manifest['translation_path']).read_text()
applied_records = json.loads((base / 'applied.json').read_text())
rejection_file = base / 'review-rejections.json'
rejected_records = json.loads(rejection_file.read_text()) if rejection_file.exists() else []
applied_keys = {(c['id'], c['old']) for c in applied_records}
rejected_keys = {(c['id'], c['old']) for c in rejected_records}
assert not applied_keys & rejected_keys, '不采纳项不应作为实际修改应用'
assert all(c['id'] in completed for c in applied_records), '未审段不应应用修改'
for para in reviewed_paras:
    data = json.loads((base / f"reports/p{para['id']:03}.json").read_text())
    for change in data['changes']:
        key = (para['id'], change['old'])
        assert key in applied_keys or key in rejected_keys, (para['id'], '原始建议缺少明确处理决定')
assert all(c['old'] != c['new'] for c in applied_records), '不应将保留原译计作实际修改'
parts = re.split(r'(\n\s*\n)', original_bytes.decode())
body_indices = [i for i in range(0, len(parts), 2) if parts[i].strip()]
assert len(body_indices) == 239
for change in json.loads((base / 'applied.json').read_text()):
    index = body_indices[change['id'] - 1]
    assert parts[index].count(change['old']) == 1, (change['id'], '无法重放')
    parts[index] = parts[index].replace(change['old'], change['new'], 1)
assert ''.join(parts) == current, '实际dev稿与采纳修改不一致'
assert len(re.split(r'\n\s*\n', current.strip())) == 239
# 精确重放已证明注释增删均有应用记录；另检查剩余注释及锚点的结构。
annotation_text = re.sub(r"\\[⊂⊃≼≽]", "", current)
annotation_pattern = r"(?:⊂[^⊂⊃≼≽\n]+⊃)?≼[^⊂⊃≼≽\n]+≽"
without_annotations = re.sub(annotation_pattern, "", annotation_text)
assert not any(c in without_annotations for c in '≼≽⊂⊃'), '注释或锚点未闭合、嵌套或跨行'
recorded_delta = sum(c['new'].count('≼') - c['old'].count('≼') for c in json.loads((base / 'applied.json').read_text()))
assert current.count('≼') - original_bytes.decode().count('≼') == recorded_delta, '注释增删未被应用记录解释'
subprocess.run(['git', 'diff', '--check'], cwd=root, check=True)
print(f'PASS: {len(completed)}/239份独立段落报告、建议唯一与不重叠、修改精确重放、原文哈希、底稿哈希、段数、注释标记及diff检查')
