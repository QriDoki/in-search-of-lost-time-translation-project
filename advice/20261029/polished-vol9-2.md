# vol9-2 法中逐句错译／漏译核查报告

- 核查日期：2026-10-29
- 仓库：`QriDoki/in-search-of-lost-time-translation-project`
- 核查及提交分支：`polish-20261029`
- 章节：第二部第一章「社交界的夏吕斯」（*Deuxième partie — Chapitre premier*）

## 对照文件及核查范围

- 法语原文：[`raw-md/vol9/chapters/002.md`](../../raw-md/vol9/chapters/002.md)，核查时 blob SHA：`7b7d9ffe8e7d56f084fd4ffda9ff6ea07006e7f3`。
- 中文译文：[`polish/dev/chapters/polished-vol9-2.md`](../../polish/dev/chapters/polished-vol9-2.md)，核查时 blob SHA：`de0a02dffb48497c80a4a0c7ec95ddb55b065971`。
- 映射情况：指定的 `polish/dev/chapter-map.md` 在 `main` 和 `polish-20261029` 均未找到；以两文件的章节标题、完整正文及顺序对应关系确认本次映射，**不声称读取过不存在的映射文件**。
- 核查范围：两文件正文全章，法文标题及章纲之后的 **160 个自然段**，与中文标题之后 **160 个自然段**对应。逐段对照叙述、对话及长句的主客体、事件对象、代词指向、否定与因果关系。

## 收录原则

**只报告能够从法语原文及上下文直接确证、足以改变所述事实、人物或思想关系的错译／实质性漏译。** 不收录合法异译、文风偏好或仅值得商榷的措辞。以下按语义影响程度排列；建议译法仅修复已确认的错误，不要求照抄。

## 确证错译（4 条）

### 1. 社交人情的债权人与债务人倒置

- **位置**：法语及中文[第 55 行](../../raw-md/vol9/chapters/002.md#L55)；[译文第 55 行](../../polish/dev/chapters/polished-vol9-2.md#L55)（苏夫雷夫人假意为「我」引见）。
- **法文**：« de paraître à la fois aux yeux du solliciteur le recommander, et aux yeux du haut personnage ne pas recommander ce solliciteur, de manière que ce geste à double sens lui ouvrait **un crédit de reconnaissance envers ce dernier sans lui créer aucun débit vis-à-vis de l'autre**. »
- **现译**：「这样，她**既让那位显贵欠自己一分情，又无须真的对求助者付出什么**。」
- **确证依据**：`ce dernier` 承接最近的 `ce solliciteur`（求情者），`l'autre` 则指另一方，即被求助的显贵。苏夫雷夫人使**求情者以为受了她的举荐，从而欠她人情**；与此同时，显贵看出她并未真正举荐，故她**不必向显贵支出人情资本**。现译却写成显贵欠她人情、她不必对求情者付出，交换双方被颠倒，破坏紧接着的「假举荐」情节及讽刺逻辑。
- **建议**：「这样一来，她既能让求情者觉得欠了她一分人情，又不必在那位显贵面前真正欠下一笔人情债。」

### 2. “没有想过三分钟”错变成“有三分钟没想”

- **位置**：[法语第 319 行](../../raw-md/vol9/chapters/002.md#L319)；[译文第 319 行](../../polish/dev/chapters/polished-vol9-2.md#L319)（等待阿尔贝蒂娜）。
- **法文**：« C'était bien de l'inquiétude pour cette Albertine **à laquelle je n'avais pas pensé trois minutes pendant la soirée Guermantes** ! »
- **现译**：「这确实是为阿尔贝蒂娜而起的焦虑，而在盖尔芒特府的晚会上，**我有三分钟压根儿没想到她**！」
- **确证依据**：否定式 `ne ... pas pensé trois minutes` 是**整场晚会中想起她的时间连三分钟也不到**，不是整场晚会里仅有三分钟没有想到她。现译把叙述者在社交晚会中几乎忘记她、回家却因等待而焦虑的强烈心理反差颠倒了。
- **建议**：「这可真是为了阿尔贝蒂娜而生的焦虑——方才在盖尔芒特家的晚会上，**我连三分钟都没有想起过她**！」

### 3. 把聚会中“办砸的事情”误作“第二流的人物”，并错移夸大对象

- **位置**：[法语第 179 行](../../raw-md/vol9/chapters/002.md#L179)；[译文第 179 行](../../polish/dev/chapters/polished-vol9-2.md#L179)（弗罗贝维尔对次日园游会的期待）。
- **法文**：« Il aurait le plaisir d'y voir tant **d'élégances** ! le plaisir plus grand d'y constater **certaines choses ratées**, et surtout celui de pouvoir longtemps se vanter d'avoir frayé avec **les premières** et, **en les exagérant ou en les inventant, de déplorer les secondes**. »
- **现译**：「……事后还可以长久吹嘘自己与第一流人物有过往来，**再把这些往来添油加醋，甚至凭空编造，同时为第二流的人物惋惜不已**。」
- **确证依据**：`les premières` 指前面的 `élégances`（风雅人士／体面排场），`les secondes` 指 `choses ratées`（聚会上失败或出丑的事情），**并非“第二流的人物”**。`en les exagérant ou en les inventant` 修饰他如何描述这些失败之事，**并非把与体面人物的往来夸大或捏造**。现译同时错置了名词指向与动作对象。
- **建议**：「最大的乐事则是日后能够长久吹嘘自己同那些体面人物有过往来，并把聚会中种种办砸的事添油加醋，甚至凭空编造出来，大加惋惜。」

### 4. 将奥尔维利耶夫人误认作另一位奥尔热维尔女子

- **位置**：[法语第 299 行](../../raw-md/vol9/chapters/002.md#L299)；[译文第 299 行](../../polish/dev/chapters/polished-vol9-2.md#L299)。
- **法文**：« Je demandai si **M^me^ d'Orvillers** n'était pas un peu légère. »
- **现译**：「我问**奥尔热维尔夫人**是不是有点轻浮。」
- **确证依据**：`d'Orvillers` 是同章前面出场、已经正确译成**奥尔维利耶亲王妃**的女子（[法语与译文第 293 行](../../polish/dev/chapters/polished-vol9-2.md#L293)）；而 `d'Orgeville` 是圣卢此前另提到的**奥尔热维尔家的年轻姑娘**（[译文第 197 行](../../polish/dev/chapters/polished-vol9-2.md#L197)），二者绝非同一人。现译混淆两个人物，且把本应针对亲王妃的询问误导到另一位女性。
- **建议**：「我问奥尔维利耶夫人是不是有点轻浮。」

## 核查结论

本轮核查确认以上 **4 处明确错译**；未确认需要单独报告的整句、整段漏译。其余可能存在的文风、术语、名字音译习惯与可接受的不同解释，均不列入本次报告。本结论仅针对上述固定文件版本，不表示全章绝无其他错误。

**变更范围：仅新增本核查报告，不直接修改法语原文或中文译文。**
