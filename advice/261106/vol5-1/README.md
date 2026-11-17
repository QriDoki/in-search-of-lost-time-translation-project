# vol5-1 逐段逐句审校

当前状态：**已暂停，200/239**。已审段均由独立子 agent 对照法语逐句审校，包括独立诗行、衔接短段及分隔符。采纳 668 项修改，涉及 179 段；21 个已审段保留现译，另有 39 段待审。

- 基线：origin/main，`ee8577781ef9cd1af33c910c4d8d2ee8f86dc382`。
- 分支：`codex/polish-vol5-1-20261106`；仅本地提交，不 push。
- 原文：`raw-md/vol5/chapters/001.md`（未修改）。
- 开发稿：`polish/dev/chapters/polished-vol5-1.md`。
- [全部段落索引](vol5-1.md)、[逐句审校要求](REVIEW-PROMPT.md)。
- [原文与原译底稿及哈希](manifest.json)、[进度与逐段 agent 对应](progress.json)。
- [主审决定](review-decisions.json)、[采纳修改与理由](applied.json)。
- [主审调整](review-adjustments.json)、[补充修订](supplemental-changes.json)；各段索引同时链接后续复核与勘误。
- [不采纳建议与理由](review-rejections.json)；不把保留原译计为实际修改。
- [保留疑点](unresolved.json)、[阶段验证记录](validation-checkpoints.json)。
- [验证记录](validation.json)；可在 worktree 根目录执行 `python3 advice/261106/vol5-1/validate-review.py --partial` 重现文本与覆盖检查。

保留原作修辞、人物口吻及可接受的多义；不以纯粹偏好强行缩短长句。底本疑点和未采纳建议保留在相应段落报告中，未据猜测改动法语原文。
