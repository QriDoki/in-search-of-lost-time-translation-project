---
name: epub-to-md
description: >-
  将 EPUB 电子书转换为 Markdown，每章一个独立文件。使用 Calibre + Pandoc
  命令行工具。当用户提到"转换 epub"、"epub 转 markdown"、"拆分章节"、
  "提取电子书"、"epub to markdown"时使用此 skill。
argument-hint: <epub文件路径>
allowed-tools: Read, Bash, Write, Edit, Glob, Grep
---

# EPUB 转 Markdown

将用户提供的 EPUB 文件转换为 Markdown，每章一个独立文件，确保图片和链接尽量可用。

## 输入

- `$ARGUMENTS`：EPUB 文件的路径（相对或绝对路径均可）

## 输出目录规则

**输出目录 `raw-md/` 生成在 EPUB 文件所在目录下**（与源文件平级）。

例如：
- 输入 `~/my-book/book.epub` → 输出 `~/my-book/raw-md/`
- 输入 `./justice.epub` → 输出 `./raw-md/`

## 输出目录结构

```
<epub所在目录>/
├── <epub文件>              # 原始 EPUB
└── raw-md/                 # 转换输出
    ├── images/             # 所有提取的图片
    ├── chapters/           # 每章一个文件，三位数字命名
    │   ├── images          # → 上层 images 的软链接
    │   ├── 000.md
    │   ├── 001.md
    │   └── ...
    ├── index.md            # 目录索引
    └── conversion_log.txt  # 转换日志
```

## 执行步骤

严格按顺序执行，每步报告结果。

### 第一步：环境检查与目录准备

```bash
which ebook-convert && ebook-convert --version | head -1
which pandoc && pandoc --version | head -1
```

如果 `ebook-convert` 或 `pandoc` 不存在，立即报告并停止。

确定输出根目录：

```bash
EPUB_PATH="$ARGUMENTS"
WORK_DIR=$(dirname "$(realpath "$EPUB_PATH")")
RAW_DIR="$WORK_DIR/raw-md"

mkdir -p "$RAW_DIR/images" "$RAW_DIR/chapters"
```

后续所有操作都在 `$WORK_DIR` 下进行，输出写入 `$RAW_DIR`。

### 第二步：Calibre 拆分 EPUB（首选方案）

```bash
ebook-convert "$EPUB_PATH" "$RAW_DIR/html_source" \
  --chapter "//h:h1|//h:h2" \
  --chapter-mark pagebreak \
  --pretty-print
```

执行后检查生成的 HTML 文件数量：

```bash
find "$RAW_DIR/html_source" -name "*.html" -type f | wc -l
```

**判断**：
- 如果生成了 **多个 HTML 文件**（≥2 个）→ 走"方案A：Calibre 拆分成功"
- 如果只生成了 **1 个 HTML 文件** → 走"方案B：Pandoc 整体转换回退"

---

### 方案A：Calibre 拆分成功

使用 Pandoc 批量转换每个 HTML 文件为 Markdown：

```bash
counter=0
for html in "$RAW_DIR"/html_source/**/*.html "$RAW_DIR"/html_source/*.html; do
  if [ -f "$html" ]; then
    title=$(grep -oP '(?<=<title>).*?(?=</title>)' "$html" | head -1)
    if [ -z "$title" ]; then
      title=$(grep -oP '(?<=<h1[^>]*>).*?(?=</h1>)' "$html" | head -1 | sed 's/<[^>]*>//g')
    fi
    if [ -z "$title" ]; then title="Chapter $((counter+1))"; fi

    filename=$(printf "%03d.md" $counter)

    pandoc "$html" \
      -o "$RAW_DIR/chapters/$filename" \
      --extract-media="$RAW_DIR/images" \
      -t markdown+smart+footnotes+link_attributes \
      --wrap=none

    if ! head -n 5 "$RAW_DIR/chapters/$filename" | grep -q '^# '; then
      sed -i "1i# $title\n" "$RAW_DIR/chapters/$filename"
    fi

    echo "$filename|$title" >> "$RAW_DIR/chapters/_map.txt"
    counter=$((counter + 1))
  fi
done
```

然后跳转到第五步。

---

### 方案B：Pandoc 整体转换回退（关键方案）

当 EPUB 不使用标准 h1/h2 标签标记章节时（这在学术书籍中很常见），Calibre 无法按章节拆分。此时使用 Pandoc 整体转换 + 智能拆分。

#### B1：Pandoc 整体转换

```bash
pandoc "$EPUB_PATH" -o "$RAW_DIR/full.md" \
  --extract-media="$RAW_DIR/images" \
  -t markdown+smart+footnotes+link_attributes \
  --wrap=none
```

#### B2：分析章节标题模式

先查看 full.md 中的标题结构：

```bash
wc -l "$RAW_DIR/full.md"
# 查看可能的章节标题模式
grep -n -E '^(CHAPTER|Chapter|PART|Part|PREFACE|Preface|INTRODUCTION|Introduction|BOOK|Book)' "$RAW_DIR/full.md"
```

**根据具体书籍调整正则匹配模式**。常见模式：
- 学术书：`CHAPTER I.`、`CHAPTER II.` ...（罗马数字 + 全大写）
- 小说：`Chapter 1`、`Chapter 2` ...（阿拉伯数字 + 首字母大写）
- 分部书：`Part One`、`Part Two` + `CHAPTER` 组合
- 有序言：`PREFACE`、`PREFACE FOR THE REVISED EDITION`

#### B3：编写拆分脚本

根据 B2 的分析结果，编写 Python 拆分脚本。以下是**模板**，需根据实际标题模式调整 `split_patterns` 列表：

```python
import re, os

raw_dir = os.environ.get('RAW_DIR', 'raw-md')

with open(f'{raw_dir}/full.md', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# === 根据实际书籍调整此列表 ===
split_patterns = [
    (r'^PREFACE FOR THE REVISED EDITION$', 'Preface for the Revised Edition'),
    (r'^PREFACE$', 'Preface'),
    (r'^Part One\. Theory$', 'Part One: Theory'),
    (r'^CHAPTER I\. JUSTICE AS FAIRNESS$', 'Chapter I: Justice as Fairness'),
    # ... 按实际内容补充 ...
]

# 找到所有匹配行
all_matches = []
for i, line in enumerate(lines):
    stripped = line.strip()
    for pattern, title in split_patterns:
        if re.match(pattern, stripped):
            all_matches.append((i, title, stripped))
            break

# 区分目录区和正文区
# 关键：目录中的章节标题通常带页码（如 "CHAPTER I. JUSTICE AS FAIRNESS 3"），
# 正文中的章节标题是独立的（如 "CHAPTER I. JUSTICE AS FAIRNESS"）
# 同一标题出现两次时，第一次在目录，第二次是正文
# 用行号阈值或标题格式差异来区分

# 策略：找到 "PREFACE FOR THE REVISED EDITION" 或类似标题在正文区的首次出现
# 作为正文起始行
real_content_start = None
for i, title, raw in all_matches:
    if i > 200:  # 目录通常在前200行以内
        real_content_start = i
        break

if real_content_start is None:
    real_content_start = 0

front_matter = lines[:real_content_start]
content_matches = [(i, t, r) for i, t, r in all_matches if i >= real_content_start]

# 构建章节列表
chapters = [('Front Matter', front_matter)]
for idx, (line_no, title, raw_text) in enumerate(content_matches):
    end = content_matches[idx + 1][0] if idx + 1 < len(content_matches) else len(lines)
    chapters.append((title, lines[line_no:end]))

# 后处理：分离最后一章中的附录
last_idx = len(chapters) - 1
last_title, last_lines = chapters[last_idx]
conv_table_line = None
for i, line in enumerate(last_lines):
    if line.strip() in ('Conversion Table', 'CONVERSION TABLE', 'Index', 'INDEX'):
        conv_table_line = i
        break
doc_outline_line = None
for i, line in enumerate(last_lines):
    if 'Document Outline' in line:
        doc_outline_line = i
        break
if conv_table_line is not None:
    ch_content = last_lines[:conv_table_line]
    appendix_content = last_lines[conv_table_line:doc_outline_line or len(last_lines)]
    chapters[last_idx] = (last_title, ch_content)
    chapters.append(('Conversion Table and Index', appendix_content))

# 清理：移除 Document Outline、xhtml 锚点、calibre 类标记
for idx, (title, ch_lines) in enumerate(chapters):
    cleaned = []
    for line in ch_lines:
        stripped = line.strip()
        if 'Document Outline' in stripped:
            break  # 跳过 Document Outline 及其后所有内容
        if re.match(r'^\[\]\{.*\.xhtml.*\}$', stripped):
            continue
        if re.match(r'^\[\]\{.*calibre.*\}$', stripped):
            continue
        if stripped in ('</div>', '<div>'):
            continue
        cleaned.append(line)
    chapters[idx] = (title, cleaned)

# 写入文件
os.makedirs(f'{raw_dir}/chapters', exist_ok=True)
mapping = []
for idx, (title, chapter_lines) in enumerate(chapters):
    filename = f'{idx:03d}.md'
    content = ''.join(chapter_lines).strip()
    if not content.startswith('#'):
        content = f'# {title}\n\n' + content
    with open(f'{raw_dir}/chapters/{filename}', 'w', encoding='utf-8') as f:
        f.write(content + '\n')
    mapping.append((filename, title))
    print(f'Written: {filename} - {title} ({len(chapter_lines)} lines)')

# 写入 index.md
with open(f'{raw_dir}/index.md', 'w', encoding='utf-8') as f:
    f.write('# 目录索引\n\n')
    f.write('| 文件名 | 章节标题 |\n')
    f.write('|--------|----------|----------|\n')
    for filename, title in mapping:
        f.write(f'| [{filename}](chapters/{filename}) | {title} |\n')

print(f'\nTotal chapters: {len(chapters)}')
```

**关键提醒**：
- 上述 `split_patterns` 只是示例模板，必须根据 B2 的分析结果替换为当前书籍的实际标题模式
- 目录区与正文区的区分是核心难点，需要仔细观察 full.md 的结构
- 如果书籍有 Part 分部（Part One/Two/Three），需决定是否将 Part 作为独立章节或合并入下一章

#### B4：清理临时文件

```bash
rm -f "$RAW_DIR/full.md"
rm -rf "$RAW_DIR/html_source"
```

---

### 第五步：图片路径统一处理

```bash
# Pandoc --extract-media 会创建嵌套的 images/images/ 目录，需要展平
if [ -d "$RAW_DIR/images/images" ]; then
  mv "$RAW_DIR/images/images/"* "$RAW_DIR/images/" 2>/dev/null
  rmdir "$RAW_DIR/images/images" 2>/dev/null
fi

# 统一图片引用路径为相对路径
find "$RAW_DIR/chapters" -name "*.md" -exec sed -i 's|raw-md/images/images/|images/|g' {} +
find "$RAW_DIR/chapters" -name "*.md" -exec sed -i 's|raw-md/images/|images/|g' {} +
```

### 第六步：清理 calibre 类标记

```bash
# 移除 Pandoc 输出中的 calibre 类标记
find "$RAW_DIR/chapters" -name "*.md" -exec sed -i 's|{\.calibre[0-9]*}||g' {} +
# 移除 xhtml 锚点引用
find "$RAW_DIR/chapters" -name "*.md" -exec sed -i 's|\[\]{#[^}]*\.xhtml[^}]*}||g' {} +
```

### 第七步：创建软链接与索引

```bash
# 在 chapters 目录下创建 images 软链接
ln -sf ../images "$RAW_DIR/chapters/images"
```

生成 `index.md`（如果方案B的 Python 脚本已生成则跳过）：

```bash
if [ ! -f "$RAW_DIR/index.md" ]; then
  echo "# 目录索引" > "$RAW_DIR/index.md"
  echo "" >> "$RAW_DIR/index.md"
  echo "| 文件名 | 章节标题 |" >> "$RAW_DIR/index.md"
  echo "|--------|----------|" >> "$RAW_DIR/index.md"
  # 从 _map.txt 或文件内容生成...
fi
```

### 第八步：生成转换日志

将整个转换过程中的关键信息写入 `$RAW_DIR/conversion_log.txt`，包括：
- 源文件、日期、工具版本
- 使用的转换方案（A 或 B）
- 遇到的问题及处理方式
- 最终结果统计

### 第九步：最终验证与报告

完成以下检查并给出总结报告：

1. `$RAW_DIR/chapters/` 下是否有 `000.md`、`001.md` 等文件？
2. 图片是否已提取到 `$RAW_DIR/images/`？
3. `$RAW_DIR/index.md` 是否正确生成了目录？
4. 随机打开 1-2 个 md 文件，检查：
   - 第一个标题是否正确？
   - 图片引用路径是否为 `images/xxx`？
   - 内部链接是否指向合理位置？

**最终输出格式**（必须包含）：
- 转换完成状态
- 共生成 X 个章节文件（从 000.md 到 XXX.md）
- 图片数量
- 输出根目录：`$RAW_DIR`（即 EPUB 文件所在目录下的 `raw-md/`）
- 可能存在的问题及建议

## 注意事项

- **输出目录始终在 EPUB 文件所在目录下**，与源 EPUB 平级
- 如果 EPUB 没有标准 h1/h2 标签（学术书籍常见），直接走方案B
- 方案B 的核心是"先整体转 Markdown，再按标题模式拆分"——这比 Calibre 拆分更可靠
- 拆分脚本中的正则模式必须根据具体书籍调整，不能直接照搬模板
- 注意区分目录区（TOC）和正文区，避免把目录条目当作章节拆分
