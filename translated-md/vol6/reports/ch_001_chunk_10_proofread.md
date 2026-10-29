# Chunk 10 校对报告 (第 001 章)

## 术语审查
- 术语表内条目全部落实，无替换：`baignoire`→包厢、`loge`→楼座、`balcon`→楼厅（「平台式楼厅」）、`néréide`→涅瑞伊得斯、`résille`→发网、`alcyon`→翠鸟、`trois coups`→三下开场声、`Monseigneur`→直接称呼作「大人」、`Hébreux`→希伯来人、`Parme`→帕尔马亲王妃、`Guermantes`→盖尔芒特亲王妃、`Aumale`→奥马勒公爵、`Ambresac`→昂布勒萨克夫人、`Phèdre`→*《费德尔》*。
- 表外专名处理（L2 报告已列，校对确认可保留，建议上游决定是否补入 glossary.json）：
  - `triton` → 特里同（与涅瑞伊得斯成对，希腊神话男性海神；不作「海王」）。
  - `bavaroise` → 巴伐利亚奶饮（保留 L2 译法，是当时咖啡馆供应的热奶饮；若术语表另有定译请统一，本 chunk 维持此译）。
  - `Henri IV` → 亨利四世像章；`médaillon` 作「像章」，与「从黑底上凸现出来」配合，不译「圆形浮雕」。
- 一处非术语的判断：`spectre d'une figure idéale` 保留「幽灵／幻影」义（L2 已作「幽灵」），未误作「光谱」。

## 初译稿典型错误
- 斜体标记遗漏：第 1 段原文 `*Phèdre*` 为斜体作品名，初译只作《费德尔》未保留 Markdown 斜体，已改为 *《费德尔》*（对应 brief 格式硬约束第 5 条）。
- 虚词冗余：第 5 段「从她们所张挂的夜色深处」——`qu'elles tapissaient` 的 `tapisser` 在此是「衬在身后／铺满背景」而非「张挂」，且「她们所……的」多一层「的」字结构；改为「从她们身后的夜色深处」。
- 代词重复：同句「从她们身后的夜色深处」与主语「她们」连用稍赘，定稿作「从身后的夜色深处」。
- 用词精确化：第 1 段 `n'avait pas le nombre de pieds voulus` 初译「音步并不合数」略含糊，改「音步数目并不对」。
- 第 3 段 `des gens qu'ils n'auraient pas d'autre occasion de voir de près` 初译「平日无缘见到的名人」——原文只说「无缘就近见到的人」，未断言其为「名人」；删去「名人」以免添加原文没有的判断。
- 第 6 段 `descendait du front de la princesse le long d'une de ses joues dont elle suivait l'inflexion` 初译语序为「贴着她的一侧脸颊滑落，随着那脸颊的弧度」，两个「的」且动作方向含混；改为「顺着她一侧脸颊的弧度滑落」，把 `suivre l'inflexion` 与 `le long de` 合并为一个动作。
- 第 6 段 `l'œil ne pouvait s'empêcher de les prolonger` 初译「眼睛忍不住要把她延续进这些线条里去」——`prolonger les lignes` 是「把线条延展下去」，宾语是线条而非人；改为「眼睛忍不住要顺着这些线条延展下去」。

## 逐条核对格式硬约束
1. 段落一一对应：源文 7 段（含第 4 段两组引语连排、第 7 段「——」起首对话），译文 7 段，一致。
2. 第 7 段以「——」起首，未加引号；段内引语用中文双引号“”，无内层引语。第 4 段两组引语同段连排，未另起段。
3. 全文零反引号：已核，无。
4. 引号成对；无半角引号、无 ASCII 双连字符、无 ASCII 三点；破折号均作「——」（第 3、5、7 段及第 4 段插入语）。
5. 斜体：*《费德尔》*（作品名加书名号）、*p*（外来单字，不加书名号），均保留。
6. 无上标符号残留；`Monseigneur` 作「大人」，`Madame d'Ambresac` 作「昂布勒萨克夫人」。
7. 无脚注、译注、夹注；无图片。
8. 本 chunk 无分节符。
9. 无任何出版机构信息。
10. 禁用译名核对：未出现「亲王夫人」（用「亲王妃」）、「外婆」「货栈」「海王星／尼普顿」等；`triton` 作「特里同」而非「尼普顿」。
11. 表外专名：`triton`、`bavaroise` 已在 L2 报告与本报告记录。
12. 正文无说明性文字、无标题。

## 对后续章节的建议
- 「包厢」一名在本章 19 处均指 `baignoire`，与 `loge`（楼座）、`balcon`（楼厅）严格区分；建议后续 chunk 保持「正厅前座」译 `fauteuils d'orchestre`、`orchestre` 单独出现时按语境作「正厅前座／池座」（本 chunk 第 5 段 `les formes des monstres de l'orchestre` 作「正厅前座那些怪物的身形」）。
- 海仙女长喻（第 5、6 段）的层次词建议全书统一：`royaume`→王国、`limite`→界线、`surface`→表面、`séjour des mortels`→凡人的居所。本章后文若再现同一比喻，可直接沿用。
- `Monseigneur` 直接称呼作「大人」的处理已按术语表 note 执行，建议 L1 在术语表 note 中补一句「叙事者转述时亦作『大人』」，以免后续 chunk 出现「殿下」混用。
