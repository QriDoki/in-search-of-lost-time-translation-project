# 第 002 章术语表维护报告（贡布雷 II）

> **【2026-10 修订提示】** 本报告记录的是当时的原译。其后经术语文化核准，部分译名已修订（萨冈亲王妃、维米尔、皮特·德·霍赫、威尔士亲王、圣雅各扇贝、天国仙女、葡萄酒市场、圣心修道院学校、粉红版《辩论报》、《第九交响曲》、《名歌手》）。现行标准以 `glossary.json` 与 `reports/glossary_revision_2026-10.md` 为准，本报告下文中的旧译与「禁用译法」不再有效。

- 术语表：`translated-md/glossary.json` 由 189 条合并至 **423 条**（本章新增 **234** 条；另有 6 条拟新增 key 已存在于第 1 章表中，按「只增不改」原则跳过：Hubert Robert、princesse de Léon、agent de change、cocotte、demi-monde、mérovingien）。
- 译名依据：译林十五人合译本（第一卷李恒基、徐继曾译）通行译名体系；「禁用译法」为全书硬约束。
- 匹配与展示约定：术语 key 以规范化形式存储（M^me^→Mme、M^lle^→Mlle、NFC）；每 chunk 术语表 FR 列还原源文原形（含上标）。

## note 修订（仅改 note，不改 zh）

1. **grand'tante（姑外祖母）**：第 1 章旧注称「与莱奥妮姑妈同一人」，本章正文明示有误——«La cousine de mon grand-père -- ma grand'tante -- chez qui nous habitations, était la mère de cette tante Léonie…»：**姑外祖母是外祖父的堂姐妹、莱奥妮之母，二人为两人**，且姑外祖母在本章为在世角色（新年赏钱、周六朗读、«Abondance de biens» 劝慰生病的女儿莱奥妮、贝戈特谈话、勒格朗丹散布其「jeunesse orageuse」流言等段）。已更正 note，zh 不变；第 1 章译文无需返工（译名本身正确）。
2. **tante Léonie**：同步删除「即 grand'tante 同一人」表述。
3. **grand'mère / grand-père**：第 1 章译文实际使用「外祖母／外祖父」（001.md 计 49/37 处），book_context_001.md 第 8 行「外婆／外公」为笔误，note 已注明全书统一「外祖母／外祖父」。
4. **Adolphe**：亲属关系表述改中性（叔公辈），避免与 grand-oncle→外叔外祖父 冲突坐实；「mon oncle Adolphe→我的阿道夫舅舅」沿第 1 章儿语称谓先例（**遗留冲突 flag**：严格亲属关系为叔外祖父辈，与 ch1 grand-oncle=外叔外祖父 的译法体系存在称谓层级不一致，建议 L0 全书复核）。
5. **Gilberte**：第 1 章 note「I部正文未指名」已过时，本章实名出现（坦松维尔初遇、香榭丽舍），已更新。

## 已有术语审查结论

- **塞利娜／弗洛拉「姑妈」称谓**（book_context_001 待复核事项）：二人未在本章正文出场；本章 «les sœurs de ma grand'mère»（外祖母的两位妹妹）与 «mes tantes»（凡德伊曾任其钢琴教师）即指二人。称谓决策：**维持「姑妈」体系**（ma tante→姑妈），结论记入 book_context_002.md。
- **ma tante**：本章高频（120 处），除个别指赛莉纳/弗洛拉外通指莱奥妮姑妈，统一译「姑妈」，禁用「姨妈」。
- **madame Octave / M^me^ Octave**：仆人与镇民对莱奥妮姑妈的称呼→「奥克塔夫夫人」；mon oncle Octave→「我的姑父奥克塔夫」（与「莱奥妮姑妈」配对一致）。
- **M^me^ Sazerin→萨士林夫人**：欧拉莉对 M^me^ Sazerat（萨士拉夫人）的顽固误记，系原文文字玩笑，一字之差勿合并、勿改。
- **Théodore→戴奥多尔**、**Eulalie→欧拉莉**、**docteur Percepied→贝斯比埃大夫** 等第 1 章预收条目本章正文兑现，沿用不变。

## 格式与专有约定（本章）

- 拉丁词源（*sanctus Hilarius*、*sancta* *Eulalia*、*Theodeberciacus*、*Gaudiacus* *vice comitis*、*Radulfi* *villa*、*Castrum Radulfi*、*Campus Pagani*）与壁画铭文 «Caritas»：**保留原语言于斜体/引号内，不译**。
- 外语插语 *a cup of tea*：保留英文于强调内。
- 上标自然渲染：M^me^→夫人、M^lle^→小姐、M.→先生、1^er^→一号/元旦（依语境）、XVII^e^→十七世纪。
- 标题：`## II`→`## 二`（沿 `Première partie : Combray`→第一部：贡布雷 的 heading 约定）。
- 法语诗句、咏叹调歌词、彩窗题记等正文引文译为中文并保留引号；斯万讥语 la «*hiérarchie!*» des arts→艺术的「*等级*！」（保留斜体强调+引号）。
- 匿名形式（duc de X... 类）不得坐实人名；穿玫瑰色衣裙的夫人／穿白衣裙的夫人／凡德伊小姐的「女友」等身份谜团一律不点破、不加注。

## 本章新增术语（234 条）

| FR | ZH | note |
|---|---|---|
| abbé | 神父 | 天主教头衔；abbé Perdreau→佩尔德罗神父 |
| Adolphe | 阿道夫 | 外祖父之兄（严格为叔外祖父）；mon oncle Adolphe→我的阿道夫舅舅（沿前定儿语称谓） |
| Aladin | 阿拉丁 | Aladin ou la Lampe merveilleuse→《阿拉丁与神灯》 |
| Alibaba | 阿里巴巴 | 《一千零一夜》人物（盘子图案） |
| Anatole France | 阿纳托尔·法朗士 |  |
| Andromède | 安德洛墨达 |  |
| Apollon | 阿波罗 | 布洛克引句中的呼语 |
| Ar-mor | 阿尔莫 | 布列塔尼语「海」（勒格朗丹语） |
| Arena | 阿雷纳 | 帕多瓦阿雷纳礼拜堂（乔托壁画） |
| Aristote | 亚里士多德 |  |
| Assuérus | 亚哈随鲁 | 以斯帖故事中波斯王 |
| Athalie | 《阿塔莉》 | 拉辛剧；外祖父唱段«Archers, faites bonne garde»出处；杜蒙名字打趣 |
| avenue de la Gare | 车站大街 |  |
| Bailleau-l'Exempt | 巴约莱格桑 | 盖尔芒特封邑 |
| Bartet | 巴尔泰 | 女演员（名家排序段） |
| Baudelaire | 波德莱尔 |  |
| Bellini | 贝利尼 | Gentile Bellini→真蒂莱·贝利尼（穆罕默德二世肖像画家） |
| Berma | 贝尔玛 | la Berma，悲剧女演员，贝戈特推崇 |
| Bhagavat | 《跋伽梵》 | 勒孔特·德·李勒诗（「le gigantesque assembleur de rythmes」所指），书名保留强调 |
| Bible | 圣经 |  |
| Bienheureux | 真福者 | 指圣伊莱尔 |
| Bloch | 布洛克 | 我年长的同学，引介贝戈特；爱用矫揉语体（mon très cher maître） |
| Borange | 博朗日 | 另一家食品杂货店主 |
| Bouillebœuf | 布耶伯夫 | M^me^ Bouillebœuf→布耶伯夫夫人；其园丁之兄普罗斯佩 |
| Bourgogne | 勃艮第 | 圣埃卢瓦谐音玩笑发生地 |
| Bretagne | 布列塔尼 | Ar-mor=海（勒格朗丹语） |
| Burgondes | 勃艮第人 |  |
| Callot | 加洛 | la mère Callot→加洛大娘 |
| Calvaire | 加尔瓦里 | bois du Calvaire→加尔瓦里树林 |
| Camire | 卡米拉 | 引句「白色卡米拉」 |
| Campus Pagani | Campus Pagani | 拉丁词源，保留原文不译（尚皮约） |
| Camus | 加缪 | 食品杂货店主，戴奥多尔的雇主 |
| capucin | 嘉布遣修士 | 眼镜店橱窗的晴雨表玩偶，非真修士；区别于 capucines→旱金莲 |
| capucines | 旱金莲 | 植物；非嘉布遣修士 |
| Caritas | Caritas | 阿雷纳礼拜堂壁画拉丁铭文，保留原文；即乔托《仁爱》 |
| Carpaccio | 卡尔帕乔 |  |
| castel | 小城堡 | 勒格朗丹的古语用法（巴尔贝克「castels」） |
| Castrum Radulfi | Castrum Radulfi | 拉丁词源，保留原文不译（沙托鲁） |
| Champieu | 尚皮约 | 词源 *Campus Pagani* |
| Champs-Élysées | 香榭丽舍 | 斯万家所居「令人心碎的街区」 |
| Chanson de Roland | 《罗兰之歌》 |  |
| chantre | 唱诗班员 | 戴奥多尔兼任 |
| Charité | 仁爱 | la Charité de Giotto→乔托的仁爱（厨房女工绰号） |
| Charlemagne | 查理大帝 |  |
| Charles le Bègue | 口吃者查理 | 神甫地名词源段 |
| Châteaudun | 沙托丹 | 神甫之兄（税务员）驻地；勿与沙托鲁混 |
| Châteauroux | 沙托鲁 | 词源 *Castrum Radulfi*；勿与沙托丹（Châteaudun）混 |
| Cid | 《熙德》 | le Cid（高乃依剧） |
| Cimmériens | 辛梅里安人 |  |
| Clairefontaine | 克莱尔方丹 | 盖尔芒特封邑（守望塔视野） |
| Comédie-Française | 法兰西喜剧院 | 酒渣色海报 |
| Coquelin | 科克兰 | 演员（排序段） |
| Cordoue | 科尔多瓦 | cuir de Cordoue→科尔多瓦皮革 |
| coulissier | 场外证券经纪人 | 斯万父旧业讥语语境 |
| curé | 本堂神甫 | 贡布雷无名本堂神甫；M. le Curé→本堂神甫先生 |
| Cène | 《最后的晚餐》 | 古版画；亦即 le chef-d'œuvre de Vinci |
| Dagobert | 达戈贝尔 | 神甫地名词源段 |
| dame en blanc | 穿白衣裙的夫人 | 坦松维尔呼唤希尔贝特的妇人，即斯万夫人，不点破 |
| dame en rose | 穿玫瑰色衣裙的夫人 | 阿道夫叔公巴黎书房中的女客，即奥黛特，正文不点破；致父子决裂 |
| Dante | 但丁 |  |
| Delaunay | 德洛奈 | 演员（排序段） |
| Diamants de la Couronne | 《王冠钻石》 | 喜歌剧院剧目 |
| Domino Noir | 《黑多米诺》 | 喜歌剧院剧目 |
| Dumont | 杜蒙 | 当晚来晚餐的同学；外祖父拿名字打趣唱《阿塔莉》词句 |
| Délos | 提洛岛 |  |
| Ecclésiaste | 《传道书》 |  |
| enfant de chœur | 辅祭童子 |  |
| Enfers | 冥界 |  |
| Entrée de Louis-Philippe à Combray | 《路易-菲利普驾临贡布雷》 | 教堂彩窗 |
| Envie | 嫉妒 | 乔托寓言拟人；一般 envie=羡慕/渴望 |
| Erreur | 谬误 | 乔托寓言拟人 |
| Esther | 以斯帖 | 挂毯《以斯帖加冕》；拉辛剧《以斯帖》（«Champs paternels, Hébron…»出处） |
| Fabre | 法布尔 | 观察泥蜂的昆虫学家 |
| Febvre | 费夫尔 | 演员（排序段） |
| fille de cuisine | 厨房女工 | 弗朗索瓦丝欺虐的对象；绰号「乔托的仁爱」（la Charité de Giotto） |
| Galopin | 加洛潘 | 从利雪带回新狗的人家；le petit de chez Galopin→加洛潘家的小子 |
| Gaudiacus | Gaudiacus vice comitis | 拉丁词源，保留原文不译（茹伊-勒维孔特；源文作 *Gaudiacus* *vice comitis*） |
| Gilbert le Mauvais | 恶人吉尔贝 | 盖尔芒特领主，热纳维耶芙·德·布拉邦后裔；彩窗恶人即他 |
| Giotto | 乔托 | la Charité de Giotto→乔托的仁爱；帕多瓦诸德诸恶寓言画作者 |
| Gleyre | 格莱尔 | 画家（提及） |
| Got | 戈 | 演员（排序段） |
| grand Roi | 大王 | 指路易十四 |
| grand'messe | 大弥撒 |  |
| grand-duc | 大公 | 给穿玫瑰色衣裙的夫人寄烟者 |
| Grand-Pré | 大普雷 |  |
| Guillaume le Conquérant | 征服者威廉 |  |
| Guilôme | 吉约姆 | 神甫模仿诺曼底发音的威廉 |
| Habitude | 习惯 | 拟人化（l'Habitude） |
| hiérarchie | 等级 | 斯万讥语 la «*hiérarchie!*» des arts→艺术的「*等级*！」，保留斜体与引号；一般=等级制度 |
| houris | 胡里仙女 | 乐园仙女（东方传说） |
| Hébron | 希伯仑 |  |
| Hélier | 埃利耶 | 圣伊莱尔地名讹变之二 |
| Ile-de-France | 法兰西岛 |  |
| Illiers | 伊利耶 | 圣伊莱尔地名各省讹变之一 |
| Imbert | 安贝尔 | M^me^ Imbert→安贝尔夫人，种巨型芦笋 |
| Injustice | 不义 | 乔托寓言拟人 |
| Jeanne Samary | 让娜·萨马里 | 女演员（排序段） |
| Joas | 约阿施 | 《阿塔莉》人物 |
| Jouy | 茹伊 | en pension à Jouy（寄宿）；区别于 Jouy-le-Vicomte→茹伊-勒维孔特 |
| Juive | 《犹太女》 | la Juive 歌剧；咏叹调«Ô Dieu de nos Pères»«Israël romps ta chaîne» |
| Julien | 朱利安 | 弗朗索瓦丝几里外探访的亲人 |
| Jura | 汝拉 |  |
| Justice | 正义 | 乔托寓言拟人 |
| la Place | 广场 | 大写 Place 指教堂前广场 |
| Laon | 拉昂 |  |
| Lecomte | 勒孔特 | le père Lecomte→勒孔特老爹，布洛克口中的「恩师」 |
| Levrie de Magnus | 《马格努斯的猎犬》 | 同上；源文作 *Levrier* *de Magnus* |
| Lisieux | 利雪 | 加洛潘家从此地带回新狗 |
| Lohengrin | 《罗恩格林》 | 瓦格纳歌剧 |
| Loiseau | 卢瓦佐 | M^me^ Loiseau→卢瓦佐夫人，教堂邻居，窗前倒挂金钟 |
| Louis le Germanique | 日耳曼人路易 |  |
| Louis XIV | 路易十四 | le grand Roi→大王（指路易十四） |
| Léonie | 莱奥妮 | tante Léonie→莱奥妮姑妈（禁用：莱奥妮姨妈） |
| M. de Charlus | 夏吕斯先生 | 即盖尔芒特家夏吕斯男爵 |
| ma tante | 姑妈 | 本章通指莱奥妮姑妈 |
| madame Octave | 奥克塔夫夫人 | 同 Mme Octave（对话中口语称呼） |
| Madeleine Brohan | 马德莱娜·布罗昂 | 女演员（排序段） |
| Maelstrôm | 迈尔斯特伦大漩涡 | 钓鱼段比喻 |
| Maguelone | 马格洛娜 | 来请皮佩罗大夫的邻人 |
| Mahomet II | 穆罕默德二世 | 贝利尼肖像画主角 |
| maison des Archers | 弓箭手屋 | 坦松维尔附近看园人住所 |
| Manche | 英吉利海峡 |  |
| Marguerite | 玛格丽特 | 弗朗索瓦丝探访的亲人，与朱利安并列 |
| Martinville | 马丁维尔 | 三钟楼名段（含 Martinville-le-Sec） |
| Martinville-le-Sec | 马丁维尔勒塞克 | 双钟楼之一，与马丁维尔钟楼并峙 |
| Milan | 米兰 | dôme→米兰大教堂 |
| Mille et une Nuits | 《一千零一夜》 | 图案盘子 |
| Minos | 弥诺斯 | 「弥诺斯与帕西法厄之女」（诗句） |
| Mirougrain | 米鲁格兰 | 姑妈幻想中的农庄，有瀑布 |
| M^lle^ Swann | 斯万小姐 | 即希尔贝特（Gilberte） |
| M^lle^ Vinteuil | 凡德伊小姐 | 其无名女友（son amie）不立名、不点破 |
| M^me^ Amédée | 阿梅代夫人 | 仆人对外祖母（巴蒂尔德）的称呼，原文括注 ma grand'mère |
| M^me^ de Guermantes | 盖尔芒特夫人 | 即公爵夫人（duchesse de Guermantes）之别称 |
| M^me^ de Villeparisis | 维尔巴里西斯侯爵夫人 | 外祖母之友 |
| M^me^ Octave | 奥克塔夫夫人 | 仆人与镇民对莱奥妮姑妈的称呼 |
| M^me^ Percepied | 贝斯比埃夫人 | 贝斯比埃大夫之妻 |
| M^me^ Rousseau | 卢梭夫人 | 新丧；与作家卢梭无关 |
| M^me^ Swann | 斯万夫人 | 即奥黛特，正文不点破 |
| mois de Marie | 圣母月 | 五月 |
| Monseigneur | 主教大人 | 认定彩窗恶人为吉尔贝者 |
| Montjouvain | 蒙舒凡 | 凡德伊故居地；亵渎肖像场景发生地 |
| Montmorency | 蒙莫朗西 |  |
| Montpensier | 蒙庞西耶 |  |
| Moriss | 莫里斯 | colonne Moriss→莫里斯广告柱 |
| Normandie | 诺曼底 | 神甫谈 Guilôme 发音处 |
| Notre-Dame de Paris | 《巴黎圣母院》 | 雨果小说/剧目 |
| Novepont | 诺沃蓬 | 盖尔芒特封邑 |
| Nuit d'Octobre | 《十月之夜》 | 缪塞诗 |
| Nymphes | 宁芙 | Les Nymphes du printemps→《春天的宁芙》 |
| nénufar | 睡莲 | =nymphéa 异拼；受折磨的睡莲名段 |
| Octave | 奥克塔夫 | 莱奥妮姑妈的亡夫；mon oncle Octave→我的姑父奥克塔夫 |
| Odyssée | 《奥德赛》 |  |
| Oedipe-Roi | 《俄狄浦斯王》 | 源文无连字符 œ 变体（Oedipe） |
| Oiseau Flesché | 弗莱谢鸟 | hôtellerie de l'Oiseau Flesché→弗莱谢鸟客栈（盖尔芒特家那边） |
| Oloossone | 奥洛索纳 | 勒孔特·德·李勒式引句「白色奥洛索纳」 |
| Olympos | 奥林波斯 |  |
| Opéra-Comique | 喜歌剧院 | 绿色海报 |
| Padoue | 帕多瓦 | 乔托诸德诸恶寓言画所在地 |
| Pasiphaé | 帕西法厄 | 同上 |
| Paul Desjardins | 保尔·德雅尔丹 | 诗句「Les bois sont déjà noirs…」作者 |
| pays d'Auge | 奥日地区 |  |
| Perchamps | 佩尔尚 | rue des Perchamps→佩尔尚街 |
| Perdreau | 佩尔德罗 | abbé Perdreau→佩尔德罗神父，其侄女出修道院 |
| Perse | 波斯 | miniatures→波斯细密画 |
| Petit-Pré | 小普雷 |  |
| Phèdre | 《费德尔》 | 拉辛悲剧（贝尔玛名段）；亦为神话人名 |
| Piperaud | 皮佩罗 | docteur Piperaud→皮佩罗大夫 |
| Piranesi | 皮拉内西 |  |
| Pont-Vieux | 旧桥 | 偶遇勒格朗丹处 |
| prie-Dieu | 祈祷跪凳 |  |
| Prosper | 普罗斯佩 | 布耶伯夫夫人园丁之兄 |
| Pupin | 皮潘 | M. Pupin 及其女儿，在茹伊寄宿 |
| Pâques | 复活节 | semaine de Pâques→复活节周 |
| Pépin l'Insensé | 疯子丕平 | 神甫地名词源段 |
| Racine | 拉辛 |  |
| Radulfi villa | Radulfi villa | 拉丁词源，保留原文不译（鲁维尔/鲁森维尔；源文作 *Radulfi* *villa*） |
| Rapin | 拉潘 | 药剂师 |
| Reims | 兰斯 | 斯万妻女同去兰斯 |
| riz à l'Impératrice | 皇后式米羹 |  |
| Rogations | 祈求节 |  |
| Rome | 罗马 |  |
| Roussainville | 鲁森维尔 | Roussainville-le-Pin 鲁森维尔-勒潘 的裸用形式 |
| Rouville | 鲁维尔 | 词源 *Radulfi villa*，即鲁森维尔（Roussainville）古形 |
| rue de l'Oiseau | 鸟街 |  |
| rue de la Cure | 本堂神父宅街 | 敲打声出处（卡缪杂货店方向） |
| rue Saint-Hilaire | 圣伊莱尔街 |  |
| rue Saint-Jacques | 圣雅克街 | 贡布雷的街，非巴黎圣雅克街 |
| Révolution | 大革命 | 勒格朗丹恨未把贵族全送上断头台 |
| saint Hilaire | 圣伊莱尔 | 圣人本身；黄衣女士即他！ |
| saint Louis | 圣路易 |  |
| saint Paul | 圣保罗 | 「不可赦之罪」讥语出处 |
| saint Éloi | 圣埃卢瓦 | 金十字架；神甫玩笑：欧拉莉在勃艮第讹变为圣埃卢瓦 |
| Saint-André-des-Champs | 圣安德烈-德尚 | 双钟楼乡村教堂（梅塞格利丝那边） |
| Saint-Assise-lès-Combray | 圣塔西斯莱贡布雷 | 护城河与维沃纳河隔树幕 |
| Saint-Augustin | 圣奥古斯丁 | 教堂圆顶（dôme）比较语境 |
| Saint-Esprit | 圣灵 | rue du/de Saint-Esprit→圣灵街 |
| Saint-Hilaire | 圣伊莱尔 | 圣人/教堂/街名成分；église Saint-Hilaire→圣伊莱尔教堂 |
| Saint-Marc | 圣马可 | 门廊（portail）比较语境 |
| Sainte-Hildegarde | 圣伊尔德加德 | rue Sainte-Hildegarde→圣伊尔德加德街 |
| Saintine | 圣蒂纳 | 提及作家 |
| Salomon | 所罗门 |  |
| salut | 圣体降福 | le salut（教堂降福礼），«Voilà le salut passé!»；一般 salut=致意/救助，依语境 |
| sancta Eulalia | sancta Eulalia | 拉丁词源，保留原语言于强调内不译（源文作 *sancta* *Eulalia*） |
| sanctus Hilarius | sanctus Hilarius | 拉丁词源，保留原语言于强调内不译（圣伊莱尔拉丁名） |
| Sauton | 索东 | M^me^ Sauton→索东夫人，其子退伍；与神甫预告「旅行者」 |
| Sazerin | 萨士林 | M^me^ Sazerin→萨士林夫人，欧拉莉的顽固误记（原文玩笑），与萨士拉夫人（Sazerat）一字之差，勿混 |
| Sens | 桑斯 | 雕像比较语境 |
| Shakespeare | 莎士比亚 |  |
| Sigebert | 西吉贝尔 | 其小孙女墓石上的贝壳压痕（signe） |
| suisse | 教堂侍卫 | 教堂执杖侍卫，非瑞士人 |
| Testament de César Girodot | 《塞萨尔·吉罗多遗嘱》 | le Testament de César Girodot（法兰西剧院剧目） |
| Theodeberciacus | Theodeberciacus | 拉丁词源，保留原文不译（蒂贝尔齐） |
| Thiberzy | 蒂贝尔齐 | 词源 *Theodeberciacus*（保留拉丁原文于强调内） |
| Thiron | 蒂隆 | 演员（排序段） |
| Théodebert | 泰奥德贝尔 | 词源 *Theodeberciacus*→蒂贝尔齐 |
| Théâtre-Français | 法兰西剧院 |  |
| Vaulabelle | 沃拉贝勒 | 提及人物 |
| Verneuil | 韦尔讷伊 |  |
| Versailles | 凡尔赛 |  |
| Vertu | 德 | 乔托寓言拟人；一般=美德/贞洁，依语境 |
| Vertus | 诸德 | les Vertus et les Vices de Padoue→帕多瓦的诸德与诸恶（乔托寓言画） |
| Vices | 诸恶 | 同上 |
| Vichy | 维希 | eau de Vichy→维希矿泉水；Vichy-Célestins→维希-塞莱斯廷（药水瓶） |
| Victor Hugo | 维克多·雨果 |  |
| Vierge | 圣母 | fils de la Vierge→游丝（圣母发丝）；statuette→圣母小像 |
| Vieuxvicq | 维约维克 |  |
| Vinci | 芬奇 | le chef-d'œuvre de Vinci→芬奇的杰作，即《最后的晚餐》 |
| Viollet-le-Duc | 维奥莱-勒-杜克 |  |
| Vivonne | 维沃纳河 | 裸用形式；la Vivonne 同 |
| Vénus | 维纳斯 | 厨房=维纳斯小庙 |
| Vérité | 真理 | 乔托寓言拟人 |
| Vêpres | 晚祷 |  |
| Ylie | 伊利 | 圣伊莱尔地名讹变之三 |
| élévation | 举扬圣体 | 弥撒中；一般=提升，依语境 |
