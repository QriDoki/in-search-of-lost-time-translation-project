# Chunk 41 校对报告 (第 001 章)

## 格式硬约束核对（逐条）
1. 段落对应：原文为一整段（1,640 词），终稿严格保持**一段**（`awk 'NF'` 计数 = 1，段内无空行）。✅
2. 反引号：终稿全文 0 个反引号（初译亦无）。✅
3. 引号：本节无行首「--」对话，唯一引语为斯万内心独白，用中文双引号“”包住整段引语，引语内无嵌套引号（无需内层‘’）。✅
4. 斜体：原文无星号标记，故终稿无斜体、无书名号插入。✅
5. 图片/图注/脚注/译注：终稿无图片、无脚注、无解释性夹注。✅
6. 数字空格：本节无阿拉伯数字（「两三下」「一小截」均为汉字数词）。✅（不适用）
7. 禁用译名：史万／黛奥特／虐待狂／亲王夫人 均为 0 处（已 grep 核验）。✅

## 术语审查
- `M. des Laumes` → **洛姆亲王**（初译即正确；未误作「洛姆先生」或「亲王夫人」）。`princesse des Laumes` 本节未出现。
- `M. de Charlus` → 夏吕斯先生；`baron de Charlus` 本节未出现。✅
- `M. d'Orsan` → 奥尔桑先生。✅
- `Rémi` / `Lorédan` → 雷米 / 洛雷丹，均沿用术语表，未合并、未擅改。
  - **提请上游注意**：原文「Puis Swann soupçonna Rémi, qui… n'aurait pu qu'inspirer la lettre… D'abord Lorédan avait des raisons d'en vouloir à Odette」两名连用，而术语表二者皆注为「斯万的车夫」，疑为普鲁斯特原稿人名不统一（七星版亦保留此状）。译文照原文分别保留两名，**未作统一**，请协调者决定是否在术语表加注「原文异名并存，勿合并」。
- `le peintre` → 画家（未补姓名，符合叙述边界）。`Bergotte` → 贝戈特。`les Verdurin` → 维尔迪兰夫妇。
- `chrysanthème` → 菊花；`grand-père` → 外祖父（本节为叙述者插入语「我的外祖父」，保留第一人称，未改作「斯万的外祖父」——原文故意让叙述者现身）。
- L2 报告提及的 `Forcheville`（福什维尔）、`M. de Bréauté`（布雷奥泰先生）未收入本 chunk 术语表，译文采用通行译名，**建议补入全局术语表**。
- `maquerelle` → 老鸨（「去老鸨家里」）；`proxénète` → 淫媒。符合简报的粗俗语不弱化要求。

## 初译稿典型错误与修正
- **句间逻辑连接生硬**：初译在「奥尔桑……更恰当的举动。以至于他无法理解」处用「以至于」直搬 `C'était au point que`，中文读来像结果状语却缺前件。→ 改为「到了这种地步，他竟无法理解……」。
- **否定—转折层次被抹平**：初译「然而此时，既然他无法怀疑任何一个人，他就不得不怀疑所有人」把原文 `après n'avoir pu soupçonner personne`（时间/让步）处理成因果。→ 改为「然而这样一来，在无法怀疑任何一个人之后，他便不得不怀疑所有人」，保留由「无法怀疑」到「怀疑所有人」的翻转，不落成断言式因果。
- **并列关系误读为递进/并列失衡**：`du grand seigneur que du valet` 一句初译三组对比以「或者……藏在……藏在」展开，末两组失去「看不出」的统摄。→ 改为「看不出它藏在艺术家的性格里会比……更有理由，也看不出它藏在显贵的性格里会比藏在仆役的性格里更有理由」，三组同受「看不出」管领。
- **词汇偏书面/生僻**：`s'obscurcissait` 初译「心智昏暗下去」、终稿一度作「阴翳」；均调整为「头脑蒙上一层阴翳」，并删去文言色彩过重的「蒙上一层阴云」。
- **成语化风险**：`l'esprit paresseux` 初译「头脑懒惰」可，但 `la vie des êtres est pleine de contrastes` 初译「充满矛盾」稍强于原文 `contrastes`（并置的反差，非逻辑矛盾）→ 终稿改回「充满矛盾」是取通行读法；此处记录：`contrastes` 亦可解作「反差」，若全书体例偏字面可回退为「充满反差」。
- **引语边界**：初译内心独白只把「这不是没有缘故的……」放入引号，而原文章末 `« Ce n'est pas pour rien… un honnête homme. Il a pu mal agir une fois de plus. »` 引号涵盖至「又干了一次坏事」。→ 已把引号收束点移至「他可能又干了一次坏事。」之后，恢复原文引语范围。
- **「不体面」重复**：`une action indélicate … un sentiment indélicat` 初译「不体面的事／不体面的情感」，与上文 `vie peu honorable`（不大体面的生活）撞词。→ 改为「不够得体的事／不够得体的情感」，区分 `indélicat` 与 `peu honorable`。
- **指代含混**：`deux ou trois fois ses mains sur son front` 初译「在额上抹了两三下」。「抹」偏擦拭义，且「额上」略文；改为「在额头上抹了两三下」。
- **「她本人」冗余**：`lui raconter ainsi à elle-même` 初译「讲给她本人听」→「当她的面把她做过的事讲给她听」，更贴合 `à elle-même` 的当面意味。
- **「放过去」义**：`le seul petit bout qu'il laissât passer malgré lui` 初译「无意间漏出去」→「不由自主漏过去的唯一一小截」，与 `malgré lui`（不由自主）及 `laissât passer`（放过去、漏过去）对应，同时保住 `entre tant d'autres` 的「碎片还有许多」插入语。

## 分寸把握（普鲁斯特式迟疑）
- `peut-être demain pleurerait-il… et aujourd'hui… avait-il désiré` 保留「也许……而今天却……」的两可结构，未改成「他一定想让他痛苦」。✅
- `il ne voyait pas plus de raisons…` 全句维持否定式比较（「看不出……更有理由」），未落成「人人都可能」。✅
- `les indignations vertueuses` 保留轻讽（「义正词严的愤慨」），未加强为贬斥；`avec cette réserve de pur style` 处理为「一层纯属形式的保留」，保住反讽而不解释。✅
- `Cette race d'hommes est la pire de toutes` 译「骨子里，这一类人是最坏的」——保留斯万式以偏概全的断语，但不加译者评判。✅
- `Avoir du cœur, c'est tout` 译「有一颗心，便抵得上一切」，避免四字格堆砌。✅

## 对后续章节的建议
1. **Rémi / Lorédan 异名问题**：建议在全局术语表为二者同加注「原文同段并出，指斯万车夫，勿合并、勿改写」，以免后续 chunk 出现不一致处理。
2. `Forcheville`、`Bréauté`、`le peintre` 建议补入术语表（前者后续出现频率高）。
3. `contrastes`（人的生活充满……）建议全书统一口径：取「反差」则更贴字面，取「矛盾」则更顺中文；本 chunk 暂取后者，请协调者裁定后回改。
4. 本章叙述者偶以「我的外祖父」现身（`mon grand-père`），系原文第一人称插入，非误译，后续 chunk 若遇同类插入语请保留「我」。
