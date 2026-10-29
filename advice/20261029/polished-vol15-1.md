# vol15-1 法中严重错译／漏译核查报告

- 核查日期：2026-10-29
- 审查章节：第三章（续）（Chapitre III, suite）
- 法语原文：`raw-md/vol15/chapters/001.md`
- 中文译文：`polish/dev/chapters/polished-vol15-1.md`
- 章节映射：`polish/dev/chapter-map.md`
- 对照分支：`polish-20261029`

## 核查结果

**确认的严重错译：2 项。**

本报告只收录法语语义与现有中文译文之间有明确、可复核的实质性矛盾，尤其是将否定关系译成肯定、从而反转叙述意思的错误。未收录一般措辞、行文风格、意象选择、译名差异或尚有争议的解释。

### 1. 送奶女工听见羞辱：将“无法得到安慰”错译为“唯一的安慰”

- **定位**：第 64 段；[法文原文](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/raw-md/vol15/chapters/001.md#L129) ｜ [中文译文](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/polish/dev/chapters/polished-vol15-1.md#L127)
- **法文**：`au moment de ses ennuis, rien ne peut le consoler que la jeune laitière d'en face l'ait entendu appeler « chéquard » par la foule`
- **现译**：“在他焦头烂额的时候，**唯一能安慰他的，就是**对面那个年轻的送奶女工曾听见人群朝他挥拳喊他‘骗子’……”
- **错译判定**：`rien ne peut le consoler que … l'ait entendu …` 表达的是**年轻送奶女工已经听见他被人辱骂这一事实，无论如何都不能令他释怀**，不是女工听到辱骂给他带来安慰。原文此处的逻辑是：时间虽然终将冲淡耻辱，但受辱的当下，他无法借未来翻案来消除在女工面前蒙羞的痛苦。译文把负面事实倒转成安慰，直接破坏段落的心理逻辑。
- **建议改译**：“只是，这件事得交给时间去办；而他正遭受羞辱的时候，**想到对面那个年轻的送奶女工听见人群在他被押上囚车时挥拳骂他‘收支票的家伙’，他便无论如何也得不到安慰**……”
- **备注**：`chéquard` 的具体历史讽刺意味可另行考证；本项判定不依赖该词的具体译名，关键是全句否定逻辑被反转。

### 2. 声音与声源：把“不使二者分离”译成“使二者分离”

- **定位**：第 155 段；[法文原文](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/raw-md/vol15/chapters/001.md#L311) ｜ [中文译文](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/polish/dev/chapters/polished-vol15-1.md#L309)
- **法文**：`ne pas changer la place des sons, m'abstenir de les détacher de leur cause, à côté de laquelle l'intelligence les situe après coup`
- **现译**：“我大可以不再挪动声音的位置，**让听到的声音与它真正的源头分开存在**——事后智力才把它们安置到那原因旁边……”
- **错译判定**：`m'abstenir de les détacher de leur cause` 明确是“**避免／不去把声音从声源处分离**”；现译却变成“**让声音与声源分开存在**”，正好与原意相反，也与同句前面的“不再挪动声音的位置”冲突。这一反转涉及叙述者对感官印象与文学再现的讨论，不是措辞差异。
- **建议改译**：“不过，在我力求作出的更精确的转写中，我大可以不改变声音的位置，**不把声音同产生它的原因分离开来**——智力则是在事后才把声音安置到声源旁边……”
- **备注**：后文谈“让雨声在屋内歌唱”等感官错置，是另一种可能的艺术再现方式，并不取消本句 `m'abstenir de` 的否定意义。

## 处理原则与修改范围

只列出能够直接根据法文原句和上下文证明的严重错译；没有把可接受的不同译法或普通润色意见凑数。此处两项都属于**语义方向反转**，因而符合严格列报门槛。

本次**仅新增审校报告**，未直接修改 `polish/dev` 下的中文译文或 `raw-md` 下的法语原文。
