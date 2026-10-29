# Chunk 50 校对报告 (第 001 章)

## 术语审查
- 全部术语按 chunk 术语表落实，无旧译、无直译遗留：Gilberte→希尔贝特、Bergotte→贝戈特、Swann→斯万（本 chunk 均作「斯万夫妇」，符合上下文，未出现需要「斯万先生」的单称）、Mme Swann→斯万夫人、grand'mère→外祖母、Figaro→*《费加罗报》*（斜体＋书名号）。
- `leader article`、`the right man in the right place` 均保留英文原文并置中文引号，未译、未加书名号、未加注。
- `engagé volontaire`→「志愿兵」，按术语表 note 处理；L2 报告建议补入 glossary.json，本 chunk 认可用法，请上游章节协调者同步收录。
- `salon` 在第 1 段取社交义，作「心智上的沙龙生活」；第 3 段取房间义，作「客厅」。两处判断与术语表 note 一致。
- `M^me^` 无上标残留；`Figaro` 星号斜体保留为 Markdown 斜体。

## 初译稿典型错误
- **代词指涉误读（实质性误译）**：第 1 段 "mes traits brillants ne leur servissent que d'heureuse répartie"，`leur` 指前面自己提出的那些「虚构的问题」，初译作「只成为他们愉快的应对」，把 `leur` 误当成那些缺席的对话者；已改为「不过是给这些问题的漂亮回答」。
- **误加定语、改变语义**：第 9 段 "ils sont de plus en plus persuadés de mon excellente influence sur elle"，初译作「相信我对他有极好的影响」——`sur elle` 指希尔贝特的「她」，且中文「他」在上下文中会被读成斯万先生；已改为「相信我给她带来的影响极好」。
- **主体悬置**：第 2 段「把一切都从属于这个实现」是 `subordonner tout à cette réalisation` 的硬译，中文不成立；改为「让其余一切都服从这件事」。
- **比喻失当**：第 7 段 "comme on invite un engagé volontaire avec son colonel"，初译「有人把一名志愿兵托付给他的上校」把「一并请客」的谐谑改成「托付」，与后半句「为我前程着想」脱节；改为「请客时把一名志愿兵连同他的上校一并请来」。
- **口语语气偏硬**：第 4 段 "il est plus aigu, plus concentré dans le journal que dans le livre où il délaie un peu"，初译「在书里则有些铺展」偏书面；斯万夫人此处是随口的品评，改为「在书里则有点稀释」。同段 "J'ai obtenu qu'il fasse désormais..." 初译「我已经让他今后……」丢失了「争取到」的意味，改为「我已经争取到让他今后……」。
- **长句断句（第 1、2、8 段）**：初译多处用冒号把普鲁斯特的从属层次切成并列短句。已按思想层次重排，例如第 2 段「她这一句不公的评判令我烦躁」原为后半句的悬置状语，改为独立收束，并把「她刚刚又把作品的完成推后了」的原因关系提前点明。
- **「外在的日子」**：第 2 段 "cette journée extérieure et vaste"，初译「宽广的外部日子」生硬；改为「在我身外展开的、宽广的日子」。

## 对后续章节的建议
- 普鲁斯特本章反复用「爱情中所得即新起点」的推进结构（`ce qu'on a obtenu n'est jamais qu'un nouveau point de départ`）。建议后续 chunk 统一处理为「所得到的东西，从来只是更想多要一点的新起点」这类句式，保持同一命题在全书中措辞稳定。
- 法语 `le leur / lui / elle` 在长句中指向前文多个名词时，中文必须显化（「给这些问题的」「给希尔贝特带来的」），否则易出现本 chunk 的两处代词误读。建议在 L2 提示中把「代词显化」列为常规检查项。
- 斯万夫人的台词是全书少见的轻快口语，宜用短句、口语虚词（「照样」「有点」「才真是」），不要用书面连接词，以与贝戈特的文体重形成对照。
