# Chunk 28 校对报告 (第 001 章)

## 硬约束逐条核对
1. **段落数**：原文单段，终稿严格保持单段，未拆。全段以「舅舅斡旋→尼斯旧闻→蔚蓝海岸考据→奥黛特面容的两极摆动→夜间约会与夏吕斯盘问→『她没跟任何人说话』的宽慰与刺痛」一线推进，长句推进保留。
2. **反引号**：终稿零反引号（初译亦无，已复核）。
3. **引号**：原文直接引语以 « » 形式嵌入叙述，非行首双连字符，故终稿用外层“”；本 chunk 无引语套引语，未用到内层‘’。原文两处 `--`（« les regards -- pourtant si honnêtes et si simples -- d'Odette »、« cette légende -- fût-elle authentique -- »）是句中插入语的破折号，不是对话行标记，终稿保留为「——」插入语，未误作对话。
4. **斜体**：原文斜体仅 *Primavera*、*bella Vanna*、*Vénus*（波提切利作品），终稿作《春》、「美丽的万娜」、《维纳斯》，不加斜体（作品名用书名号／引号，符合术语表 note）。
5. **图片／图注／脚注／译注**：无，未新增。
6. **数字空格**：本段无阿拉伯数字。
7. **禁用译名**：史万、黛奥特、虐待狂、亲王夫人均未出现；Forcheville→福什维尔（「与福什维尔结盟」）。

## 术语审查
- **Forcheville→福什维尔**：chunk 术语表未收录，L2 已按第一卷通行译名处理并经本层确认。**建议上游补入 glossary.json**。
- **Vénus**：术语表 note 为「厨房=维纳斯小庙」，与本处「波提切利画作《维纳斯》」语境冲突。本处作《维纳斯》（书名号），**建议术语表拆分两个义项**（画作名 / 厨房比喻），避免后续 chunk 误用。
- **bella Vanna**：按术语表作「美丽的万娜」并保留引号；带冠词形式 `la bella Vanna` 语义不变，建议术语表补注。
- **Septennat→七年任期**：照 note 作「七年任期初年的那些岁月」，未展开为麦克马洪注释（格式约束禁夹注）。可读性可接受，因后文「那时人们冬天在……夏天在……」已给出时间落点。
- **viveurs / hommes à femmes / femme entretenue**：沿用 L2 的「在欢场里厮混的人」／「猎艳者」／「被人供养的女人」；未弱化为「交际花」，保留原文与「善良的女子」之间的两极摆动。
- **mon oncle / mon oncle Adolphe**：首次出现原文仅作 mon oncle，译「我舅舅」；后文作「阿道夫舅舅」，与术语表 note（儿语称谓、沿第 1 章先例）一致。

## 初译稿典型错误
- **名词化与「的」字堆叠**：「他对情妇的想象上做了一次无法抹去的修改」→「对他心目中情妇的形象做了一次抹不掉的修改」（「想象」作名词是英语句法残留）。
- **抽象名词直搬**：「并入他的悲伤」「化为固体」保留（原文隐喻必须留）；「他对情妇的想象」改为「他心目中情妇的形象」；三件作品名统一为「波提切利的《春》、『美丽的万娜』或《维纳斯》」，使「进入……灵魂」的宾语归属清楚，不让「波提切利」裸名夹在作品名之前。
- **生硬短语**：「以比那位美学家更大的热情，去把……拼合」→「他便会拿出比那位美学家更大的热情，去把这一带当年的桩桩琐事一一重新拼合」，把 plus de passion que 的状语挂回主句，避免条件从句悬空；`il ne ferait pas difficulté` 初译「不会介意」→「不会推辞」（faire difficulté 是「为难、推托」，非「介意」）。
- **误译／过译**：
  - `une déception`「一件失望的事」→「失望了一回」（原文是口语叙述，不是事件名）。
  - `il venait d'essayer de la prendre de force`「想用强占有她」→「想对她用强」（prendre de force 在此为「用强」，非「占有」的完成义）。
  - `elle ne lui disait qu'à la dernière minute si elle pourrait le lui accorder`「能否赏他这个脸」→「晚上能不能见他」：原文 accord 在此是中性允诺，加「赏脸」把奥黛特的居高临下坐实成讽刺，超出原文分寸。
  - `elle alléguait qu'elle était obligée d'attendre`「她推说自己在等」→「她总推说身不由己，得等」：补出 alléguait 的「借口」义，但不替她定性为撒谎。
  - `avec des glands d'or`「带金流苏」→「缀金流苏」（gland 是流苏坠饰，「缀」更准）。
  - `manteau de soirée`「晚外套」保留，未改为「晚礼服大衣」（原文是外套，不是礼服）。
  - `il se sentait plus soulagé`「感到宽慰」→「觉得更宽慰」（保留比较级，原文是每听一句逐渐加码的缓解）。
  - `il le contraignait`「逼他再讲」→「缠着他再多说些」：contraindre 在此是软性施压，斯万对夏吕斯不会用「逼」。
  - `C'est bon à savoir pour une autre fois !`「下次可记住了！」→「下次我记住了！」（原文是她以自己口吻记下这笔账，不是命令对方记住）。
  - `Vous êtes gentil, mon petit Mémé, je vous aime bien`「您真是个好人」保留；未改「您真可爱」，因原文 gentil 偏「厚道」。
  - `l'abîme sans fond où étaient allées s'engloutir ces années`「沉没在那里」保留；未加「岁月的洪流」等原文没有的意象。
  - `comme une campagne grise`「一片灰色的田野」；调整为「一片灰蒙蒙的原野，覆盖其上的云层……散开」，避免「灰色的田野，满天云层」两个并列名词短语在中文里失主。
  - `une personnalité irréductible et malfaisante`「无法化约的邪恶人格」→「无法剥离的邪恶人格」：irréductible 在此指「不能从她身上减掉／剥离」，不是哲学术语「不可化约」，避免学术腔。
  - `coulait comme en or`「像浇铸金子一般熔铸出一个」→「像浇铸金子一样浇铸出一个」（原文同一动词 couler 贯穿，中文也宜同词复用，不换成「熔铸」）。
  - `plus de passion que l'esthéticien` 一句初译把「比那位美学家更大的热情」前置，导致「只要……他便会以……」的条件从句悬空；已重排为「他为了把……拼合，便会表现出比……更大的热情；那美学家考究……」，使两个分句各自落地。
  - `des phrases qui ... passaient à l'état solide ... qu'ils étaient doux au contraire ces mots`：初译在「再不移开」后直接接「相比之下」，转折略突兀；调整为「——相比之下，那几句话是多么温柔：……」，保留原文 que 处的陡然转接，且不拆句。
  - `Il est vrai que`「诚然」保留（原文是叙述者的让步插入，不是斯万的自辩）。
  - `il éprouvait le repos`「感到一种休息」→「感到一阵歇息」（repos 在此是「歇口气」，非「休息」这一状态名词）。
  - `ce qui nous donne l'illusion d'une sorte de pouvoir sur elles`「这便给了我们一种对它们拥有某种权力的幻觉」→「于是我们便幻觉自己多少能支配它们」（消除「一种……某种」的双重冠词堆叠）。
  - `les plaisirs les plus innocents`「最无害的消遣」保留；未改「最纯洁的娱乐」，因原文 innocents 是「不涉情事」的中性判断。
  - `comme une incrustation`「像嵌进去的硬块一样硬化」保留物性隐喻链（固体—硬化—割伤—不移开）。
  - `fluides, faciles, respirables`「流动、轻便、可以呼吸」→「流畅、轻盈、可以呼吸」（fluide 在此形容话语在体内流动，非液体；faciles 是「不费劲」，不是「轻便」）。
  - `pour sa transfiguration`「令它焕然改观」保留；未译「显圣」，避免宗教词越界。
- **重复与冗词**：「他越發后悔与阿道夫舅舅闹翻」「他越发后悔跟阿道夫舅舅闹翻」；「设法去接近」保留（原文 chercha à se rapprocher）；删去初译「为了向那些人打听，他设法……」中多余的「那些人」指代，因前句已明。
- **地名／机构**：英国人散步大道、格雷万蜡像馆、黑猫夜总会、巴登、尼斯、蔚蓝海岸、佛罗伦萨，均按术语表。

## 对后续章节的建议
1. 本段是全书最典型的「普鲁斯特长句」样本：一个主句挂三层从属（时间限定→地点对举→诗人赋予的深度），再以分号接美学家的比较。**统一处理原则**：主句动词（se penchait / il eût mis）先落地，从属层用「那时人们……」「只要……他便会……」这类中文介词／条件框架承接，不切成等长短句，也不把分号改成句号。
2. **物性隐喻链**（passer à l'état solide → se durcir → incrustation → déchirer → ne plus bouger，对照 fluides / respirables）在本章反复出现，建议后续 chunk 沿用同一组词（固体／硬化／嵌进去／割伤／再不移开；流畅／轻盈／可以呼吸），不要每次换喻体。
3. **斯万式自我说服**的句法标志是「Il se disait :」「il pensait que」「Il est vrai que」「Après tout」；中文宜保留这些「自问自答的转轴」，不要合并成一段连贯断言，否则会把他的自我欺瞒写成叙述者的定论。
4. **「我的小梅梅」**共四次，均保留；夏吕斯的口吻是亲昵中带居高临下，句式宜短、带感叹，不加「亲爱的」一类补偿。
5. 术语表待补：Forcheville→福什维尔；Vénus 需拆义项（画作《维纳斯》／厨房维纳斯小庙）；viveurs、hommes à femmes、femme entretenue、Septennat 的展开限度（不加夹注）。
