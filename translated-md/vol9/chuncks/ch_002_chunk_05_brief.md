# Chunk 05 输入包（第 002 章，vol9）

## 本 chunk 概况

- 源文段落：第 27 段至第 28 段（0 起计），共 **2 段**，约 1210 词。
- 译文须 **2 段**，一一对应，不得合并或拆分。

## 段落结构（源文逐段，供核对段数）

- 第 27 段（prose）：Il fallait pourtant me décider. Je rec……
- 第 28 段（prose）：Celle d'une dame qui vint me dire bonj……

## 本 chunk 的术语表（本 chunk 出现的全部术语；note 列是权威判断，不得按字面自行改写）

| EN | ZH | note |
|---|---|---|
| duchesse de Guermantes | 盖尔芒特公爵夫人 | 谈及她不等于她在沙龙现场。 [类别 person] [依据译林版参考术语表 003_swann_context/glossary.json] |
| M. de Guermantes | 盖尔芒特公爵 | 即盖尔芒特公爵巴赞（duc de Guermantes）在叙述中的通常称呼；同段可简称「公爵」。禁用译法: 盖尔芒特先生先生。[person_title] |
| assiette de Saxe | 萨克森瓷盘 | 第002章：萨克森（迈森）瓷器；不作「萨克森盘子」。[object] |
| Mme d'Arpajon | 阿尔帕容伯爵夫人 | 第001章：见 Arpajon 条。[person_title] |
| Mme de Souvré | 苏夫雷侯爵夫人 | 第001章：见 Souvré 条。[person_title] |
| gens du monde | 上流社会的人 | 第003章：出入贵族沙龙的人；与「社交界」（le monde）相关但指人。[social] |
| Guermantes | 盖尔芒特 | 家族名与地名；le côté de Guermantes→盖尔芒特家那边（散步路线，贡布雷II）；hôtel de Guermantes→盖尔芒特府（巴黎府邸，叙述者一家租住其侧翼）；les Guermantes→盖尔芒特一家。[place_family] |
| marronnier | 栗树 | 花园里 le grand marronnier→大栗树，家人常聚处；全书统一「栗树」（第1章译文先例，zh列旧值「七叶树」废弃）。第002章：亲王妃家花园里的栗树，叙述者觉得坐在树下的人仿佛变了样。首现第1章。 |
| Oriane | 奥丽阿娜 | 盖尔芒特公爵夫人的名字（原文作 Oriane），圣卢称她「好奥丽阿娜」（brave Oriane，此处 brave＝好心的，不是「勇敢的」）。原注误记为「洛姆亲王妃的名字」，系旧稿残留；依据 vol2/vol6 正文，Oriane 即公爵夫人。 |
| Souvré | 苏夫雷 | 第001章：苏夫雷侯爵夫人，亲王妃出于善心接待的乏味客人。禁用译法: 苏夫雷。[person] |

## 全书前文信息

本卷（vol9）为《追忆似水年华》第四部《索多玛与蛾摩拉》第一部，全卷只译 001–004 四章，本章为第二章（第二部第一章）。前情：叙述者一家租住在盖尔芒特府侧翼；外祖母已去世；叙述者已从对盖尔芒特公爵夫人的痴恋中痊愈。上一章（001）写盖尔芒特亲王妃晚会当天午后，叙述者窥见夏吕斯男爵与裁缝朱皮安的相遇，并由此第一次真正「看见」男爵的性向；章末他仍停留在赴晚会之前的时刻。斯万已病重（自说只剩几个月）；圣卢刚从摩洛哥返法；布洛克与叙述者暂时失和。

## 本章前文信息

接上：沃古贝尔夫人的男性化面孔与投向叙述者的「植物性」兴趣；叙述者借故脱身。随后写他与花园入口之间那段令他恐惧的距离，以及这类晚会「要到第二天才真正存在」的议论，最后是夏吕斯倚在楼梯栏杆上逐一唱名问好的场面（与《唐豪瑟》的比喻）。

## 交付纪律与格式硬约束

【交付纪律 — 强制】
  - 整文件 Write 只允许一次（首版落盘）；此后只能用 Edit 定点修订，禁止用 Write/Bash 覆写已存在的文件。
  - 修订最多两轮，达到收敛条件立即交付；剩余意见写进报告。工具调用总数达到上限（L2 为 30 次，L3 为 40 次）必须交付。
  - 不要写完之后再整体重写一遍；同义表达之间择一即可，另一种写进报告。

【格式硬约束 — 强制，逐条自检】
  - 段落数必须与源文段落数一致，不得合并或拆分段落。源文每个自然段（含单行引诗、单行对话）都独立成段；本 chunk 的段落清单见下「段落结构」。
  - 零反引号：正文中不得出现 ` 反引号。
  - 零图片：不得出现 ![...](...)、<img>、图片占位符或图注行。
  - 零脚注标记：不得出现 [1]、^1^、*1* 之类脚注符号。
  - 中文引号：引语用“”，引语内再引语用‘’；逐段成对。不得出现 ASCII 双引号或 ASCII 单引号。
  - 不得出现 ASCII 的 --（原文的 -- 是法文破折号，译作中文破折号「——」；段首对话一律以「——」起首、不加引号）。
  - 省略号统一为「……」，不得出现 ASCII ...；不得出现 ^ 符号（原文 M^me^ 一律译「夫人」，M^lle^ 译「小姐」）。
  - 斜体以 Markdown 星号保留；书名用《》；分节符 * * * 若出现须单独成段。
  - 不得出现 [待定]：术语表已给全，若确有遗漏，按上下文译出并在报告中说明。
  - 译文不得包含任何出版机构信息（伽利玛／Gallimard／BeQ／魁北克／杜皮伊等），也不要加译者注、编者注。

## 原文

Il fallait pourtant me décider. Je reconnaissais bien sous les arbres des femmes avec qui j'étais plus ou moins lié, mais elles semblaient transformées parce qu'elles étaient chez la princesse et non chez sa cousine, et que je les voyais assises non devant une assiette de Saxe mais sous les branches d'un marronnier. L'élégance du milieu n'y faisait rien. Eût-elle été infiniment moindre que chez « Oriane », le même trouble eût existé en moi. Que l'électricité vienne à s'éteindre dans notre salon et qu'on doive la remplacer par des lampes à huile, tout nous paraît changé. Je fus tiré de mon incertitude par M^me^ de Souvré. « Bonsoir, me dit-elle en venant à moi. Y a-t-il longtemps que vous n'avez vu la duchesse de Guermantes ? » Elle excellait à donner à ce genre de phrases une intonation qui prouvait qu'elle ne les débitait pas par bêtise pure comme les gens qui, ne sachant pas de quoi parler, vous abordent mille fois en citant une relation commune, souvent très vague. Elle eut au contraire un fin fil conducteur du regard qui signifiait : « Ne croyez pas que je ne vous aie pas reconnu. Vous êtes le jeune homme que j'ai vu chez la duchesse de Guermantes. Je me rappelle très bien. » Malheureusement cette protection qu'étendait sur moi cette phrase d'apparence stupide et d'intention délicate était extrêmement fragile et s'évanouit aussitôt que je voulus en user. Madame de Souvré avait l'art, s'il s'agissait d'appuyer une sollicitation auprès de quelqu'un de puissant, de paraître à la fois aux yeux du solliciteur le recommander, et aux yeux du haut personnage ne pas recommander ce solliciteur, de manière que ce geste à double sens lui ouvrait un crédit de reconnaissance envers ce dernier sans lui créer aucun débit vis-à-vis de l'autre. Encouragé par la bonne grâce de cette dame à lui demander de me présenter à M. de Guermantes, elle profita d'un moment où les regards du maître de maison n'étaient pas tournés vers nous, me prit maternellement par les épaules et, souriant à la figure détournée du prince qui ne pouvait pas la voir, elle me poussa vers lui d'un mouvement prétendu protecteur et volontairement inefficace qui me laissa en panne presque à mon point de départ. Telle est la lâcheté des gens du monde.

Celle d'une dame qui vint me dire bonjour en m'appelant par mon nom fut plus grande encore. Je cherchais à retrouver le sien tout en lui parlant ; je me rappelais très bien avoir dîné avec elle, je me rappelais des mots qu'elle avait dits. Mais mon attention, tendue vers la région intérieure où il y avait ces souvenirs d'elle, ne pouvait y découvrir ce nom. Il était là pourtant. Ma pensée avait engagé comme une espèce de jeu avec lui pour saisir ses contours, la lettre par laquelle il commençait, et l'éclairer enfin tout entier. C'était peine perdue, je sentais à peu près sa masse, son poids, mais pour ses formes, les confrontant au ténébreux captif blotti dans la nuit intérieure, je me disais : « Ce n'est pas cela. » Certes mon esprit aurait pu créer les noms les plus difficiles. Par malheur il n'avait pas à créer mais à reproduire. Toute action de l'esprit est aisée si elle n'est pas soumise au réel. Là, j'étais forcé de m'y soumettre. Enfin d'un coup le nom vint tout entier : « Madame d'Arpajon. » J'ai tort de dire qu'il vint, car il ne m'apparut pas, je crois, dans une propulsion de lui-même. Je ne pense pas non plus que les légers et nombreux souvenirs qui se rapportaient à cette dame, et auxquels je ne cessais de demander de m'aider (par des exhortations comme celle-ci : « Voyons, c'est cette dame qui est amie de M^me^ de Souvré, qui éprouve à l'endroit de Victor Hugo une admiration si naïve, mêlée de tant d'effroi et d'horreur »), je ne crois pas que tous ces souvenirs, voletant entre moi et son nom, aient servi en quoi que ce soit à le renflouer. Dans ce grand « cache-cache » qui se joue dans la mémoire quand on veut retrouver un nom, il n'y a pas une série d'approximations graduées. On ne voit rien, puis tout d'un coup apparaît le nom exact et fort différent de ce qu'on croyait deviner. Ce n'est pas lui qui est venu à nous. Non, je crois plutôt qu'au fur et à mesure que nous vivons, nous passons notre temps à nous éloigner de la zone où un nom est distinct, et c'est par un exercice de ma volonté et de mon attention, qui augmentait l'acuité de mon regard intérieur, que tout d'un coup j'avais percé la demi-obscurité et vu clair. En tout cas, s'il y a des transitions entre l'oubli et le souvenir, alors ces transitions sont inconscientes. Car les noms d'étape par lesquels nous passons, avant de trouver le nom vrai, sont, eux, faux, et ne nous rapprochent en rien de lui. Ce ne sont même pas à proprement parler des noms, mais souvent de simples consonnes et qui ne se retrouvent pas dans le nom retrouvé. D'ailleurs ce travail de l'esprit passant du néant à la réalité est si mystérieux, qu'il est possible, après tout, que ces consonnes fausses soient des perches préalables, maladroitement tendues pour nous aider à nous accrocher au nom exact. « Tout ceci, dira le lecteur, ne nous apprend rien sur le manque de complaisance de cette dame ; mais puisque vous vous êtes si longtemps arrêté, laissez-moi, monsieur l'auteur, vous faire perdre une minute de plus pour vous dire qu'il est fâcheux que, jeune comme vous l'étiez (ou comme était votre héros s'il n'est pas vous), vous eussiez déjà si peu de mémoire, que de ne pouvoir vous rappeler le nom d'une dame que vous connaissiez fort bien. » C'est très fâcheux en effet, monsieur le lecteur. Et plus triste que vous croyez quand on y sent l'annonce du temps où les noms et les mots disparaîtront de la zone claire de la pensée, et où il faudra, pour jamais, renoncer à se nommer à soi-même ceux qu'on a le mieux connus. C'est fâcheux en effet qu'il faille ce labeur dès la jeunesse pour retrouver des noms qu'on connaît bien. Mais si cette infirmité ne se produisait que pour des noms à peine connus, très naturellement oubliés, et dont on ne voulût pas prendre la fatigue de se souvenir, cette infirmité-là ne serait pas sans avantages. « Et lesquels, je vous prie ? » Hé, monsieur, c'est que le mal seul fait remarquer et apprendre et permet de décomposer les mécanismes que sans cela on ne connaîtrait pas. Un homme qui chaque soir tombe comme une masse dans son lit et ne vit plus jusqu'au moment de s'éveiller et de se lever, cet homme-là songera-t-il jamais à faire, sinon de grandes découvertes, au moins de petites remarques sur le sommeil ? À peine sait-il s'il dort. Un peu d'insomnie n'est pas inutile pour apprécier le sommeil, projeter quelque lumière dans cette nuit. Une mémoire sans défaillance n'est pas un très puissant excitateur à étudier les phénomènes de mémoire. « Enfin, M^me^ d'Arpajon vous présenta-t-elle au prince ? » Non, mais taisez-vous et laissez-moi reprendre mon récit.
