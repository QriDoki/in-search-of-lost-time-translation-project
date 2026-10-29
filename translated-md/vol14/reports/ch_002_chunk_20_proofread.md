# Chunk 20 校对报告 (第 002 章)

## 术语审查
- 术语表条目全部核对无误：夏吕斯先生（源文 M. de Charlus，本段 3 处，均为「夏吕斯先生」，未混用「男爵」形式）、福什维尔夫人、奥黛特、圣卢、信徒、fair play（保留英文加引号）、private→列兵、dominions→自治领、众议院（Chambre）、华沙（Varsovie）、科堡的斐迪南、威廉皇帝、沙皇、掠夺帝国（加引号）。
- 「盖尔芒特夫人」0 处，禁用旧译零出现；「亲王妃」「亲王夫人」本 chunk 未涉及。
- 表外专名处理（沿用初译，建议 L4 补入 glossary.json）：
  - `tommies` → 保留英文并加引号‘tommies’，与 fair play、dominions、private 同属奥黛特的英语炫耀，不译为「英国兵」（译出即失去其炫耀腔）。若补入，note 应写明「保留英文、加引号」。
  - `tortillard (de Balbec)` → 「巴尔贝克那列慢吞吞的小火车」。
  - `rapins` → 「画室学徒」。
  - `le cran` → 「胆气」；`le mordant` → 本次由初译「咬劲」改为「冲劲」（见下）。
  - `chevalier de Saint-Jean de Jérusalem` → 「耶路撒冷圣约翰骑士」。
  - `joueurs incorrects` → 「不守规矩的球员」，与 fair play 的体育隐喻一致，不作「作弊者」。

## 初译稿典型错误
- **误译/偏译**：`le mordant` 初译「咬劲」。原文 le mordant 在此与 le cran 并列，指（球场上）的锐气、狠劲，非字面「咬」。改为「冲劲」，保留两词在引号内的行话/俗语色彩。
- **语义偏移**：`si vous voulez que je vous le dise` 初译「如果您要我说出来」——原意是「如果您要我把话说白」，带一点被追问后的让步，改为「如果您要我跟您说」。
- **句式生硬**：`avec ses yeux le clignement des rapins employant un terme d'atelier` 初译「眼睛则像画室学徒用行话时那样挤一挤」，「挤一挤」口语过头且把 clignement（眨眼示意）误作挤眼动作，改为「眼睛则像用行话的画室学徒那样眨着」。
- **搭配/标点**：`entendre accuser tout le monde … par quelqu'un qui s'omettait lui-même` 初译整句以「而这个人自己却……」顺接，与前面「总归叫人不快」的收束黏连；改为分号断开，并把 `s'omettait lui-même de la catégorie` 明确为「把自己从……略去不提」（初译「从那个特殊类别里略去不提」缺主语指向）。
- **冗余**：`sur des faits vrais` 初译「建立在真实的事实之上」，「真实的」与「事实」语义重复，改为「依据的是真事」。
- **语序**：`il y a de fortes présomptions du même genre que pour Ferdinand de Cobourg à l'égard de l'Empereur Guillaume` 初译「对科堡的斐迪南与威廉皇帝之间，也存在同样强烈的推测」——「对……之间」不成句，改为「关于科堡的斐迪南与威廉皇帝之间……」。
- **冗余**：`ne se faisait pas faute de citer à tout propos` 初译「从不放过任何机会，随时引用」两重同义叠加，改为「动辄引用」。
- **虚词**：`Tout au plus associait-elle` 初译「最多」，改为「顶多」，与全段口语评述的调子一致。

## 引号残缺的处理（本 chunk 硬约束项）
- 源文末句 `« Mon gendre Saint-Loup … le plus humble « private ».` 外层引语只有开引号、无收引号（全段 « 比 » 多 1，原文如此）。初译在全段最末、即「……和最卑微的‘列兵’也同样称兄道弟。」之后补收引号，位置正确：该句是奥黛特引语的终点，段落在句号处结束，补在此处不吞并前文叙述、不跨段。
- 校对终稿保留此处理：末句为「“我的女婿圣卢……和最卑微的‘列兵’也同样称兄道弟。”」，外层 “” 成对，内嵌三层同形原文引号依次降为‘tommies’、‘自治领’、‘列兵’，符合 “ ”→‘ ’ 层级。
- 中段夏吕斯语 `« Comme il y a … l'alliance de la Bulgarie avec l'Allemagne. »` 引号本自足，译文以“……”整段包住，内嵌「掠夺帝国」用‘ ’，*姐妹* 保留斜体。全篇无「」『』、无 ASCII 引号、无负深度引号。

## 体例核对
- 段落数：1 个段落块，与资料袋第四节 P37 一致，未合并、未拆分。
- 零容忍项：反引号 0、图片 0、`[待定]` 0、HTML 注释 0、ASCII 引号 0、ASCII `--` 与 `...` 0、NBSP 0、脚注标记 0。
- 禁项：无出版机构/电子书来源信息。
- 斜体：*姐妹* 保留；其余无斜体，未自行添加。
- `« Dame »` 译「可不是」，`« Si, j'estime… »` 译「能的，我还是认为……」，均按 L2 提示处理，未误作条件连词或「夫人」。

## 对后续章节的建议
- 本卷奥黛特的英语炫耀链（fair play / tommies / dominions / private）建议在 glossary.json 中成组收录，统一「保留英文原形并加引号」的处理，避免后续 chunk 出现「英国兵」「自治领居民」之类译出而失腔的变体。
- `le cran` / `le mordant` 这类带引号的俗语/球场行话，宜统一译作「胆气」「冲劲」，不作字面直译。
- 源文 « » 计数不平衡处（本 chunk 末句）固定按「语义终点补收引号」处理，建议写入全章体例备忘，供后续 chunk 校对者一致执行。
