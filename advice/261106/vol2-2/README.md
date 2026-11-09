# vol2-2 逐段逐句审校（2026-11-08—09）

依据 `docs/chapter-map.md`，对《地名：那个名字》的64个正文段落分别启动一个独立子 agent，完成427项逐句／长句意群核对，涵盖错译、漏增译、指代与逻辑、语句不通顺及现代中文习惯。主审采纳并调整后应用190项修订，修改47段，17段保留现译；1项原始建议不采纳。

- 法文：`raw-md/vol2/chapters/002.md`（未修改）。
- 开发稿：`polish/dev/chapters/polished-vol2-2.md`。
- 基于本地 `main`：`bdae506256944a0e76baa2a66d7d2e934fb1430e`，目标分支 `codex/polish-vol2-2-20261106`，不 push。
- [汇总与64段索引](vol2-2.md)：每段均有独立的 JSON 原始报告和 Markdown 逐句对照。
- [审校要求](REVIEW-PROMPT.md)、[原译底稿与段句映射](manifest.json)。
- [主审决定与补充修订](review-decisions.json)、[实际应用的190项修改及哈希](applied.json)。
- [一致性与构建验证](validation.json)。

主审保留原作长句、修辞、人物口吻及可接受的多义，不强行缩句。注释标记全部保留，150条注释中13条内容作有记录的同步修正，另有少量定位词整理。第24段底本 `lieux tout-puissants` 的疑点已核对其他文本并留档，不凭猜测校改法文。

## 过程恢复

原临时 worktree 在空间不足后的续作时已不存在。55份报告从本任务本地会话保存的实际工具调用恢复，逐项校验通过；第54、62段在原子 agent 中续审，其余未完成段落另按段启动独立 agent。恢复工作及原始调用来源见 [恢复记录](recovery.json)。最终成果位于持久 worktree；未将未完成草稿计作完成报告。

## 验证

- 64份 JSON、64份 Markdown 报告齐备；427项原文单元全部有具体核对。
- 逐项重放所有采纳修改，与 dev 稿逐字一致；底稿哈希与 main 一致，法语原文未改。
- 64段正文、标题及全部注释分隔标记保持完整；注释内容改动均可追溯到主审记录。
- `git diff --check` 与 `POLISH_VERSION=dev npm run build` 均通过；保留的既有提示见验证文件。
