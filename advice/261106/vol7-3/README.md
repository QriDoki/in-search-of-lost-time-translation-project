# vol7-3 逐段逐句审校（2026-11-06 批次，2026-11-24 执行）

依据 `docs/chapter-map.md`，本次只审校《盖尔芒特家那边》第二部·第二章（阿尔贝蒂娜的来访；维尔巴里西斯夫人家的小戏与公爵夫人的邀请；夏吕斯与布洛克事件）：

- 原文：`raw-md/vol7/chapters/003.md`
- 译文：`polish/dev/chapters/polished-vol7-3.md`
- 正文 **115 段**，每段由一个独立子 agent 逐句对照法文审校；法文两个标题块与译文合并的两行标题均不计入段号。
- 关注错译（含漏译、增译、指代与逻辑关系偏差）、语句不通顺、不符合现代中文使用习惯及令中文读者迷惑之处；保留原作修辞、人物口吻、既有译注与分段。
- 工作分支：`codex/polish-vol7-3-20261106`（worktree `/home/qri/lost-time-worktrees/polish-vol7-3`，基线 `origin/main` fa8a899）。
- **进行中**：每批至多 10 个子 agent 并发；主审复核后应用修订至开发稿。

## 文件

- `paragraph-index.json`：法文与译文逐段对齐（段号、行号、全文），含两文件 SHA-256。
- `build_index.py`：重建段落索引与逐段输入（快照变化时重跑）。
- `inputs/pNNN.md`：每段子 agent 的输入（本段法文、现译、上一段译文上下文）。
- `REVIEW-PROMPT.md`：每段审校者遵循的统一要求与报告模板。
- `paragraphs/pNNN.md`：逐段报告（含无修改的段落）。
- `paragraphs/pNNN.json`：该段可机械应用的替换片段（`edits` 确定项、`optional` 可选润色）。
- `apply_edits.py`：按段应用 JSON 到开发稿的脚本（`old` 必须在本段唯一）。
- `status.py`：逐段完成度统计（`{已完成}/{总数}`）。
- `build_summary.py`：生成汇总报告 `vol7-3.md` 与 `applied.json`。
- `validate.py`：结构一致性校验（段数、注释数、基线重放与开发稿一致）。
- `vol7-3.md`：汇总报告与逐段索引。
- `applied.json`：实际应用结果统计。
- `chief-notes.md`：主审跨段裁定笔记。
- `review-decisions.json`：主审裁定记录（采纳的可选润色与补充修改）。

段号以本次快照为准；详细验证记录见汇总报告。