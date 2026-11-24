"""完成全部审校后生成可追溯总索引及统计，不修改dev稿。"""
from pathlib import Path
import json, hashlib
import sys
base=Path(__file__).resolve().parent
manifest=json.loads((base/'manifest.json').read_text())
progress=json.loads((base/'progress.json').read_text())
completed=set(progress['completed'])
count=len(completed)
partial='--partial' in sys.argv
if not partial:
 assert sorted(completed)==list(range(1,240))
status='已暂停' if '--paused' in sys.argv else ('已完成' if count==239 else '进行中')
applied=json.loads((base/'applied.json').read_text())
changed={x['id'] for x in applied}
assert changed<=completed
lines=['# vol5-1 逐段审校索引','',f'{status}：{count}/239 段已由独立子 agent 审校；采纳 {len(applied)} 项修改，涉及 {len(changed)} 段，{count-len(changed)} 个已审段保留现译；{239-count} 段待审。','', '| 段号 | 法文段首 | 报告 | 采纳修改数 |','| --- | --- | --- | --- |']
for p in manifest['paragraphs']:
 if p['id'] not in completed:continue
 i=p['id'];start=p['source'][:65].replace('|','\\|').replace('\n',' ')
 links=f'[逐句分析](paragraphs/p{i:03d}.md) · [原始建议](reports/p{i:03d}.json)'
 extras=set((base/'paragraphs').glob(f'p{i:03d}-*.md')) | set(base.glob(f'p{i:03d}-*.md'))
 for number, extra in enumerate(sorted(extras),1):
  links+=f' · [补充{number}]({extra.relative_to(base).as_posix()})'
 lines.append(f'| {i:03d} | {start} | {links} | {sum(c["id"]==i for c in applied)} |')
(base/'vol5-1.md').write_text('\n'.join(lines)+'\n')
readme=f"""# vol5-1 逐段逐句审校

当前状态：**{status}，{count}/239**。已审段均由独立子 agent 对照法语逐句审校，包括独立诗行、衔接短段及分隔符。采纳 {len(applied)} 项修改，涉及 {len(changed)} 段；{count-len(changed)} 个已审段保留现译，另有 {239-count} 段待审。

- 基线：origin/main，`{manifest['base']}`。
- 分支：`codex/polish-vol5-1-20261106`；仅本地提交，不 push。
- 原文：`{manifest['source_path']}`（未修改）。
- 开发稿：`{manifest['translation_path']}`。
- [全部段落索引](vol5-1.md)、[逐句审校要求](REVIEW-PROMPT.md)。
- [原文与原译底稿及哈希](manifest.json)、[进度与逐段 agent 对应](progress.json)。
- [主审决定](review-decisions.json)、[采纳修改与理由](applied.json)。
- [主审调整](review-adjustments.json)、[补充修订](supplemental-changes.json)；各段索引同时链接后续复核与勘误。
- [不采纳建议与理由](review-rejections.json)；不把保留原译计为实际修改。
- [保留疑点](unresolved.json)、[阶段验证记录](validation-checkpoints.json)。
- [验证记录](validation.json)；可在 worktree 根目录执行 `python3 advice/261106/vol5-1/validate-review.py` 重现文本与覆盖检查。

保留原作修辞、人物口吻及可接受的多义；不以纯粹偏好强行缩短长句。底本疑点和未采纳建议保留在相应段落报告中，未据猜测改动法语原文。
"""
if partial:readme=readme.replace('validate-review.py','validate-review.py --partial')
if (base/'final-review-notes.md').exists():readme+='\n[全章主审一致性复核](final-review-notes.md)。\n'
(base/'README.md').write_text(readme)
print('indexed',count,'changed paragraphs',len(changed),'applied changes',len(applied))
