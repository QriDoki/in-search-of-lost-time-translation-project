# Chunk 51 校对报告 (第 001 章)

## 术语审查
- 术语表所列 15 条全部核过，落笔无误：巴尔贝克、巴尔扎克、《人间喜剧》、《人类的圣经》、《罗恩格林》、夏吕斯先生、米什莱、莫雷尔（未作「莫雷耳」）、中殿、拉斐尔、齐格弗里德、《特里斯坦》（保持简称，未扩为全剧名）、凡德伊（未作「凡特伊／万特伊」）、瓦格纳、伊索尔德、隔墙。
- gigolo 取舍：确认 L2 处理正确。本处语境为「妓院里哪天会用得着他」，指被豢养的年轻男子，作「小白脸」；第 001 章前文 « les quatre gigolos » 的「花花公子」义不适用于此。两句分属不同语义，勿在术语表中强行统一为单条。
- L2 报告中列为「术语表未收」的专名，校对后维持：La Légende des siècles《历代传说》、Histoire de France《法国史》、Histoire de la Révolution《法国革命史》、L'Éducation sentimentale《情感教育》、Frédéric Moreau「弗雷德里克·莫罗」、tétralogie「四联剧」、habileté vulcanienne「伏尔甘式的技艺」、marque Mystère「‘神秘’牌」、cent vingt chevaux「一百二十马力」。建议上游把前三部史书／诗集名补入 glossary.json，避免后续卷次译名漂移。
- 弗雷德里克·莫罗与莫雷尔的两个译名保持分立，未因音近而合并——原文玩笑正建立在这点近似上。

## 初译稿典型错误
- 回指模糊（实质）：原文 « les plus grandes beautés de Michelet » 指米什莱其人的美，初译「米什莱最伟大的美」尚可，但同句「他作品中最伟大的美」易被读成「作品内部的美」，与下文「不如到作品之外去找」自相矛盾。已改回「米什莱最伟大的美」。
- 指代悬空（实质）：第 2 段 « l'attente d'un gigolo » 与前面的 « une coucherie »、« une expédition » 同属对「代数课」的并列猜测，主语是那门课所掩盖的事，不是莫雷尔本人。初译「莫雷尔在等一个小白脸」把猜测落实为莫雷尔的动作，破坏了自由间接引语的推测语气，已改为「是在等一个小白脸」。
- 逻辑连接漏译（实质）：« ne peut-on pas dire, pourtant, de ce dernier » 的 pourtant 是全文转折枢纽（前面刚说十九世纪作品不完整，此处反过来说米什莱的不完整恰是他的美），初译整句无转折词，已补「不过」。
- 比较级误作时空方位（实质）：« Avant le grand mouvement d'orchestre qui précède le retour d'Yseult » 是「伊索尔德归来前那场乐队乐段之前」，初译两个「之前」叠在一句里，读者会误以为时间点在同一处；已改为分句递进。
- 句法重组（非错误）：« autant la progression de l'orchestre à l'approche de la nef ... autant Wagner lui-même a eu de joie » 是 autant...autant 的相关比较，初译把前半放在插入语破折号之前、后半另起，比较的两端隔得太远。已改为「……层层推进有多强——……——瓦格纳……的喜悦，大概就有多大」，让「有多强／有多大」在中文里对上。nef 按术语表作「中殿」，未取「船」义。
- 代词歧义（实质）：« elle est consolée, surpassée — c'est-à-dire malheureusement vite détruite — par l'allégresse du fabricateur »，elle 指 « la tristesse du poète »，不是「欣悦」。初译「它很快就被摧毁」中的「它」可回指欣悦，已明确为「这种忧郁很快就被这份欣悦摧毁」。
- 术语微调（非错误）：« habileté » 在第 1 段出现两次（vulcanienne／technique de l'ouvrier），前处作「技艺」，后处作「技术」，以区分「伏尔甘式巧艺」的隐喻层与「工匠技术」的实指层。
- 用词层面：人物名 « noms de personnages » 原译「人物姓名／个体」，改「人物名字／个体」，贴近口语并避免「个人」的统计学色彩；« une de ces images où on ne pouvait rien débrouiller du tout » 是夏吕斯把莫雷尔的说法视为「一幅什么也理不清的图景」，此处的 image 与他惯用的 image／peinture 语汇同源，但中文若直落「图景」会与前文「呈现出的图景」重复，改「幌子」，语义（遮蔽真相的托词）与原文相符；« pages » 作「书页」而非「篇页」；« systématisations » 的比喻「化为齑粉」改为「化为尘土」，避免伪古典四字；« enthousiasme » 作「热忱」；« diversité » 作「多样性」；« dîners en ville » 原译「城里的晚宴」易生歧义（读者会以为在外省某城），改「外出赴宴」，这是普鲁斯特笔下巴黎社交的固定说法。
- 保留初译的两处判断：nef 按术语表作「中殿」，第 003 章的教堂义与此处一致；« un peu empêché de goûter le silence » 译「多少难以品味」，保留 un peu 的克制，未强化为「无法」。

## 格式核验
- 段落数：源文 2 段，终稿 2 段，无合并、无拆分。
- 零图片、零脚注、零出版机构信息；零反引号；零 ASCII 直引号；零 ASCII 双连字符；零 ASCII 三点；零「」『』。
- 中文引号逐段成对；段内引语用“”，引语内再引语用‘’。本 chunk 无「——」起首的对话段（莫雷尔与夏吕斯的对答均嵌在叙述句中，依原文不另起段、不加引号起首，保留原有的“……”包法，与本章体例一致）。
- 斜体作品名统一为 `*《……》*`；《罗恩格林》在句中作普通书名，未加斜体（该处原文亦无斜体）。

## 对后续章节的建议
- 第 1 段是本章音乐—建筑论的中点，瓦格纳「事后追加统一」与凡德伊奏鸣曲的「同一乐句」在此合流；后续 chunk 若再提「伏尔甘式」，请沿用「技艺」而非「巧艺／鬼斧神工」，以免把隐喻成语化。
- 《情感教育》引文「c'est une vieille peinture italienne」是莫雷尔的口头禅，后文若再现，请逐字复用「这是一幅古老的意大利画」，不要换译法——它是人物标志。
- 「代数课」作为夏吕斯猜疑的托词母题，后续若续写，建议保持「夜里开设」「无从规避」这两种带讽刺的形容，不改作中性的「晚间课程」。
