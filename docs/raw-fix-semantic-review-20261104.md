# raw-fix 相对 main 的法语原文语义变化审查

> 审查：2026-11-04。基线 `main`：`074a7b34cd7c10e7274139f9b81a6bcc46d94e32`；目标分支审查快照：`158b6962e851edc001df9adec68050caf030b9e2`。这是一份**语义差异清单**，不代表已核定哪个法语版本更可靠。

## 范围和判定方法

仓库内没有 `docs/chapter-map.json`；实际映射在 [`docs/chapter-map.md`](./chapter-map.md)。据此将法语 `raw-md/vol{x}/chapters/00y.md` 对应到中文 `polish/dev/chapters/polished-vol{x}-y.md`。比较 `main...codex/raw-fix` 的 **29 个法语正文文件，275 个修改行对**；对 GitHub 未给完整补丁的文件另取两版全文，逐行比较。下方链接为**法语文件行号**；中法并非逐行严格对齐。

纳入否定、条件、时态、主体/指代、态度、具体动作、专名、引文、双关等会改变读者理解的差异；一般拼写、重音、性数一致、纯排版变化未纳入。**部分条目属于原文病句修复，原中文可能早已按正确含义翻译**。

## 需要关注的语义变化（按章节排列）

| 法语位置 | `main` → `codex/raw-fix` | 意义变化 |
| --- | --- | --- |
| [vol1-2 L17](../raw-md/vol1/chapters/002.md#L17) | `ressemblerait` → `ressemblait` | 条件式改未完成过去时：是否“将会像祖母”与“像祖母”的时间/语气有别。 |
| [vol1-2 L145](../raw-md/vol1/chapters/002.md#L145) | 添加 `lui` | 明确是向该女子使用“夫人/小姐”的称呼。 |
| [vol1-3 L5](../raw-md/vol1/chapters/003.md#L5) | 添加 `volontairement` | 她断绝关系的行为增加“主动/自愿”的限定。 |
| [vol2-1 L71](../raw-md/vol2/chapters/001.md#L71) | `a fait défaut` → `fait défaut` | 过去事件转现在时，时间指向改变。 |
| [vol2-1 L85](../raw-md/vol2/chapters/001.md#L85) | `choc.` → `choc ?` | 陈述转问句，人物话语语气改变。 |
| [vol2-1 L267](../raw-md/vol2/chapters/001.md#L267) | `n'avait voulu` → `n'avait pas voulu` | **增否定**：萨尼埃特不愿让晚餐在没逗人笑之前结束。 |
| [vol2-1 L561](../raw-md/vol2/chapters/001.md#L561) | `qu'elle avait rencontré` → `qu'il avait rencontré` | **行动者变化**：由“她遇见夏吕斯”变“他（斯万）遇见夏吕斯”。 |
| [vol2-1 L691](../raw-md/vol2/chapters/001.md#L691) | `dépit` → `débit` | **意义改变**：从“赌气/懊恼”变成“吐字/说话腔调”。 |
| [vol2-1 L791](../raw-md/vol2/chapters/001.md#L791) | `créations cutanées` → `réactions cutanées` | 从皮肤“创造”变成皮肤“反应”，感官细节发生变化。 |
| [vol2-1 L813](../raw-md/vol2/chapters/001.md#L813) | `ce mot` → `ces mots` | 从一个词变成若干词语。 |
| [vol2-1 L841](../raw-md/vol2/chapters/001.md#L841) | `récréer` → `recréer` | 从“消遣、使愉悦”变为“重新形成/创造”，动词义改变。 |
| [vol2-2 L27](../raw-md/vol2/chapters/002.md#L27) | `j'avais été` → `j'aurais été` | 过去事实转反事实条件（“我本会成为另一种人”）。 |
| [vol2-2 L69](../raw-md/vol2/chapters/002.md#L69) | `oppressées` → `opposées` | 从“受压抑”变为“相反”，品质关系不同。 |
| [vol3-1 L195](../raw-md/vol3/chapters/001.md#L195) | `Monsieur Legrand` → `Monsieur Legrandin` | 人名发生变化，恢复特定人物勒格朗丹。 |
| [vol3-1 L323](../raw-md/vol3/chapters/001.md#L323) | `remplacer ce vide` → `remplir ce vide` | “代替空缺”转为“填满空缺”，动作不同。 |
| [vol3-1 L509](../raw-md/vol3/chapters/001.md#L509) | `œuvre utile` → `œuvre inutile` | **评价反转**：永远放弃美与幸福，从“有用的事”变成“无益的事”。 |
| [vol3-1 L545](../raw-md/vol3/chapters/001.md#L545) | `nous pouvons` → `nous ne pouvons` | **增否定**：“我们能离开她”变成“我们不能离开她”。 |
| [vol4-1 L7](../raw-md/vol4/chapters/001.md#L7) | `présentais` → `représentais` | 从“呈现”转为心中的“想象、表象”，心理动作有别。 |
| [vol4-1 L179](../raw-md/vol4/chapters/001.md#L179) | `auprès` → `après` | 从“在彼此身旁”转为“一个接一个”，关系类型改变。 |
| [vol4-1 L339](../raw-md/vol4/chapters/001.md#L339) | `je pus` → `je ne pus` | **增否定**：从“能够唤回”变“无法唤回”记忆。 |
| [vol4-1 L427](../raw-md/vol4/chapters/001.md#L427) | `investi / investis` → `inverti / invertis` | 对象转为当时性学话语中的“性倒错者/同类”。 |
| [vol4-1 L427](../raw-md/vol4/chapters/001.md#L427) | `inversibilité` → `invisibilité` | 从“可逆性”变为“不可见/隐匿”，比喻不同。 |
| [vol4-1 L439](../raw-md/vol4/chapters/001.md#L439) | `faire le dîner` → `faire remettre le dîner` | **动作变化**：变成“推迟晚餐”，不只是准备晚餐。 |
| [vol5-1 L35](../raw-md/vol5/chapters/001.md#L35) | `l'apercevant` → `les apercevant` | 所见对象由单数变复数。 |
| [vol5-1 L59](../raw-md/vol5/chapters/001.md#L59) | `n'est` → `n'était` | 时态从现在变过去。 |
| [vol5-1 L143](../raw-md/vol5/chapters/001.md#L143) | `appâts` → `appas` | 由“诱饵”转为文学语汇“魅力/姿色”。 |
| [vol5-1 L149](../raw-md/vol5/chapters/001.md#L149) | `comme` → `comment` | “如同”改成“如何”，问法不同。 |
| [vol5-1 L265](../raw-md/vol5/chapters/001.md#L265) | 增 `n'`：`n'attend que` | 限制结构“仅仅期待”，与旧文的期待范围有别。 |
| [vol5-1 L267](../raw-md/vol5/chapters/001.md#L267) | `son mobile` → `mon mobile` | **归属改变**：动机从“他的”改为叙述者“我的”。 |
| [vol5-1 L287](../raw-md/vol5/chapters/001.md#L287) | `chargeant` → `changeant` | 从“负载”变为“改变”帽子倾斜角度。 |
| [vol5-1 L329](../raw-md/vol5/chapters/001.md#L329) | `cheveux` → `chevaux` | **对象变化**：从“头发”变为“马匹”。 |
| [vol5-1 L345](../raw-md/vol5/chapters/001.md#L345) | `pensa-t-elle` → `pensait-elle` | 完成事件转过去持续/习惯的思考。 |
| [vol5-1 L359](../raw-md/vol5/chapters/001.md#L359) | `disait Albertine` → `disait Andrée` | **说话人变化**：阿尔贝蒂娜变成安德蕾。 |
| [vol5-1 L395](../raw-md/vol5/chapters/001.md#L395) | `s'incorporer à moi` → `s'incorporer en moi` | 从附着于我转为融入我之内，隐喻有所调整。 |
| [vol5-1 L423](../raw-md/vol5/chapters/001.md#L423) | `bienveillance` → `malveillance` | **评价反转**：从“善意”变为“恶意”。 |
| [vol5-1 L435](../raw-md/vol5/chapters/001.md#L435) | `couleurs ... eues` → `couleurs ... vues` | 从“曾拥有的颜色”变成“曾看见的颜色”。 |
| [vol6-1 L733](../raw-md/vol6/chapters/001.md#L733) | `douter` → `douer` | **动词反转**：从“怀疑其审美性”变成“赋予它审美性”。 |
| [vol7-1 L637](../raw-md/vol7/chapters/001.md#L637) | `elle` → `elles` | 感到钦佩的主体由单数转两位女性。 |
| [vol8-1 L217](../raw-md/vol8/chapters/001.md#L217) | `qu'ils` → `qu'il` | 离开情妇的主体从复数改为单数的盖尔芒特先生。 |
| [vol8-1 L233](../raw-md/vol8/chapters/001.md#L233) | `Maçon` → `Mâcon` | “泥瓦匠/误拼”变法国城市马孔，主教所在地明确。 |
| [vol9-1 L33](../raw-md/vol9/chapters/001.md#L33) | `installée` → `intaillée` | 瞳孔里的轮廓从“安置”改为“刻入”，意象改变。 |
| [vol9-1 L37](../raw-md/vol9/chapters/001.md#L37) | `ne sera par` → `ne sera pas` | **否定明确**：不会是去找女人。 |
| [vol9-4 L17](../raw-md/vol9/chapters/004.md#L17) | `Champagne` → `champagne` | 可能由香槟地区转为香槟酒行业，职业指涉变化。 |
| [vol10-1 L29](../raw-md/vol10/chapters/001.md#L29) | `Fouillé` → `Pouillé` | 变为教会名录/俸禄登记簿 *pouillé*，文献类型明确。 |
| [vol10-2 L91](../raw-md/vol10/chapters/002.md#L91) | `γυωθι σεαυτου` → `γνωθι σεαυτον` | 恢复希腊文“认识你自己”的格言引用。 |
| [vol11-1 L321](../raw-md/vol11/chapters/001.md#L321) | `M^lle^ Verdurin` → `M^me^ Verdurin` | 称谓从小姐变夫人。 |
| [vol12-2 L25](../raw-md/vol12/chapters/002.md#L25) | 添加 `plus` | 新增“更……得多”的比较结构。 |
| [vol12-2 L91](../raw-md/vol12/chapters/002.md#L91) | `ne n'avait` → `ne m'avait` | 明确“阿尔贝蒂娜没有**告诉我**”，增受话者。 |
| [vol13-1 L31](../raw-md/vol13/chapters/001.md#L31) | `ma photographie` → `sa photographie` | **所有者变更**：照片由“我的”改为“她的”（阿尔贝蒂娜的）。 |
| [vol13-1 L31](../raw-md/vol13/chapters/001.md#L31) | `constance` → `constante` | 由“恒常性”改为“常数”，延续代数隐喻。 |
| [vol13-1 L33](../raw-md/vol13/chapters/001.md#L33) | `assez` → `aussi` | 由模糊程度变成“和恐惧同样有效”的比较。 |
| [vol13-1 L95](../raw-md/vol13/chapters/001.md#L95) | `lui` → `leur` | 受益对象从单数改为复数，须核对回指。 |
| [vol13-1 L107](../raw-md/vol13/chapters/001.md#L107) | 新增 `sur l'escalier` | 等待圣卢的地点明确为楼梯上。 |
| [vol13-1 L189](../raw-md/vol13/chapters/001.md#L189) | `ne n'a` → `ne m'a` | 恢复“没有再**对我**说”的宾语。 |
| [vol13-1 L197](../raw-md/vol13/chapters/001.md#L197) | `qui ne reliait` → `qui me reliait` | **关系变化**：“间接把我同阿尔贝蒂娜连接起来”。 |
| [vol13-2 L7](../raw-md/vol13/chapters/002.md#L7) | `s'il` → `si l'on` | 从某个“他”转为泛指任何人。 |
| [vol13-3 L111](../raw-md/vol13/chapters/003.md#L111) | `toi générale` → `loi générale` | 由“你”变为“（遗忘的）一般规律”。 |
| [vol13-3 L129](../raw-md/vol13/chapters/003.md#L129) | `sole moi` → `sole mio`（另见131、133行） | **词义/双关风险**：法语“我”改意大利语“我的”，可能抹去有意的双语写法。 |
| [vol13-4 L15](../raw-md/vol13/chapters/004.md#L15) | `M^lle^ de Marsantes` → `M^me^ de Marsantes` | 圣卢母亲的称谓从小姐变夫人。 |
| [vol15-1 L305](../raw-md/vol15/chapters/001.md#L305) | `quelques esquissés` → `quelques esquisses` | 原本不通顺的分词改为名词“几幅草图”。 |

## 已确认的中文稿/注释冲突

以下是对映射后的中文开发稿作的实质抽查，不意味着其余条目都已判定译错：

1. [vol2-1 中文稿](../polish/dev/chapters/polished-vol2-1.md)：法语 L561 的 `qu'elle → qu'il` 已改行动者，中文仍是“**她碰见他正往她家去**”，应重新核对究竟谁遇见夏吕斯。
2. [vol2-1 中文稿](../polish/dev/chapters/polished-vol2-1.md)：法语 L691 改成 `débit`，中文仍说“**这点赌气的小做作**”，与“说话方式/吐字”不符。
3. [vol3-1 中文稿](../polish/dev/chapters/polished-vol3-1.md)：法语 L509 从 `utile` 变 `inutile`，中文仍说“**反倒算是做了一件有用的事**”，评价完全相反。
4. [vol5-1 中文稿](../polish/dev/chapters/polished-vol5-1.md)：法语 L423 从 `bienveillance` 变 `malveillance`，中文仍说“**带着好意**”，与“恶意”相反。
5. **[vol13-3 中文注释](../polish/dev/chapters/polished-vol13-3.md)**：当前注释说《我的太阳》的法语底本中 `sole mio` 和 `sole moi` 两种写法并存，并解释双关。实测 `main` 为 `sole moi` **3 处**、`sole mio` **4 处**；`codex/raw-fix` 则为 `sole mio` **7 处、`sole moi` 0 处**。该注释与新分支不一致。尤其要先核权威版本：若 *moi* 是作者有意混写，统一为 *mio* 可能抹去修辞含义；若是电子底本讹误，则应调整中文注释。

相反，部分中文稿本来就按修复后的合理意思翻译，例如 vol2-1 L267 的“不愿让这顿饭……结束”、vol2-2 L69 的“恰恰相反”、vol13-3 L111 的“遗忘这一规律”，**不能仅凭法语差异直接判中文错误**。

## 复核次序

优先核对**否定/事实反转**（vol3-1 L509、L545；vol4-1 L339；vol5-1 L423）、**说话人和指代**（vol2-1 L561；vol5-1 L267、L359；vol13-1 L31、L197）、**跨语言双关与注释**（vol13-3 L129–133）。再用权威法语版本核对旧版是否本来是 OCR/排印错误，避免把原文修复直接当成译文必须改动的证据。

本报告**仅记录差异**，未修改法语正文、中文译文、注释，未创建 PR/MR。共有 **60 条**待注意的差异（部分同一行分为多个条目）。
