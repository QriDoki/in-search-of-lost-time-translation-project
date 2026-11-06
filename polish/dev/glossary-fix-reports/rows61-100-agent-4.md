# 第61—100行正文语义修订报告：Agent 4

日期：2026-11-03。按 [章节映射](../../../docs/chapter-map.md) 对照vol10-2、vol10-3、vol11-1、vol11-2、vol12-1、vol12-2的法文原文。范围为风险表第61—100行，共40行108个原始键。

完成 **2条修订记录，涉及2个正文文件**；其中第二条同时修正随文注。未改术语表、原文和前60行报告，前轮已暂存正文修订完整保留。

## 已实施修改

### 1. 表第100行；vol12-1
- 译文：`polish/dev/chapters/polished-vol12-1.md:71`；原文：`raw-md/vol12/chapters/001.md:73`。
- 原文：`par mon grand-père les Verdurin savaient qui était l’oncle de Morel`。
- 修改前：维尔迪兰夫妇通过我祖父，早就知道莫雷尔的舅舅是谁
- 修改后：维尔迪兰夫妇通过我外祖父，早就知道莫雷尔的舅舅是谁
- 理由：mon grand-père仍为叙述者的外祖父：本章第97行追忆同一长辈饮白兰地与外祖母劝止，vol10-2原文第63行又明说母亲是此人的女儿。此处不能改换为父系祖父。

### 2. 表第93行；vol12-2
- 译文：`polish/dev/chapters/polished-vol12-2.md:17`；原文：`raw-md/vol12/chapters/002.md:19`。
- 原文：`ou, par un petit bleu, de me demander d’aller la voir à Auteuil`。
- 修改前：⊂蓝皮电报⊃≼🔤原文 petit bleu，法国旧时邮局内部传递的蓝色电报或电信通知，不必理解为蓝色外皮的普通电报≽
- 修改后：⊂蓝纸快信⊃≼🔤原文 petit bleu，指当时以气压管道传送的蓝纸快信≽
- 理由：此处是巴黎市内邀约所用的快捷信件。法兰西学院词典第八版bleu条将petit bleu明确释为蓝色气压邮件；与本篇pneumatique所指邮件相合。同步修正原注把它坐实为电报的说明。

第二处词义核验使用 Firecrawl 检索法兰西学院词典：[第八版 bleu 条](https://www.dictionnaire-academie.fr/article/A8B0910)将 `petit bleu` 释为蓝色的气压邮件。这支持将此处邀约信件译为蓝纸快信；没有把所有蓝色电信通知一概改成气压邮件。

## 40行定位覆盖与处置

数字是去掉Markdown标题后、不区分大小写的词形候选数，包含常见规则复数与部分屈折形。括号标签仅用于定位，并不解除义项限制；第71行只统计教士会相关表达，第72行只统计ordres religieux/Ordre de Malte。第96行各裸词候选仍须依其指定义项判断，不能自动下发译法。savoir扩展部分常用变位；veiller的定位数包含需排除的veille前夕/清醒状态同形，不是全部计作动词。数字不等于逐例精校完成数。

| 行 | 原始键 | vol10-2 | vol10-3 | vol11-1 | vol11-2 | vol12-1 | vol12-2 | 核查结果 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 61 | `octroi` | 0 | 0 | 0 | 0 | 0 | 0 | 未检出定位词形。 |
| 62 | `cachet` | 4 | 0 | 0 | 0 | 0 | 0 | 药片、封蜡印章已分义；未套诊金封。 |
| 63 | `remise` | 1 | 0 | 1 | 1 | 3 | 1 | 马车房与放回、推迟等动词形已区别。 |
| 64 | `quartier`；`quartiers`；`quartiers de noblesse` | 1 | 0 | 14 | 0 | 1 | 1 | 果瓣、营房、街区已有区别；Trois-Quartiers作商店专名。 |
| 65 | `garde` | 3 | 0 | 3 | 0 | 5 | 2 | 看管、保镖、警惕、守住等义已分流。 |
| 66 | `contrôleur` | 1 | 0 | 0 | 0 | 0 | 0 | 列车检票职务符合场景。 |
| 67 | `ordonnance` | 0 | 0 | 0 | 0 | 0 | 0 | 未检出定位词形。 |
| 68 | `engagé`；`l'ancien` | 1 | 0 | 2 | 0 | 7 | 4 | 受雇、深涉、投身等动词形不套志愿兵；ancien复核按具体前任/往昔关系。 |
| 69 | `équipage`；`voiturier` | 0 | 0 | 0 | 0 | 1 | 1 | 贵族车马配置义成立；未检出voiturier。 |
| 70 | `avant-scène`；`avantscène`；`balcon`；`parterre` | 0 | 0 | 1 | 1 | 0 | 0 | 阳台、俱乐部阳台已区别剧场座席；未检出其他列词。 |
| 71 | `chapitre (abbaye)` | 0 | 0 | 0 | 0 | 0 | 0 | 未见修道院教士会义；章节与论题义不得套教士会。 |
| 72 | `ordre (religieux)` | 2 | 0 | 0 | 0 | 0 | 0 | 马耳他修会及ordres religieux按宗教义核查；其余命令/秩序不属此限定。 |
| 73 | `étude`；`emploi` | 4 | 2 | 3 | 0 | 4 | 1 | 医学学习、研究、绘画习作与时间安排、使用、戏剧角色已有区别。 |
| 74 | `matérialisation`；`cristallisation` | 1 | 0 | 1 | 0 | 0 | 1 | 城市的具体呈现及思想在肉体的凝结不套招魂显形。 |
| 75 | `impuissance` | 0 | 0 | 1 | 0 | 0 | 0 | 取悦/满足对方的无力状态，未发现误套人物错词。 |
| 76 | `savoir`；`Savoir` | 113 | 19 | 193 | 10 | 169 | 106 | 知识拟人化、求知、知道、会做等已有分流；对saurait等条件式补查，未发现机械想必会。 |
| 77 | `défaite` | 0 | 0 | 0 | 0 | 0 | 1 | 假分手的战败/退败比喻已处理为失败义。 |
| 78 | `batterie` | 0 | 0 | 0 | 0 | 0 | 0 | 未检出定位词形。 |
| 79 | `mobile` | 0 | 0 | 3 | 0 | 2 | 1 | 动机、浮动、活动布景等已分义，未套国民别动队。 |
| 80 | `citation`；`révision`；`révisionniste`；`révisionnisme`；`antirévisionnisme`；`antirévisionniste` | 4 | 0 | 4 | 0 | 4 | 0 | 希腊/拉丁引文、塞维涅夫人引语与德雷福斯案重审/死后翻案比喻已分义。 |
| 81 | `réformer`；`raid`；`torpille` | 0 | 0 | 1 | 0 | 0 | 0 | 未检出列词；raide非raid，不计作突袭。 |
| 82 | `front`；`arrière`；`première ligne` | 2 | 1 | 9 | 0 | 13 | 3 | 额头、面孔/正面、退后等普通义已区别军事位置。 |
| 83 | `barrage`；`projecteur`；`alerte`；`sirène` | 2 | 0 | 0 | 0 | 0 | 0 | alerte形容精神振作/站立活动，未套空袭警报；其余未检出。 |
| 84 | `permission`；`permissionnaire`；`perme` | 3 | 0 | 3 | 0 | 0 | 1 | 莫雷尔军人休假与请求许可各有上下文，未混同。 |
| 85 | `cellule` | 1 | 0 | 0 | 0 | 0 | 0 | 彼此分隔的日子所围成的牢房比喻已有分义。 |
| 86 | `attaque`；`congestion`；`quinte`；`vaisseau`；`piqûre`；`veiller` | 11 | 6 | 30 | 0 | 6 | 9 | 军事式攻击/中风/神经发作、船只与教堂厅身、刺痛比喻/注射及照看/守望均按场景核查。 |
| 87 | `coqueluche` | 3 | 0 | 1 | 0 | 0 | 0 | 电梯服务生实患百日咳及病后阵咳比喻属疾病义，保留。 |
| 88 | `médium` | 0 | 0 | 0 | 0 | 1 | 0 | 招魂者现译灵媒，保留。 |
| 89 | `motif`；`finale` | 4 | 0 | 7 | 1 | 8 | 6 | 普通理由、乐旨、音乐终曲及雕塑母题已分义。 |
| 90 | `boston`；`cotillon`；`piquet`；`écarté` | 0 | 0 | 2 | 0 | 3 | 3 | écarté牌戏与écarté排除/挪开的动词形有别，未误套。 |
| 91 | `tunique`；`habit`；`habit (vêtement)`；`robe princesse`；`capote`；`capeline` | 4 | 0 | 5 | 3 | 1 | 3 | 旧衣叫卖、礼服、车篷/放糕点于车篷均按场景；capeline原译呢料披帽已有歧义说明，未硬改宽檐帽。 |
| 92 | `caoutchouc`；`hermine`；`loutre`；`zibeline`；`chinchilla` | 0 | 0 | 3 | 0 | 0 | 0 | 紫貂皮大衣、绒鼠皮帽/便鞋均材料义；未见把动物材料互相套用。 |
| 93 | `tube`；`tube (pneumatique)`；`pneumatique`；`pneumatique (lettre)`；`petit bleu` | 0 | 0 | 1 | 0 | 3 | 1 | pneumatique为抽气机物件或气压快信分别保留；petit bleu改蓝纸快信，见修订2。 |
| 94 | `volant`；`double`；`fosse`；`mouche`；`capucin`；`capucines`；`coucou` | 8 | 0 | 10 | 0 | 8 | 2 | 方向盘、形容迅疾的飞行、二重/分身/副本、苍蝇等已有分义。 |
| 95 | `bergère`；`jardinière`；`trumeau`；`corniche` | 5 | 0 | 0 | 0 | 1 | 0 | Bergère街名不套扶手椅；trumeau物件/人物讥称、Corniche公路按所指保留。 |
| 96 | `glace (miroir)`；`glace (entremets)`；`flûtes (pain)`；`mules (chaussons)`；`polo (chapeau)`；`golf (jaquette de tricot)`；`voile (de bateau)` | 11 | 2 | 31 | 1 | 3 | 7 | 镜子、冰/冰糕、长面包/笛子、便鞋、马球帽、高尔夫运动/针织上衣、船帆分别辨别；不据裸词强改。 |
| 97 | `voile`；`toque`；`nécessaire` | 24 | 4 | 18 | 0 | 8 | 3 | 面纱与船帆/遮蔽比喻、无边小帽、梳妆盒及必要性形容词已有分义。 |
| 98 | `grelot`；`clochette`；`trois coups` | 0 | 0 | 0 | 0 | 0 | 1 | 三下铃为呼叫弗朗索瓦丝的信号；非戏院开场信号。 |
| 99 | `calicot`；`plumitif`；`poncif` | 0 | 0 | 0 | 0 | 0 | 0 | 未检出列词。 |
| 100 | `grand'mère`；`grand-père` | 11 | 18 | 14 | 0 | 6 | 12 | 叙述者外祖父一处误作祖父已改；安德蕾祖母父母系不明，见限制。 |

## 保留实例及限制

- `cachet`：vol10-2原文第19行是助眠药片，第41、103行是封蜡印章，现译已区别。
- `cellule`：vol10-2第45行是不同日子构成的囚室比喻，现译“牢房”正确。
- `vaisseau`：vol10-2第41行交错的船只、第77行教堂厅身，vol11-1第161、379行船只，未套血管。
- `piqûre`：自尊受刺、嫉妒刺痛和注射毒瘾的比喻分别保留；未以一个词形统一成医用注射。
- `savoir`：vol10-3第5行大写Savoir的求知拟人化保留；其他条件式/普通认识语句已查可疑片段，没有把它全局改成“想必会”。
- `médium`：vol12-1第59行是召来亡灵的灵媒，现译正确。
- `grand-père`：vol10-2第63行、vol12-1第99行现译“外祖父”正确，用于核实本轮修订1；夏吕斯及公爵夫人话语中的祖辈不自动改为外祖辈。
- 安德蕾的 `grand’mère`（vol12-2原文第91行三处）现译“外祖母”，本段没有足够证据重建父母系，未凭裸词擅改；同段假设女人拿祖父作借口的两处也保留已有中性常规说法。该亲属方向问题仍需跨章节谱系证据。
- `capeline de drap`（vol11-2原文第29行）已有“呢料披帽”与草帽叠置关系未明的注释，本轮保留，不把不确定服装史坐实。

本轮已检索全部40行并集中审读低频多义命中和中文高风险片段；高频savoir/前后方位/普通动词形未逐条列出全六章所有命中，报告不声称整篇逐字精校。规则变位检索及复合词边界可能漏计，0只说明该检索式未命中。

## 验证

- 每个旧片段仅匹配一次后作UTF-8字节替换。
- 使用本轮起点32章备份重放两条记录，负责六章全部与预期逐字节一致。
- 六章UTF-8严格解码、CRLF数量、段落行数及⊂⊃≼≽数量不变。
- 本轮只新增本报告/证据JSON，直接修改vol12-1及vol12-2。
