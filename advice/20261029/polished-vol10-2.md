# vol10-2 法中错译／漏译核查报告

- 核查日期：2026-10-29
- 原文章节：**Chapitre troisième（第三章）**
- 法语原文：`raw-md/vol10/chapters/002.md`
- 中文译文：`polish/dev/chapters/polished-vol10-2.md`
- 对照版本：`polish-20261029`
- 章节映射依据：`main` 分支的 `polish/dev/chapter-map.md`（目标分支目前不包含此映射文件；所指两份正文均已在目标分支实际读取、核对）
- 核查范围：**法语与中文的全部 67 个对应正文段落**。以法文的句义、说话者、否定关系和上下文为准；不报告有理可据的译法差异、文字润色及未证实的疑点。

## 核查结果

**确认 3 处明确错译；不另报存疑项目。** 以下按语义影响排序。行号均指本次审查分支的实际文件。

### 1. 将钢琴改编曲的目标听众译为恰好相反的人（重大语义反转）

- 位置：[法语原文 L53](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/raw-md/vol10/chapters/002.md#L53)；[中文译文 L52](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/polish/dev/chapters/polished-vol10-2.md#L52)
- **法语原文**：「Vous avez joué l'autre jour la transcription au piano du XV*e* quatuor, ce qui est déjà absurde parce que rien n'est moins pianistique. **Elle est faite pour les gens à qui les cordes trop tendues du glorieux Sourd font mal aux oreilles.** Or c'est justement ce mysticisme presque aigre qui est divin.」
- **现有中文**：「您那天弹了……的钢琴改编谱，这本身就已经荒唐，因为再没有比它更不适合钢琴的了。**它是写给能够承受这位伟大的聋者把琴弦绷得那样紧的人听的；常人一听，耳朵就疼。**而恰恰是这种近乎尖利的神秘主义，才是神圣的。」
- **确证理由**：`Elle` 指前面的钢琴改编曲（`la transcription au piano`）；`les gens **à qui** ... **font mal aux oreilles**` 指「那些被原版过于紧绷的弦乐声刺得耳朵疼的人」，即**不能承受**这种音响的人。中文版却说改编谱是写给**能够承受**的人，且另加「常人一听，耳朵就疼」的对照，直接反转了改编谱的目标对象，也破坏了夏吕斯反对改编谱、珍视原版尖锐神秘气质的逻辑。
- **建议最小修正**：「这种钢琴改编谱，本是给那些听见这位伟大的聋者那过于紧绷的琴弦便觉得耳朵发疼的人准备的。而恰恰是原作这种近乎尖利的神秘主义，才是神圣的。」

### 2. 把侍者反讽式的「让您说个不停」反译为「我让您听我唠叨」（说话主体颠倒）

- 位置：[法语原文 L5](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/raw-md/vol10/chapters/002.md#L5)；[中文译文 L4](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/polish/dev/chapters/polished-vol10-2.md#L4)
- **法语原文**：「**Mais je vous fais babiller** (**je n'avais pas dit une seule parole** et je commençais à m'endormir en écoutant les siennes).」
- **现有中文**：「**不过我尽拉着您听我唠叨了**（**我一个字也没说**，听着他的话，已经快睡着了）。」
- **确证理由**：`je vous fais babiller` 的动作结构是「**我使您**说个不停」，不是「我自己不停地对您说话」。叙述者紧接着明说自己`n'avais pas dit une seule parole`（根本一个字也没说），构成侍者错把沉默听众说成话多者的滑稽矛盾。译文改成侍者为自己的滔滔不绝道歉，虽与场景表面协调，却**抹去了原文特意设置的错位与反讽**，并使括号内说明失去作用。
- **建议最小修正**：「不过，我倒把您逗得说个不停了（可我一个字也没说，只顾听他讲话，已经快睡着了）。」

### 3. 将与夏吕斯男爵同桌吃饭的人误写成与「母亲」共餐（关键人物指代错误）

- 位置：[法语原文 L31](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/raw-md/vol10/chapters/002.md#L31)；[中文译文 L30](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/polish/dev/chapters/polished-vol10-2.md#L30)
- **法语原文**：「J'aurais bien étonné **ma mère** ... si je lui avais raconté ... **avec qui M. de Charlus était venu dîner** dans un salon au Grand-Hôtel de Balbec. **L'invité** n'était autre que le valet de pied d'une cousine des Cambremer.」
- **现有中文**：「母亲无法理解夏吕斯先生为何频频出入维尔迪兰家；倘若我告诉**她**夏吕斯先生是跟谁一起到巴尔贝克海滨大酒店的一间客厅里吃晚饭的……她一定会大为吃惊。**与她共餐的**，竟是康布雷梅尔家一位表亲的男仆。」
- **确证理由**：这里`L'invité` 是**夏吕斯男爵**带去酒店晚餐的客人，即男仆；母亲只是假设中的听述者，根本不在这顿晚餐里。现有译文在连续两次使用「她」指母亲之后说「与她共餐的」，遂把本来属于男爵和男仆的同席情节，误转给了母亲，改变了事件中的人物关系。
- **建议最小修正**：「**与夏吕斯先生共餐的**，竟是康布雷梅尔家一位表亲的男仆。」（亦可用「那位受邀的客人」作为主语。）

## 排除标准与修改范围

本报告只收录以上能由法语词义、语法和上下文**直接证实**的错误。其他措辞选择、合理改写、注释的可商榷之处，以及影响有限的细节问题，不列为「严重错译」。本轮没有确认达到同等标准的重大整句漏译。

**仅新增核查报告；没有修改法语原文或中文译文。**
