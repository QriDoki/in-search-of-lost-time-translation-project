# vol2-2 独立逐段、逐句审校要求

每个正文段落单独启动一个新的 collaboration 子 agent。每位 agent 只负责指定的一段，不再委派。工作目录 `/Users/qri/Documents/projects/my/in-search-of-lost-time-translation-project/work/polish-vol2-2-20261106`，基于本地 main 的 bdae506。原译对应按 `docs/chapter-map.md` 并以正文首尾、上下文核实：原文 `raw-md/vol2/chapters/002.md`，译文 `polish/dev/chapters/polished-vol2-2.md`。空行分段、排除标题，共64段。

读取本目录 manifest.json 指定 id 的段落和必要邻段。使用 Python 仅提取所需段落，不输出全份 manifest。逐句比较错译（含漏增译、指代、否定、因果与比较关系）、语句不通顺、不符合现代中文习惯的问题。source_units 按句末分段，过长句也按分号拆意群；须覆盖每个单元，若长句内有多层语义须在该项详细分述。不能仅给段落结论。保留原文修辞、人物口吻和可接受的多义，不强行缩短长句，不为改而改。

只写 `advice/261106/vol2-2/paragraphs/pNNN.json`（三位段号），不改 dev 或其他文件，不提交。JSON格式：

```json
{"id":1,"assessment":"中文总体结论（具体）","sentence_checks":[{"unit":1,"source_anchor":"对应法文定位片段","translation_anchor":"对应中文片段","finding":"具体分析本句词义、信息、语法、逻辑和中文表达；说明保留或修订理由。"}],"changes":[{"type":"错译/语句不通顺/不符合现代中文习惯","before":"本段译文唯一且逐字存在的片段","after":"完整替换片段","source":"支持判断的法文片段","reason":"具体中文解释"}],"annotation_notes":[],"agent":{"kind":"collaboration-subagent","task":"pNNN"}}
```

sentence_checks 的 unit 必须恰好覆盖全部 source_units 编号，一个单元一项。每项解释实际相关的句法、语义；不以空泛的“准确自然”代替核对。问题也必须进入 changes，允许无修改。before 在本段须唯一，各替换不得相互重叠或依赖。不要改动注释标记及其内容；若注释与正文修订矛盾，在 annotation_notes 具体指出供主审同步处理。不要新增注释，不变更段数或标题。文化事实如仅凭本段不能核实，标待核，不据此武断改译。

完成后验证 JSON 和 before 的精确匹配，并简短回报段号、单元数、修改数。
