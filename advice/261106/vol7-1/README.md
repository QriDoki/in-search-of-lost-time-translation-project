# vol7-1 逐段逐句审校（2026-11-06 批次，2026-11-18 执行）

依据 `docs/chapter-map.md`，本次只审校《盖尔芒特家那边》第二部：

- 原文：`raw-md/vol7/chapters/001.md`
- 译文：`polish/dev/chapters/polished-vol7-1.md`
- 正文 **480 段**，每段由一个独立子 agent 逐句对照法文审校；标题块（`## 第二部`）不计入段号。
- 关注错译（含漏译、增译、指代与逻辑关系偏差）、语句不通顺、不符合现代中文使用习惯及令中文读者迷惑之处；保留原作修辞、人物口吻、既有译注与分段。
- 工作分支：`codex/polish-vol7-1-20261106`（worktree `/home/qri/lost-time-worktrees/polish-vol7-1`，基线 `origin/main`）。

## 文件

- `paragraph-index.json`：法文与译文逐段对齐（段号、行号、全文），含两文件 SHA-256。
- `build_index.py`：重建段落索引与逐段输入（快照变化时重跑）。
- `inputs/pNNN.md`：每段子 agent 的输入（本段法文、现译、上一段译文上下文）。
- `REVIEW-PROMPT.md`：每段审校者遵循的统一要求与报告模板。
- `paragraphs/pNNN.md`：逐段报告（含无修改的段落）。
- `paragraphs/pNNN.json`：该段可机械应用的替换片段（`edits` 确定项、`optional` 可选润色）。
- `apply_edits.py`：按段应用 JSON 到开发稿的脚本（`old` 必须在本段唯一）。
- `status.py`：逐段完成度统计（`{已完成}/{总数}`）。
- `build_summary.py`：生成汇总报告 `vol7-1.md` 与 `applied.json`。
- `validate.py`：结构一致性校验（段数、注释数、基线重放与开发稿一致）。
- `vol7-1.md`：汇总报告与逐段索引。
- `applied.json`：实际应用结果统计。
- `validation.json`：结构一致性与构建验证记录。

段号以本次快照为准；详细验证记录见汇总报告。