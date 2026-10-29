# Chunk 19 校对报告 (第 001 章)

## 术语审查
- 未发现术语表内的误译。`Françoise`→弗朗索瓦丝、`Mme de Guermantes`→盖尔芒特夫人、`Mme Sazerat`→萨士拉夫人、`Paris`→巴黎、`Versailles`→凡尔赛、`race`→血统，均与术语表一致。
- `doge`→「威尼斯总督」，通行译名，建议上游补入 glossary.json。
- `demoiselle de village`→「乡下小姐」：此处指乡绅/殷实农家出身、家道中落后出来帮佣的女儿，不是泛指村姑。译文保留「乡下小姐」并由后文「父母『是本乡本土的好人家』，却因家道中落」补足阶级底色，符合原意；建议术语表收录该词条并注明此义。
- `espèce`→「种类」，与 `race`→「血统」并列，保留萨士拉夫人把人当物种分类的生硬语气。原文 « Cette race, cette espèce » 引号已保留。
- `le Roi`（大写，指路易十四）→「国王」，未加「路易十四」限定，忠于原文的含蓄；L2 报告建议的「那位国王」未采用，因原文无指示词。

## 初译稿典型错误
- **语义偏移**：`un pouvoir dont la nature m'est toujours restée obscure` 初译「也许它并不神秘」，把「性质始终不明」误作「并不神秘」；改为「也许它并非超自然」（对应原文 `surnaturel`，与后文「心灵感应/烽火」的解释形成对照）。
- **逻辑连接词误用**：`Car divers autres purent entrer plus tard à mon service` 初译用「因为后来固然有……」，「固然」表让步，与原文因果不合；改为「因为后来虽有别人来伺候我……却照样……」，让 `n'en subissaient pas moins` 的转折落到「却」上。
- **比较结构失衡**：`aussi étrange que celle d'un pharaon ou d'un doge, et, bien plus que celle du Roi, la vie des courtisans` 初译「比国王的更甚」主语悬空；改为「而廷臣们的生活，比国王的还要离奇」，补出被比较项。
- **搭配生硬**：「她白皙的皮肤和通红的双手——处处都表明」中破折号前的并列项过长、指代不清；改为「她的感受方式，她既善良又富于怜悯、既严厉又高傲、既精明又狭隘，她那白皙的皮肤和通红的双手——在这一切里，她都显出是那种乡下小姐」，让 `elle était la demoiselle de village` 的判断落到「在这一切里」，避免中文破折号悬置。
- **词义**：`pitoyable` 初译「可怜」，此处为「易生怜悯、富于同情」，已改；`mettre en condition` 初译「送出去当佣人」，改为「送出去帮佣」，更贴合「受雇入宅」的旧时说法。
- **措辞**：「他们又把这话学给了弗朗索瓦丝」口语过白，改为「转述给了弗朗索瓦丝」；`battus`（饱经风霜、被岁月打磨）译「饱经风霜」，`traits rétractés` 译「皱缩」，保留。
- **句读**：`partagent les idées, les jurisprudences d'interprétation des domestiques` 初译「那套想法和解读人事的规矩」把 `jurisprudences`（判例、成规）泛化；改为「那套想法、那套解释人事的判例」，并以括号处理 `et à plus forte raison toute autre l'eût fait à sa place`，避免破折号与分号连用。
- **比喻的文化底色**：`Comme la vitrine d'un musée régional l'est par ces curieux ouvrages que les paysannes exécutent et passementent encore dans certaines provinces` 初译把 `passementent` 译「镶边」，偏指缝纫工艺的一环；改「缀饰」，并调整语序为「农妇们在某些省份至今仍在制作、缀饰的」，使中文顺畅。
- **主语衔接**：`Et elle savait y retracer comme avec des fils de couleur...` 的 `y` 回指上句「话语」；初译「她还能像用彩色丝线绣出来一般」丢失了回指，改为「她还能借着这些话，像用彩色丝线绣出一般」。

## 格式硬约束核对
1. 段落数：源文 1 段，译文 1 段，一致。
2. 本 chunk 无「——」起首的对话段；段内引语用中文双引号，已配对。
3. 全文零反引号，已核对。
4. 引号成对；无半角引号、无 ASCII 双连字符、无 ASCII 三点；破折号统一「——」。
5. 源文无斜体，无需处理。
6. 源文 `M^me^` 上标已作「夫人」，无上标符号残留。
7. 无脚注、无图片、无图注。
8. 本 chunk 无分节符。
9. 无出版机构信息。
10. 禁用译名（史万、黛奥特、科塔尔、邦当、韦尔迪兰、拉结、斯卡隆、波尔罗亚尔、海王星、虐待狂、亲王夫人、外婆、货栈、老鸨、贝拉斯克斯）均未出现。
11. 专名均按术语表；`doge` 为普通名词，未自造专名。
12. 正文无说明性文字、无标题。

## 给上游的提示（重要）
- **brief 的「本 chunk 特别提示」与源文不符**：提示称本 chunk 写「公爵夫人的冷淡已明确（他从仆役口中也间接得知）；随后转入他对这爱的不加掩饰的自我审判——爱里含着要她遭难、破产、堕落的愿望」。源文实际内容为：叙述者从弗朗索瓦丝的脸色察觉盖尔芒特夫人的厌烦、弗朗索瓦丝的性格来路、以及「仆人血统」的议论；**全无「要她遭难、破产、堕落」的自我审判**。L2 报告另提到 brief 曾称本 chunk 有圣卢出场与 `faire` 用法解释，同样不见于源文。已一律以源文为准，未补写任何情节。请上游核对 brief 的段落对应关系，避免后续 chunk 的提示串位。
- `épreuve négative` 译「底片」，取摄影义（负片），与前文「空缺／凸起」相互咬合的浮雕比喻衔接；若后续 chunk 沿用该比喻，建议统一作「底片」而非「反面印证」。
- 「凹槽／空缺／凸出部分」这组木工—军事混合比喻（`rentrant` / `lacunes` / `avancées`）建议在术语表中固化，避免后续译作「凹口／缺口／凸出」造成不一致。
- 本 chunk 修订两轮后收敛；未再改动的风格取舍：「萨士拉夫人」原话「这一血统，这一种类」保留短促重复的生硬感，未改为更口语的「这种人」；`le Roi` 未补「路易十四」。
