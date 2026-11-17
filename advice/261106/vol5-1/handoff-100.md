# 100段协调交接

工作区 `/Users/qri/Documents/projects/my/in-search-of-lost-time-translation-project/work/polish-vol5-1-20261106`，基线origin/main ee8577781ef9cd1af33c910c4d8d2ee8f86dc382，目标分支codex/polish-vol5-1-20261106。用户要求逐段各启独立agent、逐句详细审校，全239段，建议落advice/261106/vol5-1并应用dev，本地提交不push。root负责最终验证/索引/提交。

## 已完成与运行中

progress.json记录1–100全部主审，原始Markdown及JSON齐备；dev最近检查点已应用331项，100段。之后仅追加p099的独立复核理由，需下一次apply同步其applied.reason。

两个原段agent仍运行，勿重派：
- 第101段：`/root/orchestrator/p101`
- 第102段：`/root/orchestrator/p102`

可向canonical名发消息/等待终稿，完成后先读报告与JSON核对，再主审。若已结束则直接读取文件；若异常中断，followup原agent续审，不能重新派另一个agent覆盖同一段。下一新段是103。每个新段spawn全新独立agent，fork_turns=none，不指定模型/effort。总容量4（root+协调者+2段agent），滚动补位，每累计2段合格报告向root汇报总进度/239。

## 规范与工具

先读REVIEW-PROMPT.md，含全部细则、诗行p186–188中文跨行重排等提醒。manifest.json保存不可变底稿、239段号及哈希。每agent只写paragraphs/pNNN.md及reports/pNNN.json，不改dev/manifest、不提交。逐句必须完整覆盖，不仅列问题句；长句可按意群，保留文学风格，不为改而改；实质疑点查可靠来源，不能无限外查。

协调者复核报告、原文及changes后运行：
`python3 advice/261106/vol5-1/review-helper.py review 101 102`
它检查old唯一、不重叠，追加review-decisions.json及progress.json。注意helper自动记录的agent前缀固定`/root/orchestrator/pNNN`；新协调者下新agent canonical路径会不同，必须记录实际路径，避免验证agent身份不实。已完成1–100路径均真实。p001–p004为/root/pNNN。

每累计10段运行：
`python3 advice/261106/vol5-1/review-helper.py apply`
root已改为幂等从git基线+全部已审建议重建，先重放applied防止覆盖未知改动；支持不足239段检查点。不要直接replace dev。它应用原始reports、supplemental-changes.json及review-adjustments.json，更新applied.json。主审调整只追加adjustments，保留原始报告；review-decisions明确理由。supplemental目前含p008跨段主体澄清。

## 待最终复核

root拥有validate-review.py、finalize-review.py，负责全章最后验证与汇总，不要覆盖README。实际疑点写unresolved.json，不强求新增。现存p022 Athènes底本疑点、p052句法挂接、p053 casquette marine可接受多义、p065电梯竖直立柱具体工程所指、p087 toile décente可接受多义。

root已允许有充分理由删除误导的无锚点注，不为固定旧标记数量硬写显义重复注。p079、p087各删一条，记录在reports/decisions/applied；验证应依精确重放与剩余有效结构。只处理本轮明确问题，不扩大清理。改写注释按docs/标注.md同步类型；p049/p054/p076等已同步。此前p003已应用注释出处改写但旧🏛️📚前缀可能可收窄📚，p023等类型可在最终对本轮改写注释复核，不扩大到未改注释或其他章节。

root持续独立复核关键建议，消息要求均已持久记入adjustments/decisions，包括p097保留“面容如今已能自持”拟人、p099末项英译/语境佐证且保留句法多义。root最后一次确认p099来源https://www.fadedpage.com/books/20230559/html.php，对应页173–174；已追加理由，原文未改。
