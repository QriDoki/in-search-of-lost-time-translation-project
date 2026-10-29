# vol9-4 法中逐段对读：确定性严重错译／漏译报告

- 核查日期：2026-10-29
- 核查章节：`vol9-4`，法文 `Chapitre deuxième`
- 中文译文：[`polish/dev/chapters/polished-vol9-4.md`](../../polish/dev/chapters/polished-vol9-4.md)
- 法语原文：[`raw-md/vol9/chapters/004.md`](../../raw-md/vol9/chapters/004.md)
- 核查文本：`polish-20261029` 分支的两份文件
- 核查结果：**3 处确定的重大文本问题（2 处漏译、1 处擅增原文不存在的叙事内容）**。

## 核查范围及报告门槛

已完整按顺序对读两份文件全部 **100 个对应文本单元**（含标题、提要、正文段落、分行诗句及分隔标记），检查人物与行为主体、否定、事件因果、语义结构和漏句。只收录不依赖个人译法偏好、可以直接用法文证明的实质性问题；正常意译、语体与选词、轻度压缩、可争辩注释均不报告。

章节映射依据：`main` 分支的 [`polish/dev/chapter-map.md` 第 27 行](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/main/polish/dev/chapter-map.md#L27)。该映射文件在本次核查所用的 `polish-20261029` 分支上**不存在**，但已以章节标题、内容及段落顺序复核文件对应关系。

## 1. 漏译：治愈大公眼疾的医生及五分钟诊疗被整体删去

**位置：** [中文第 27 行](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/polish/dev/chapters/polished-vol9-4.md#L27) ↔ [法文第 27 行](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/raw-md/vol9/chapters/004.md#L27)，戈达尔诊断大公眼肿的段落。

**法文：**

> L'œil ne désenflant pas, le grand-duc se rabattit sur le médecin ordinaire de Balbec, lequel en cinq minutes retira un grain de poussière. Le lendemain il n'y paraissait plus.

**现译：**

> 眼睛肿不见消，⊂取出一粒灰尘⊃≼大公眼肿本是灰尘所致；戈达尔的“中毒论”在此反成庸医的证据，与本章末嫉妒之“毒”互为讽喻≽。第二天便一点痕迹也没有了。

**判定：明确漏译。** 法文清楚交代：**大公转而求助于巴尔贝克的普通医生，后者只花五分钟便取出一粒灰尘。** 现译只留下“取出一粒灰尘”，删掉了行动主体、改换医生、诊疗时间。整段讽刺正建立在戈达尔昂贵而错误的“中毒论”与普通医生迅速解决问题的反差上；脚注概括“庸医”不足以替代正文所缺的关键情节。

**建议恢复：**

> 眼睛始终不消肿，大公便转而求助于巴尔贝克的普通医生；后者只花了五分钟，便从眼里取出一粒灰尘。第二天便一点痕迹也没有了。

可保留原有注释，但应重新锚定在“灰尘”处。

## 2. 擅增：把“阿尔贝蒂娜已经逝去”的说明写进人物对话

**位置：** [中文第 37 行](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/polish/dev/chapters/polished-vol9-4.md#L37) ↔ [法文第 37 行](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/raw-md/vol9/chapters/004.md#L37)，阿尔贝蒂娜以投海相威胁、叙述者提及萨福的对话。

**法文：**

> Je me noierai, je me jetterai à l'eau. -- Comme Sapho. -- Encore une insulte de plus ; vous n'avez pas seulement des doutes sur ce que je dis mais sur ce que je fais.

**现译：**

> 我要去淹死，我要跳进海里。——**阿尔贝蒂娜已经逝去，作者在这里提前透出后文的死讯**——像⊂萨福⊃≼……≽那样。——又是一句侮辱；您不光怀疑我说的话，还怀疑我做的事。

**判定：明确错增并扭曲叙述。** 加粗部分**不存在于法语原文**，也不是以注释标记独立呈现，而是强行嵌入角色对话。原文的 “Comme Sapho.” 是叙述者对阿尔贝蒂娜“跳海”话语的回应；后一句则是阿尔贝蒂娜认为此话侮辱自己的反驳。擅增的“已经逝去／提前透出死讯”改变叙事时点，并使对话关系混乱。即使小说后文涉及阿尔贝蒂娜的死亡，也不能将这种解释冒充此处的原文。

**建议恢复：**

> “我要去淹死，我要跳进海里。”——“像萨福那样。”——“又是一句侮辱；您不光怀疑我说的话，还怀疑我做的事。”

萨福的典故可以在已有注释中说明，无须插入正文情节。

## 3. 漏译：唐西埃尔重游与“抵达天堂”之间的核心因果论述消失

**位置：** [中文第 187 行](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/polish/dev/chapters/polished-vol9-4.md#L187) ↔ [法文第 187 行](https://github.com/QriDoki/in-search-of-lost-time-translation-project/blob/polish-20261029/raw-md/vol9/chapters/004.md#L187)，圣卢的旧友与失去的“天堂”一段。

**法文：**

> À cet égard, parce que je préférais ne pas aller y retrouver ce qui m'y avait plu, une promenade dans Doncières aurait pu me paraître préfigurer l'arrivée au paradis.

**现译：**

> ……而如今他们的谈话于我只会是烦扰和拘束。⊂天堂的预演⊃≼回到昔日喜悦的地点，却只能感到失落：重访旧地如重访已丧失的天堂，与本卷关于记忆与时间的思索相接≽人们常梦见天堂……

**判定：明确漏译。** 正文将完整法语句子压缩成孤零零的“天堂的预演”，**遗漏**“我宁可不去重访当年令我快乐的所在”“在唐西埃尔散步本来会让我觉得仿佛预演抵达天堂”两个相互关联的命题。缺失的不是修辞装饰，而是作者把**旧日喜悦已经失效的具体地点**与**即使进入天堂也可能迷失**的哲学比喻连接起来的过渡和因果。注释中对此有概括，但不能代替正文。

**建议恢复：**

> 在这一点上，正因为我宁愿不去那里重寻从前使我快乐的事物，在唐西埃尔散一次步，反倒可能使我觉得自己预先体验了抵达天堂的滋味。人们常梦见天堂……

可在恢复的“抵达天堂”处保留适当注释。

## 核查结论

本报告只列上述 **3 处能够用原文直接证实的明显错增或重要漏译**。其余有不同表述空间、文学润色空间或单纯注释问题的细节均未纳入。**未改动中文译文或法文原文**。
