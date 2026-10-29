# Chunk 08 校对报告 (第 001 章)

## 术语审查
- `piqueur`：初译「骑马跟车的马夫」，与术语表一致，保留。
- `Monsieur le Duc` / `Monsieur`：第 2 段「公爵先生」与「先生」的对立保留正确；公爵正是为此发火，未合并为同一称呼。
- `valet de chambre`（贴身男仆）与 `valet de pied`（跟班）区分正确：第 5 段「跟班」、第 6 段「贴身女仆和贴身男仆」。
- `baignoire` / `loge`：末段「楼座包厢」与「底层包厢」区分正确，未混用。
- `croque-mort`「殡葬工」、`calorifère`「暖气设备」、`Champs-Élysées`「香榭丽舍」均按表。
- `Norpois`：正文误称处作「诺尔普瓦先生」（原文 "M. Norpois"，朱皮安叫错姓氏，正是笑点），正确；叙述部分「诺尔普瓦男爵夫妇」亦正确。建议 glossary 补收 `baron de Norpois` → 「诺尔普瓦男爵」（与大使 M. de Norpois 是两个人，为叔侄）。
- `Schola`：原文加引号，译文保留原文并加引号，与 L2 报告一致。建议上游在 glossary 中明确统一处理方式（保留原文或作「圣咏学院」），以免后续 chunk 分歧。
- `maîtresse`（第 1 段末）：原文确作「情妇」，叙述者此处是客观陈述公爵去香榭丽舍会情人，译文保留「情妇」无误；非含混。

## 初译稿典型错误
- **指代误置（实质错误）**：第 1 段末 "Jupien étant venu dire un mot dans la cour au mari qui était en train de saluer M. de Guermantes" 中 "au mari" 指诺尔普瓦男爵（丈夫），初译作「正在向盖尔芒特先生行礼的丈夫」，中文「丈夫」孤悬易被读成朱皮安自己的丈夫或泛指的某人。改为「男爵」。
- **比较对象缺失**：第 1 段 "en petits paletots clairs plus courts que son veston"，son veston 指前文的苏格兰呢上衣（veston écossais），初译「比上衣更短」中的「上衣」无着落。改为「比那件苏格兰呢上衣更短」。
- **漏译对比结构**：第 1 段 "À d'autres points de vue d'ailleurs que celui de la bienfaisance" 初译作「再说，不只是从行善的角度看」，把「从别的角度看」这一层削平了。改为「撇开行善不谈，从别的角度看」。
- **时态/语义滑移**：第 1 段 "le quartier ne paraissait au duc -- et cela jusqu'à de grandes distances -- qu'un prolongement" 初译把插入语挂在「街区」后，读成「街区延伸得很远」；原文是说公爵的这种看法一直适用到很远的地方。改为「在公爵眼里——哪怕一直延伸到很远的地方——这个街区也不过是……」，插入语修饰「公爵眼里」的视野范围。
- **数字直译**：末段 "tous les huit jours" 初译「每八天一次」，法语意为「每周一次」。改为「每周一次」。
- **词义**：第 3 段 "un renseignement qui se rattachait à la profession de mon père" 初译「一条……资料」，量词不当，改「一份」；"beaucoup de grâce" 初译「十分殷勤」偏「讨好」，此处是登门求助时的客气，改「十分客气」。
- **术语近似**：第 1 段 "vaines distinctions aristocratiques" 初译「无聊的贵族门第」，distinctions 指头衔、身份之别，非「门第」；改「无谓的贵族头衔」。
- **搭配重复**：末段括注「街上那些……的地方」与前「院子」并列时「地方」重复，改「所在」。
- **指代含糊**：第 5 段 "quelques-uns des salons où elle allait" 初译「她常去的几个沙龙」，上文最近的名词是「跟班」，易误读；补出「公爵夫人」。
- 首句 "à la porte de son vestibule" 初译「门厅的大门」，vestibule 是门厅，porte 是门口，改「门厅的门口」，避免「门厅的大门」这类叠床架屋。
- 第 1 段 "un ménage de cousins à lui" 初译「他的表亲夫妇」可，保留（原文性别/支系不明，不补足）。
- "avec une impudeur de courtisane" 初译「像妓女一样不知羞地」，改为「像妓女那样不知羞耻地」，分寸与原文一致，未加强为斥责。

## 格式硬约束核对
1. 段落数：11 段，与源文一致（源文 11 个空行分隔段）。✅
2. 对话段（源文 `--` 起首）：全部以「——」开头，未加引号；非对话段内引语用“”。✅
3. 全文零反引号。✅
4. 引号成对；无半角引号；无 ASCII 双连字符；省略号未出现；破折号均为「——」。✅
5. 斜体 *maîtres* 保留为 Markdown 斜体，未加书名号（外来词/普通名词）。✅
6. 无 M^me^ 类上标残留；M. de Guermantes → 「盖尔芒特先生」。✅
7. 无脚注、译注、夹注；无图片。✅
8. 本 chunk 无分节符。✅
9. 无出版机构信息。✅
10. 无禁用译名（检查「亲王夫人」「外婆」「货栈」等均未出现；princesse de Parme 作「帕尔马亲王妃」）。✅
11. 专名均按术语表；表外专名仅 `Schola` 保留原文。✅
12. 正文无说明性文字。✅

## 对后续章节的建议
- 建议 glossary 增补：`baron de Norpois` → 「诺尔普瓦男爵」（与大使区分）；`Schola` 的统一处理方式；`loueuse de chaises` → 「教堂里出租椅子的女人」（描述性，可作参考条）。
- 注意 `tous les huit jours`、`quinzaine` 一类法语周期表达，勿按字面数字直译。
- 本章叙述者常用「在公爵眼里……其实……」的双视角对举，插入语（如 `-- et cela jusqu'à de grandes distances --`）应挂在视角主体而非被看对象上，建议后续 chunk 统一。
