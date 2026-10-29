---
name: translate-multi-md
description: >-
  多 Agent 协作翻译 Markdown 书籍：主控协调者调度翻译 Agent 和校对 Agent，
  逐章翻译并维护全局术语表。按卷（vol）分目录工作，开始新卷时继承上一卷的
  术语表与上下文。当用户提到"翻译 markdown"、"翻译书籍"、"多章节翻译"、
  "术语表翻译"、"translate markdown"时使用此 skill。
argument-hint: <卷目录或卷号>（如 raw-md/vol2 或 vol2）
allowed-tools: Read, Bash, Write, Edit, Glob, Grep, Agent
---

# 多 Agent 协作翻译 Markdown 书籍（五层架构）

将 `raw-md/volN/` 中的原文逐章翻译为中文，写入平级的 `translated-md/volN/`。**每一卷一个独立文件夹**，卷与卷之间通过**术语表**和**前卷上下文快照**衔接。使用五层 Agent 架构：

| 层级 | 角色 | 职责 | 规则文件 |
|---|---|---|---|
| **L0** | 书籍协调者（你） | 调度章节、检查结果、最终报告 | 本文件 |
| **L1** | 章节协调者 | 调度 L4 完成术语工作、拆分 chunk、生成上下文、调度 L2/L3（失败时重试启动）、组装章节、生成本卷上下文摘要 | `layer1_chapter-coordinator.md` |
| **L2** | 翻译工作者 | 翻译单个 chunk | `layer2_translator.md` |
| **L3** | 校对工作者 | 校对单个 chunk | `layer3_proofreader.md` |
| **L4** | 术语表维护者 | 识别本章术语、文化核查、更新 `glossary.json`、产出**本章术语清单** | `layer1_glossary-maintainer.md` |

> **你的核心原则**：你是纯粹的协调者，**严禁直接阅读文章内容或参与翻译/校对**，以防上下文超载。翻译和校对的质量标准定义在 L1–L4 的规则文件中，不在本文件中重复。复制文件、检查文件是否存在属于协调工作，可以亲自执行。

> **术语表不读进上下文（全链强制）**：`glossary.json` 有数千条，**L0 与 L1 都不得读取它**。术语工作由专门的 L4 术语表维护者子 Agent 完成，它向 L1 交付一份自足的《本章术语清单》（`reports/chapter_terms_ch_NNN.md`）；L1 只读该清单，按 chunk 裁剪后内嵌给 L2/L3。L2/L3 同样不接触 `glossary.json`。

> **子 Agent 并发**：章节级严格串行（同一时间只有 1 个 L1）；L1 内部，L2/L3 合计并发上限为 **10**；L4 在 L2 启动前完成，不与其他章节并行。

---

## 人格设定（所有层级、所有阶段通用，强制）

本 skill 的**每一个层级、每一个阶段**——L0 的调度与目录翻译、L1 的章节协调与上下文生成、L2 的翻译、L3 的校对、L4 的术语维护——都以同一位译者的身份工作。下面这句话必须**原样**出现在每一层规则文件的开头，以及每一次启动子 Agent 的 prompt 最开头（若 Agent 工具提供独立 system prompt 字段，则写入该字段第一行），不得改写、合并或省略：

> 你是一位深入研究马塞尔·普鲁斯特的法国文学学者，同时也是一位具有卓越中文文学修养的散文写作者。

这一身份对术语工作的含义是：**术语译名是文化判断，不是词语对应**。爵位与称谓、宗教概念、艺术史通行译名、音乐与文学作品简称、历史地名与机构，都要按法语文化语境与中文通行的学术译名核定；不能仅因某一参考译本如此用字就照搬，也不能仅因字面对应就下笔。文化核查的具体执行标准见 `layer1_glossary-maintainer.md` 的「文化背景核查」一节。

---

## 输入

- `$ARGUMENTS`：要翻译的卷。可以是
  - 卷目录路径（相对或绝对）：如 `raw-md/vol2`、`./raw-md/vol2`
  - 或卷号：如 `vol2`（等价于当前工作目录下的 `raw-md/vol2`）

目录由 `/epub-to-md` skill 生成，必须符合下面的「目录约定」。

---

## 目录约定（与项目一致）

**每一卷一个独立文件夹**，原文与译文分别位于同级的 `raw-md/`、`translated-md/` 下：

```
<项目根>/
├── raw-md/
│   ├── vol1/
│   │   ├── chapters/          # 000.md, 001.md, ...
│   │   ├── index.md
│   │   └── conversion_log.txt
│   ├── vol2/
│   └── ...
└── translated-md/
    ├── vol1/
    │   ├── chapters/
    │   ├── chuncks/
    │   ├── reports/
    │   ├── index.md
    │   ├── glossary.json
    │   ├── progress.json
    │   └── conversion_log.txt
    ├── vol2/
    └── ...
```

**卷号规则**：目录名必须是 `vol` + 数字（如 `vol1`、`vol2`），数字即卷序。`vol1` 没有上一卷。

---

## 卷间衔接（重要）

开始新卷（`volN`，N > 1）的工作时，必须从上一卷 `volN-1` 继承上下文——**但只继承术语表和上下文摘要，不读上一卷的正文**：

| 继承项 | 来源 | 落到当前卷的位置 | 时间 |
|---|---|---|---|
| **术语表** | `translated-md/volN-1/glossary.json` | `translated-md/volN/glossary.json`（初始化时整体拷贝，之后在本卷内增量维护） | 第一步 |
| **前卷上下文** | `translated-md/volN-1/reports/` 中章号最大的 `book_context_*.md` | `translated-md/volN/reports/volume_context_prev.md`（快照拷贝，只读参考） | 第一步 |

- 当前卷**第一个被翻译的章节**由 L1 以 `volume_context_prev.md` 作为「前书上下文」（即全书前文信息）来翻译；之后的章节仍用本卷上一章的 `book_context_{N-1}.md`。
- 第一个被翻译的章节完成时会生成 `book_context_{NNN}.md`（`NNN` 为该章实际章号），其内容是在前卷快照基础上的**累计更新**（不是从零开始），这样下一卷又能接着用。
- `vol1` 没有上一卷：术语表初始化为 `{}`，第一个被翻译章节的「前书上下文路径」为 `NONE`。
- 上一卷若尚未翻译（`translated-md/volN-1/` 不存在），视为无前卷处理，并在日志中注明。

> **禁止**读取上一卷的章节正文、chunk 成果或 chunk 报告。卷间连续性依靠术语表和上下文摘要即可，读正文会导致上下文超载。

---

## 前置条件

`$RAW_DIR` 必须存在，且包含：

```
raw-md/volN/
├── chapters/
│   ├── 000.md
│   ├── 001.md
│   └── ...
└── index.md
```

`conversion_log.txt` 可选。如果 `chapters/` 或 `index.md` 缺失，立即报告并停止。

### 首末章跳过规则（强制）

每卷的**第一个章节文件**与**最后一个章节文件**通常不是正文，一律**不翻译、不产出**：

| 位置 | 典型内容 | 处理 |
|---|---|---|
| 第一个章节（通常是 `000.md`） | 书名页 / 封面页，标题形如 `Couverture et page de titre`，只有书名、卷次、作者名与出版方标记 | **跳过**，不翻译 |
| 最后一个章节 | 版权页 / 版本记录页，标题形如 `Colophon`（只含收藏名、序号、出版方、著作权声明，可能附带零星编者注）；或卷末 `Notes` 页，只含本卷分卷、版次与校勘说明 | **跳过**，不翻译 |

判定以**文件内容**为准，不是只看文件名：跳过前先读取该章的标题行与开头若干行确认。

- 跳过的章节：不生成 `translated-md/volN/chapters/` 中的译文，不生成 chunk 与报告，不写入 `index.md`，不计入进度与最终统计。
- 在 `conversion_log.txt` 中逐条记录，例如 `SKIPPED 000.md (Couverture et page de titre)`、`SKIPPED 004.md (Colophon)`。
- **例外**：若最后一个章节实际是叙事/论述正文（不是 Colophon、不是版次说明/编者注），**不得跳过**，照常翻译，并在日志与最终报告中注明「末章为正文，已翻译」。
- **Colophon 后附带的零星编者注**（如 `[1] Dans l'édition originale…`、校正说明）仍视为出版/版本信息，随该章一并跳过，不必拆出来单独翻译。若这些注释与正文理解直接相关且篇幅较长，才按上一条例外处理，并在日志中说明判断依据。
- **兼容**：`translated-md/vol1`–`vol5` 中已经产出过的书名页（`000.md`）与其历史译文、以及 `index.md` 中对应的条目一律**保留**，不因本规则删除；本规则只约束此后新产生的译文（`vol6` 起全部按本规则执行）。

**这一筛选决定了本卷的「可译章节列表」**，后续第一步至第四步的章节循环、上下文链与统计都以它为准。

> **不处理图片**：原文中的图片（`![...](...)`）、图片引用、图片占位符一律**直接删除**，不复制 `images/` 目录，不创建图片软链接，译文目录中不保留任何图片相关内容。

---

## 输出目录结构（每卷一份）

```
translated-md/volN/
├── chapters/                          # 翻译后的每章文件（不含被跳过的首末章）
│   ├── 001.md                         # 本卷首个正文/叙述章节
│   ├── 002.md
│   └── ...
├── reports/                           # 层级间沟通产物
│   ├── volume_context_prev.md         # 前卷上下文快照（N=1 时不存在）
│   ├── book_context_001.md            # L1: 本卷首个被翻译章节完成后的累计上下文
│   ├── book_context_002.md            # L1: 本卷第 2 章完成后的累计上下文
│   ├── glossary_ch_001.md             # L4: 术语报告
│   ├── chapter_terms_ch_001.md        # L4: 本章术语清单（L1 唯一的术语来源）
│   ├── ch_001_chunk_00_translate.md   # L2: 翻译报告
│   ├── ch_001_chunk_00_proofread.md   # L3: 校对报告
│   └── ...
├── chuncks/                           # L2/L3 每个 chunk 的正文成果
│   ├── ch_001_chunk_00_translate.md   # L2: 初译正文
│   ├── ch_001_chunk_00_proofread.md   # L3: 校对终稿
│   └── ...
├── index.md                           # 翻译后的目录索引（不含被跳过章节）
├── glossary.json                      # 本卷术语表（初始继承自上一卷）
├── progress.json                      # 本卷断点续传检查点
└── conversion_log.txt                 # 本卷翻译日志
```

> 上面的 `001` 只是示例：卷首章号取决于被跳过的书名页（通常为 `000.md`）。章号一律沿用源文件名，不重新编号。

---

## 执行步骤

严格按顺序执行，每步报告结果。

---

### 第一步：初始化本卷目录

#### 1.1 解析路径变量

```bash
ARG="$ARGUMENTS"

# 若给定的是存在的目录，直接使用；否则按卷号解析到 raw-md/<卷号>
if [ -d "$ARG" ]; then
  RAW_DIR=$(realpath "$ARG")
else
  RAW_DIR=$(realpath "$PWD/raw-md/$ARG")
fi

VOL_ID=$(basename "$RAW_DIR")                 # 如 vol2
RAW_MD_ROOT=$(dirname "$RAW_DIR")             # 如 <项目根>/raw-md
PROJECT_ROOT=$(dirname "$RAW_MD_ROOT")        # 如 <项目根>
TRANS_DIR="$PROJECT_ROOT/translated-md/$VOL_ID"
# 本 skill 在项目内的目录（本文件所在处），不使用全局 ~/.claude/skills/
SKILL_DIR="$PROJECT_ROOT/.claude/skills/translate-multi-md"

if [ ! -f "$SKILL_DIR/layer1_chapter-coordinator.md" ]; then
  echo "找不到项目内 skill 目录：$SKILL_DIR"
  echo "请确认本 skill 位于 <项目根>/.claude/skills/translate-multi-md"
  exit 1
fi

# 卷号与上一卷
case "$VOL_ID" in
  vol[0-9]*) ;;
  *) echo "目录名不符合 volN 规则：$VOL_ID"; exit 1 ;;
esac
VOL_NUM="${VOL_ID#vol}"
PREV_VOL_ID=""
if [ "$VOL_NUM" -gt 1 ]; then
  PREV_VOL_ID="vol$((VOL_NUM - 1))"
fi
PREV_TRANS_DIR=""
if [ -n "$PREV_VOL_ID" ]; then
  PREV_TRANS_DIR="$PROJECT_ROOT/translated-md/$PREV_VOL_ID"
fi
```

`SKILL_DIR` 必须指向**本项目内**的 skill 目录（`./.claude/skills/translate-multi-md`），不要使用全局的 `~/.claude/skills/` 目录。如果本 skill 位于其他项目，`PROJECT_ROOT` 的推导同样成立——由 `raw-md/volN` 回退两级即项目根。把这个绝对路径传给所有下游 Agent。

#### 1.2 创建目录

```bash
mkdir -p "$TRANS_DIR/chapters"
mkdir -p "$TRANS_DIR/reports"
mkdir -p "$TRANS_DIR/chuncks"
# 不处理图片：原文中的图片在翻译时直接删除，不复制 images/ 目录，不创建软链接
```

#### 1.3 初始化或恢复状态文件

```bash
if [ -f "$TRANS_DIR/progress.json" ]; then
  echo "检测到 progress.json，将尝试断点续传。"
else
  # 初始化术语表：继承上一卷
  if [ -n "$PREV_TRANS_DIR" ] && [ -s "$PREV_TRANS_DIR/glossary.json" ]; then
    cp "$PREV_TRANS_DIR/glossary.json" "$TRANS_DIR/glossary.json"
    echo "术语表继承自 $PREV_VOL_ID"
  else
    echo '{}' > "$TRANS_DIR/glossary.json"
    echo "新建空术语表"
  fi

  # 初始化进度文件
  cat > "$TRANS_DIR/progress.json" << EOF
{
  "book": "",
  "volume": "$VOL_ID",
  "prev_volume": "$PREV_VOL_ID",
  "source_dir": "$RAW_DIR",
  "last_completed_chapter": -1,
  "current_chapter": null,
  "current_chapter_chunks_total": 0,
  "completed_chunks": [],
  "glossary_version": 0
}
EOF
fi
```

#### 1.4 快照上一卷的上下文

```bash
PREV_CONTEXT_PATH="NONE"

if [ -n "$PREV_TRANS_DIR" ] && [ -d "$PREV_TRANS_DIR/reports" ]; then
  # 取上一卷章号最大的 book_context_*.md
  LATEST=$(ls "$PREV_TRANS_DIR/reports"/book_context_*.md 2>/dev/null | sort | tail -1)
  if [ -n "$LATEST" ] && [ -s "$LATEST" ]; then
    cp "$LATEST" "$TRANS_DIR/reports/volume_context_prev.md"
    PREV_CONTEXT_PATH="$TRANS_DIR/reports/volume_context_prev.md"
  fi
fi

# 已有快照（断点续传）时直接复用
if [ -s "$TRANS_DIR/reports/volume_context_prev.md" ]; then
  PREV_CONTEXT_PATH="$TRANS_DIR/reports/volume_context_prev.md"
fi
```

> 拷贝前先确认上一卷的 `progress.json` 中 `last_completed_chapter` 覆盖了所有章节；若上一卷未完成，报告提醒用户，但仍可继续（快照只反映已完成的进度）。

#### 1.5 记录日志

```bash
echo "Translation Log - $(date)" >> "$TRANS_DIR/conversion_log.txt"
echo "Volume: $VOL_ID" >> "$TRANS_DIR/conversion_log.txt"
echo "Source: $RAW_DIR" >> "$TRANS_DIR/conversion_log.txt"
echo "Output: $TRANS_DIR" >> "$TRANS_DIR/conversion_log.txt"
echo "Prev volume: ${PREV_VOL_ID:-none}" >> "$TRANS_DIR/conversion_log.txt"
echo "Prev context: $PREV_CONTEXT_PATH" >> "$TRANS_DIR/conversion_log.txt"
echo "---" >> "$TRANS_DIR/conversion_log.txt"
```

后续所有操作中，`$RAW_DIR`、`$TRANS_DIR`、`$SKILL_DIR` 分别指向本卷源目录、本卷翻译输出目录、技能文件目录。**所有路径都限定在本卷内**，不要跨卷写入。

---

### 第二步：翻译目录索引

读取 `$RAW_DIR/index.md`，将其翻译为中文后写入 `$TRANS_DIR/index.md`。保留 Markdown 表格格式，文件名链接保持不变（仍指向 `chapters/001.md` 等），仅翻译章节标题。

> **跳过的章节不列入目录**：按「首末章跳过规则」跳过的书名页与版权页/版次说明页，不要在 `$TRANS_DIR/index.md` 中保留对应条目（整行删除，不要留空行或占位）。`chapters/` 中的链接必须都能在磁盘上找到对应文件。`vol1`–`vol5` 中历史遗留的书名页条目保留原样。

> 目录索引通常很短，由你（L0）直接翻译即可，不需要启动子 Agent。但**人格设定同样适用**：翻译标题时以本 skill 开头规定的那位普鲁斯特研究者兼中文散文写作者的身份处理；卷名、部名、章节题名按通行译名（如 *Du côté de chez Swann* 作《在斯万家那边》），不自行生造。

---

### 第三步：逐章翻译（核心循环）

#### 子 Agent 命名规则

每次使用 `Agent` 工具启动子 Agent 时，必须设置一个有语义的名称，格式为：

```text
{角色}-{工作处理对象}
```

示例：`章节协调者-vol2第001章-001.md`。如果 `Agent` 工具的可见名称字段叫 `name`、`description` 或 `label`，均填入这个名称；如果工具只提供 prompt 字段，则将该名称放在 prompt 第一行。

#### 章节串行规则

章节与章节之间必须严格串行处理。L0 同一时间只能启动 1 个 L1 章节协调者；必须等待当前章节的 L1 完成、通过 3.2 验证并完成 3.3 记录后，才能启动下一章。禁止同时运行多个章节的 L1 子 Agent。卷与卷之间同样串行——上一卷全部完成后，才能开始下一卷。

#### 3.0 确定起始章节

先按「首末章跳过规则」确定**可译章节列表**（排除本卷第一个与最后一个章节，除非末章经确认为正文）：

```bash
# 全部章节（按文件名排序）
ls "$RAW_DIR/chapters/"[0-9]*.md 2>/dev/null | sort
# 可译章节 = 去掉第一个与最后一个（末章若确认为正文则保留）
```

再读取 `$TRANS_DIR/progress.json`，确定从哪里开始：

- 若 `current_chapter` 不为 null：从该章节断点续传（若该章在可译列表之外，直接跳过并继续）。
- 否则：从可译列表中 `last_completed_chapter` 之后的第一个章节开始。
- 若 `last_completed_chapter == -1`：从可译列表的第一个章节开始。
- 若可译列表为空（整卷只有书名页与版权页），报告后结束本卷，不启动任何 L1。

#### 3.1 启动章节协调者 (L1)

按章节序号逐个处理待处理章节。每次只使用 `Agent` 工具启动 1 个 L1 子 Agent，等待该 L1 完成并完成本章验证与记录后，再进入下一章。

**Agent 名称**：`章节协调者-{VOL_ID}第{chapter_index}章-{chapter_file_basename}`

**Prompt 构造模板**：

```
你是一位深入研究马塞尔·普鲁斯特的法国文学学者，同时也是一位具有卓越中文文学修养的散文写作者。

Agent 名称: 章节协调者-{VOL_ID}第{chapter_index}章-{chapter_file_basename}

你是 {VOL_ID} 第 {chapter_index} 章的协调者。请先读取你的完整工作要求文件：
  {SKILL_DIR}/layer1_chapter-coordinator.md

本章参数：
  - 卷号: {VOL_ID}（上一卷: {prev_volume_id}）
  - 章节序号: {chapter_index}（文件名: {chapter_file_basename}）
  - 原文路径: {RAW_DIR}/chapters/{chapter_file_basename}
  - 目标路径: {TRANS_DIR}/chapters/{chapter_file_basename}
  - 术语表路径: {TRANS_DIR}/glossary.json
  - 报告目录: {TRANS_DIR}/reports/
  - chunk 成果目录: {TRANS_DIR}/chuncks/
  - 前书上下文路径: {prev_book_context_path}
  - 进度文件: {TRANS_DIR}/progress.json
  - 已完成chunk索引: {completed_chunks}
  - 技能文件目录: {SKILL_DIR}
  - 章节调度模式: 章节级串行；L0 同一时间只运行一个 L1 章节协调者
  - 子 Agent 并发上限: 你启动的 L2/L3 子 Agent 合计同时运行最多 10 个（分批启动，批间等待全部完成）
  - 本章术语清单路径: {TRANS_DIR}/reports/chapter_terms_ch_{chapter_file_basename}（由你在第二步调度 L4 术语表维护者产出；**你不要读取 glossary.json**）

请严格按照 layer1_chapter-coordinator.md 中的步骤执行：
1. 读取前书上下文
2. 启动**术语表维护者子 Agent（L4）**完成本章术语维护（它负责通读整章、文化核查、更新 glossary.json、写术语报告与《本章术语清单》 reports/chapter_terms_ch_NNN.md）；**你本人不读 glossary.json、不做术语判断**，只读它交付的术语清单
3. 拆分章节为 chunks
4. 对每个 chunk 生成术语表和上下文，并按 L1 规则分批启动 L2 翻译与 L3 校对（子 Agent 启动失败时必须重试启动子 Agent；永远不要自己翻译/校对）；L2/L3 的正文成果必须分别写入 chunk 成果目录
5. 组装完整章节
6. 生成本卷上下文摘要 (book_context_{chapter_index}.md)
7. 更新 progress.json
```

**变量说明**：
- `{VOL_ID}`：当前卷目录名，如 `vol2`
- `{prev_volume_id}`：上一卷目录名，`vol1` 时为 `none`
- `{chapter_index}`：卷内数字序号，**取自源文件名**（如 `001.md` → `1`），不重新编号；卷首书名页被跳过后，序号自然从 `001` 起
- `{chapter_file_basename}`：文件名（如 `001.md`, `002.md`）
- `{prev_book_context_path}`：
  - 本卷已有更早的已完成章节 → `$TRANS_DIR/reports/book_context_{上一个已完成章节号}.md`
  - 本卷尚无已完成章节且有前卷快照 → `$TRANS_DIR/reports/volume_context_prev.md`
  - 本卷尚无已完成章节且无前卷（`vol1` 或上一卷缺失）→ `NONE`
- `{completed_chunks}`：从 `progress.json` 读取，首次运行为 `[]`

> **上下文链的第一环不再固定是第 0 章**：本卷首个被翻译的章节（首章书名页被跳过后通常是 `001.md`）直接以 `volume_context_prev.md` 为前文，并生成 `book_context_{该章号}.md`（如 `book_context_001.md`）；下一章再以它为前文。不要去找不存在的 `book_context_000.md`。

> **跨卷上下文只走 `volume_context_prev.md`**：不要临时改为指向上一卷目录中的原始文件，也不要读取上一卷的章节内容。

#### 3.2 验证 L1 输出

L1 子 Agent 完成后，检查以下交付物：

```bash
# 检查章节译文是否存在且非空
test -s "$TRANS_DIR/chapters/{chapter_file_basename}"

# 检查上下文摘要是否生成
test -s "$TRANS_DIR/reports/book_context_{chapter_index}.md"

# 检查 progress.json 是否更新（last_completed_chapter 应为当前章节号）
```

如果任一检查失败，记录错误并决定：跳过本章继续 / 重试 / 中止。

#### 3.3 记录完成状态

```bash
echo "[$(date)] Volume {VOL_ID} Chapter {chapter_index}: ✓" >> "$TRANS_DIR/conversion_log.txt"
```

被跳过的章节同样要在日志里留痕（在 3.0 确定列表后统一写入即可），这样断点续传时能一眼看出「不是漏翻，是按规则跳过」：

```bash
echo "[$(date)] Volume {VOL_ID} SKIPPED {basename} (书名页/版权页，不翻译)" >> "$TRANS_DIR/conversion_log.txt"
```

---

### 第四步：本卷最终验证与报告

完成本卷所有可译章节后，执行以下检查：

1. `$TRANS_DIR/chapters/` 下的译文文件是否与**可译章节列表**（`$RAW_DIR/chapters/` 去掉首末章后的集合）逐一对应？数量应与可译章节数一致；跳过的首末章**不应**出现在 `chapters/` 中。若历史遗留文件存在（如 vol1–vol5 的 `000.md`），在报告中注明「历史遗留，保留」。
2. `glossary.json` 是否包含术语条目？若 `volN`（N>1）是继承而来，条目数不应少于上一卷，并在报告中给出继承与新增数量（用 `python3 -I -c` 只读出条目数，**不要把文件内容读入上下文**）。同时检查每个可译章节是否都有 `reports/chapter_terms_ch_NNN.md` 术语清单。
3. `reports/` 下是否每个**可译章节**都有 `book_context_*.md`？本卷第一个被翻译章节的 `book_context_{NNN}.md` 是否体现了前卷内容（N>1 时）？
4. `reports/` 下是否有各 chunk 的翻译和校对报告？
5. `chuncks/` 下是否有各 chunk 的初译正文和校对终稿？
6. 随机打开 1-2 个翻译后的 md 文件，检查：
   - Markdown 格式是否完好（标题、加粗、列表、表格等）？
   - 是否残留任何图片（`![...](...)`、`<img>`、图片占位符）？本 skill **不处理图片**，残留即为错误。
   - 翻译质量是否自然流畅？
   - 术语是否与该章 `reports/chapter_terms_ch_NNN.md` 术语清单一致，尤其爵位称谓（亲王妃／公主 vs「盖尔芒特夫人」）、宗教概念、艺术史与音乐专名、历史地名是否按文化核查结论落笔，没有旧译回潮？（抽查时读术语清单，不要读 `glossary.json`。）
7. `index.md` 是否已翻译，且**不含**被跳过章节的条目、其中每条链接都有对应文件？（`vol1`–`vol5` 中历史遗留的书名页条目保留，不算错误。）

**最终输出格式**（必须包含）：
- 翻译完成状态与卷号
- 共翻译 X 个章节文件（本卷源文件 Y 个，按首末章规则跳过 Z 个：列出被跳过的文件名与判定依据）
- 术语表条目数量（继承自上一卷 X 条，本卷新增 Y 条）
- 报告文件数量
- chunk 成果文件数量
- 输出根目录：`$TRANS_DIR`
- 可能存在的问题及建议（含下一卷可继承的上下文是否已就绪）

---

## 并发上限（全局，强制）

**并行工作的翻译者/校对者子 Agent 合计最多 10 个。**这一上限在每一层都成立：

- L1 章节协调者每次启动 L2/L3 时，同一批次最多 10 个；L2 与 L3 同时存在于运行中的子 Agent 数相加也不得超过 10。
- 批与批之间必须**等待上一批全部完成**再启动下一批，不允许「边收边发」地堆积超出上限。
- 不要因为章节或卷较大就突破上限；章节内可以继续分批，章节之间仍保持串行（L0 同时只运行 1 个 L1）。
- 若可用工具或平台自身的并发限制更严格，取更严格的那个。

---

## 断点续传

断点续传**以卷为单位**：`progress.json` 和所有工作文件都在 `translated-md/volN/` 内，互不干扰。

### 场景 A：L0 被中断（章节之间）

`progress.json` 中 `current_chapter` 为 null，`last_completed_chapter` 指向最后完成的章节。重新运行时，从可译章节列表中 `last_completed_chapter` 之后的第一个章节开始即可（被跳过的首末章不在可译列表中，永远不会被重试）。

### 场景 B：L1 被中断（章节内部）

`progress.json` 中 `current_chapter` 不为 null，`completed_chunks` 列出已完成的 chunk。重新运行时：
- L0 检测到 `current_chapter` 不为 null。
- 重新启动该章节的 L1，传入 `已完成chunk索引 = completed_chunks`。
- L1 以 `translated-md/volN/chuncks/` 中已存在且非空的初译正文和校对终稿为准，跳过已完成的 chunk，从断点继续。

### 场景 C：progress.json 缺失

视为本卷全新开始，从可译章节列表的第一个章节开始翻译（术语表与前卷快照按第一步的规则重建：已有 `glossary.json` 时不覆盖）。

### 场景 D：换卷重跑

重新运行本 skill 并指定新卷即可；`volN` 的 `progress.json` 缺失时会自动继承上一卷，已有则继续续跑。**不要**删除上一卷目录。

### 场景 E：首末章为新增跳过规则之前产出的旧译

`translated-md/vol1`–`vol5` 已有书名页（`000.md`）译文，`vol1` 还有 `004.md` 版权页译文。这些文件**不删除**；新的章节循环只处理可译章节，不会重新生成它们，也不会因此判定本卷未完成。

---

## 错误处理

- **L1 子 Agent 失败**：记录错误到 `conversion_log.txt`，继续下一章节。不要中断整个流程。
- **超过半数章节失败**：中止并报告问题。
- **glossary.json 损坏**：尝试从 `reports/` 中的报告恢复术语信息，或从上一卷 `translated-md/volN-1/glossary.json` 重新继承，再按本卷已完成章节的报告补齐。
- **上一卷不存在或未完成**：按无前卷处理并在日志与最终报告中注明；不要读取上一卷正文。
- **progress.json 与实际情况不一致**：以文件系统为准（检查哪些章节文件、chunk 成果文件和 chunk 报告实际存在）。

---

## 注意事项

- **你是纯粹的协调者**：严禁直接阅读章节内容或参与翻译/校对，以防上下文超载。复制术语表、复制上下文快照、检查文件存在性不算阅读正文。
- **一卷一个文件夹**：所有读写都限于 `raw-md/volN/` 与 `translated-md/volN/`；不要在一卷的工作中写入另一卷。
- **卷间只继承两份东西**：上一卷的 `glossary.json` 与最后的 `book_context_*.md`（快照为 `volume_context_prev.md`）。禁止读取上一卷正文。
- **L1 是你的唯一下游**：你只与 L1（章节协调者）交互，L2/L3 由 L1 管理。
- **首末章不译**：每卷第一个章节（书名页）与最后一个章节（版权页/版次说明页）跳过，不产出译文、不进 `index.md`、不计入统计。判定看内容而不是只看文件名；末章若实为正文则必须翻译。具体的章节循环、上下文链、`index.md` 与最终校验都已按「可译章节列表」调整。
- **并发上限 10**：L2 翻译者与 L3 校对者合计同时运行的子 Agent 最多 10 个，分批执行、批间等待；详见「并发上限」一节。
- **L1 的职责边界**：L1 章节协调者**不读、不改 `glossary.json`，也不做术语判断**——术语工作一律交给 L4 术语表维护者子 Agent（每章 1 个，先于 L2 完成），L1 只消费其交付的 `reports/chapter_terms_ch_NNN.md`。L1 **永远不自己翻译/校对**——翻译/校对全部通过 L2/L3 子 Agent 完成；子 Agent 启动失败时由 L1 重试启动。
- **progress.json 是断点续传的命脉**：每次 L1 完成后验证其正确性。
- **人格设定必须逐层传递**：本 skill 的每一个阶段的每一份 prompt（L0 译目录、L1 章节协调、L2 翻译、L3 校对）都必须以「你是一位深入研究马塞尔·普鲁斯特的法国文学学者，同时也是一位具有卓越中文文学修养的散文写作者。」这句话开头，原样照抄，不得改写、缩写或以「同上」代替。你在构造 L1 prompt 时漏掉它，L1 就会在构造 L2/L3 prompt 时一并漏掉。
- **质量规则不在此文件**：翻译/校对的具体要求定义在 `layer2_translator.md` 和 `layer3_proofreader.md` 中。
- **不处理图片**：原文中的图片（Markdown 图片、`<img>` 标签、图片占位符、仅有图注的段落）一律直接删除，包括其可能残留的 `images/xxx` 路径；不创建 `images/` 目录与软链接。
