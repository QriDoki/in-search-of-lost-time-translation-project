# vol1-2 逐段翻译审校（2026-11-07—2026-11-08）

本轮按 `docs/chapter-map.md`，对 Combray — II 的321个正文段落各启动一个独立子 agent，核对错译、语句不顺与现代中文习惯。主审复核后，382项建议已应用到 dev 稿，186段修改、135段保留。

- [汇总报告与321段索引](vol1-2.md)
- [逐段审校提示词与逐句分析规范](REVIEW-PROMPT.md)
- `paragraphs/p001.md` 至 `p321.md`：逐段报告（含保留段）。
- `paragraphs/p001.json` 至 `p321.json`：独立子 agent 的原始建议。
- [审校前底稿及原文快照](manifest.json)
- [主审复核决定](review-decisions.json)
- [主审补充的注释同步修正](reviewer-supplements.json)
- [全章称谓统一记录](terminology-normalization.json)
- [最终应用结果与哈希](applied.json)

基于 main 的本地分支 `codex/polish-vol1-2-20261107`，不 push。

## 验证

- 321份独立子 agent 原始报告与321份 Markdown 报告齐备；第192—321段含1206项逐句／意群详细核对。前191段保留段级结论和逐项修改依据。
- 逐项重放全部采纳修改，与 dev 稿逐字一致；法语原文未改，main 底稿哈希吻合。
- 正文段数、标题、两处分隔及全部注释标记保持完整；139条注释仅含明确留档的同步修正。
- `git diff --check` 通过。
- `POLISH_VERSION=dev npm run build` 通过；构建输出保留仓库已有的其他章节／出版信息提示、分块体积提示及本地 npm 配置提示，本轮未扩展处理这些内容。
- [验证结果与开发稿哈希](validation.json)
