# Chunk 28 翻译报告 (第 001 章)

## 上游信息差异（请 L1/L3 注意）
本 chunk 的任务提示词「本节要点」称本段为「外叔祖阿道夫受托去劝奥黛特，回来讲述她如何布置果品（克拉波特、若雷、舍韦三家店）」；但实际 `ch_001_chunk_28_source.md` 内容并非如此——它是单段，写舅舅劝斯万疏远奥黛特后反被奥黛特指为「用强」、斯万与舅舅决裂、斯万追索奥黛特在尼斯与巴登的旧闻、以波提切利考据作比、奥黛特面容在其心中的两极摆动、夜间约会与向夏吕斯盘问行踪、终以「她没跟任何人说话」的宽慰与刺痛作结。全段无任何果品商（Clapot/Joray/Chevet）内容。译文严格依据实际 source 文件翻译；段落数（1 段）符合要求。若上游确认提示词所指为另一段文本，请核查 chunk 切分是否错位。

## 术语遗漏
| EN | 出现位置 | 备注 |
|---|---|---|
| Forcheville | 全段中后部（« il rêvait d'une alliance avec Forcheville »） | chunk 术语表未收录。按第一卷通行译名作「福什维尔」，请校对者确认并与全局术语表对齐；若全局表另有定名，请统一替换。 |
| la bella Vanna | 中段（波提切利画作列举处） | 术语表条目为 `bella Vanna`→「美丽的万娜」，原文此处作 `la bella Vanna`（带冠词），已按术语表处理；建议术语表补收带冠词形式。 |
| la Vénus, de Botticelli | 同上 | 术语表 `Vénus` 条目 note 为「厨房=维纳斯小庙」，与本处（波提切利画作）语境不符；本处按画作名译《维纳斯》。建议术语表拆分为两个义项。 |
| les viveurs | 前段（« se rapprocher de certains viveurs »） | 未收录，译作「浪荡子」，指出入欢场的阔绰男子，与后文 « hommes à femmes »（猎艳者）区分。 |
| homme entretenue / femme entretenue | 中段（« l'idée qu'elle était une femme entretenue »） | 未收录，译作「被人供养的女人」。原文与 « créature bonne » 构成斯万认知的两极摆动，请校对者注意勿弱化为「交际花」这类带类型化色彩的词。 |

## 难点句式
- 原文："...il se penchait avec une angoisse impuissante, aveugle et vertigineuse vers l'abîme sans fond où étaient allées s'engloutir ces années du début du Septennat pendant lesquelles on passait l'hiver sur la promenade des Anglais, l'été sous les tilleuls de Bade, et il leur trouvait une profondeur douloureuse mais magnifique comme celle que leur eût prêtée un poète" → 处理方式：保留「俯身探向无底深渊」的空间意象，把 Septennat 的时间限定、冬夏两地的对举、以及「诗人赋予的深度」三层依次挂回同一动词；用「那时人们……」引出同位性说明，避免中文关系从句套叠。
- 原文："...il eût mis à reconstituer les petits faits de la chronique de la Côte d'Azur d'alors, si elle avait pu l'aider à comprendre quelque chose du sourire ou des regards -- pourtant si honnêtes et si simples -- d'Odette, plus de passion que l'esthéticien qui interroge les documents subsistant de la Florence du XVe siècle..." → 处理方式：比较结构（plus de passion que）在中文里后置易散，故先立「只要……他便会以比那位美学家更大的热情……」，再把波提切利三件作品作为美学家的宾语并列收尾，保住原文「考据—进入灵魂」的反讽性类比。
- 原文："...des phrases qui aussitôt dans le cœur de Swann passaient à l'état solide, s'y durcissaient comme une incrustation, le déchiraient, n'en bougeaient plus, qu'ils étaient doux au contraire ces mots..." → 处理方式：保留「化为固体／硬化／嵌进去／割伤／再不移开」的连续物性隐喻；此处原文句法在 que 处陡然转接，译文以破折号插入该长定语，再用「相比之下」翻出转折，不拆成两句以免削弱「硬块—可呼吸」的对照。
- 原文："Et leur insignifiance, si elle le rassurait, lui faisait pourtant de la peine comme une trahison." → 处理方式：让步从句前置为「虽然……却仍……」，句末落在「像一种背叛」，与原文落点一致；不补出「背叛」的具体所指。

## 给校对者的提示
1. **单段硬约束**：原文为单段（约 1,740 词），译文严格保持一段，未作任何分段。全段脉络为：舅舅斡旋→尼斯旧闻→蔚蓝海岸考据→奥黛特面容的两极摆动→夜间约会与向夏吕斯盘问→「她没跟任何人说话」的宽慰与刺痛；校对时请勿为可读性拆段。
2. **对话引号**：全段有三处直接引语（奥黛特的「你看起来多伤心啊」、奥黛特的「这就是你对我把你留到最后一分钟的感谢……」、斯万盘问夏吕斯的一长串问话），均已用中文“”，无嵌套。斯万那句连续追问保留了原文的省略号与问号节奏（「……没有？……不是？……没有？」），这些短问句是斯万假作不解、套话的表演，不宜合并。
3. **「我的小梅梅」**：按术语表作「梅梅」，未作「奶奶」解；共出现四次，均保留「我的小梅梅」。但请注意：术语表 note 称 Mémé 是「夏吕斯男爵对斯万的亲昵绰号」，而本 chunk 中这一呼语的实际使用者是斯万（他在盘问夏吕斯：「可是怎么回事，我的小梅梅……你们不是从她家出来就去了格雷万蜡像馆吗？」），受话者是夏吕斯。译文按原文语境保留为斯万对夏吕斯的称呼，未改动；请校对者与术语表维护者核实该 note 是否写反，或二人是否互用此昵称。
4. **反讽分寸**：「比那位美学家更大的热情」一句，原文讽刺斯万把爱情猜疑提升为文艺复兴考据的学术激情；译文未加任何点评，请校对者勿增「可笑地」「荒唐地」一类副词。
5. **时态与不确定性**： « peut-être »、« eût-elle été authentique »、« il pouvait arriver » 等虚拟、条件语气均保留为「也许」「哪怕属实」「也许就能」，未译成断言。
6. **Septennat**：按术语表作「七年任期」，并在句中加了「七年任期初年」以承接 « ces années du début du Septennat »，未展开为「麦克马洪总统任期」之类注释（格式硬约束禁止夹注）。
7. **格式自检**：单段；无图片；无反引号；无脚注夹注；阿拉伯数字与中文之间无相邻情形需处理（本段无阿拉伯数字）。
