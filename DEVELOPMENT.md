# 开发说明

本项目把《追忆似水年华》的中文译文打包成两种产物：**在线阅读站点**（VitePress → GitHub Pages）与 **EPUB 电子书**（pandoc → GitHub Releases）。两者由同一份译文、同一次构建生成，内容完全一致。

书籍介绍与许可信息见 [README.md](README.md)。

## 分支与 PR 流程

所有开发分支的 PR（包括功能、修复、文档和译文修订）一律以 `main` 为目标分支（base）。发布时，再通过 PR 将 `main` 合入 `release`；发布 PR 的来源分支（head）必须为 `main`，目标分支（base）必须为 `release`。

统一流程为：`开发分支 → main → release`。不得将开发分支直接合入 `release`，也不得通过直接向 `release` 提交或推送开发改动绕过 `main`。创建、更新或合并 PR 前，须核实 base 和 head 符合此流程。`release` 是发布分支，站点与 EPUB 发布工作流从该分支运行。

## 内容源

```text
polish/{版本}/chapters/*.md   正式版本润色稿（发布内容源）
polish/dev/chapters/*.md      开发稿（贡献者修改，不参与 CI/CD 发布）
publish/arrange.json           七卷目录树：卷 → 部/章 → 章/节，以及每页由哪些文件取段拼成
publish/版权页.md              版权页，站点与每本电子书的第一页
book.config.mjs                书目元数据（标题、作者、许可、仓库地址等）
```

`polish/` 下可以有多个正式版本目录（如 `20261029220000`）。文件夹名就是版本号。默认构建排除 `dev`，只在带 `chapters/` 子目录的正式版本文件夹中，按文件夹名的字符串顺序降序选择第一项，不参考创建时间、修改时间或 CI 时间。正式版本统一采用固定宽度的 `YYYYMMDDhhmmss` 命名；需要指定已有版本时：

```bash
POLISH_VERSION=20261029220000 npm run build
```

贡献者直接修改 `polish/dev/chapters/`，不新建时间戳文件夹，也不修改正式版本。`dev` 初始从最新时间戳目录完整复制；已存在时应保留其中累计的修订，不反复用正式版本覆盖。修改只提交到 fork，再向上游创建 MR／PR。正式发布时，由维护者将开发稿整理成新的时间戳目录。

本地验证开发稿需显式指定，例如 `POLISH_VERSION=dev npm run build` 或 `POLISH_VERSION=dev npm run build:epub`。未指定时仍构建正式版本；CI/CD 禁止显式选择 `dev`。

`publish/arrange.json` 的写法见文件内的「说明」字段。要点：

- 节点是 `{ title, parts?, children? }`；有 `parts` 表示该节点自己的正文，`children` 是其子条目。
- `parts` 里的字符串表示整份文件；对象 `{ "file": ..., "section": n }` 表示只取该文件按 `🥒🥒🥒🥒🥒` 切出的第 n 段（`[a, b]` 取区间）。
- **产物页面不按 md 文件切分**：每个「部」级节点（或无部卷的「章」）单独成一页，一页可以由多个文件拼成，一个文件的若干段也可以分给两页。

## 层级与产物

| 层级 | 例子 | 产物 |
| --- | --- | --- |
| 0 级 书 | 追忆似水年华 | — |
| 1 级 卷 | 第四卷 · 索多玛与蛾摩拉 | 卷首页（法文原名） |
| 2 级 部/章 | 第二部 | 一个页面 / 一个 xhtml |
| 3 级 章/节 | 第一章 社交界的夏吕斯 | 页面内锚点 |
| 4 级 节 | 心灵的间歇 | 页面内锚点 |

因此站点页面 id 形如 `vol4-02`（第四卷第 2 个 2 级节点），卷首页是 `vol4-00`，3/4 级锚点形如 `vol4-02-c1`、`vol4-02-c1-s1`。EPUB 的 nav 与站点目录都用这棵树，层级完全对应。

## 常用命令

```bash
npm install
npm run dev          # 生成内容 + 启动开发服务器
npm run gen          # 只生成站点内容（site/chapters、site/toc.md、book.json）
npm run build:site   # 生成并构建静态站点到 site/.vitepress/dist
npm run build:epub   # 生成 8 个 EPUB 到 dist/epub（需要 pandoc）
npm run build:all    # 站点 + EPUB
npm run preview      # 预览已构建的站点
```

## 构建结构

```text
scripts/lib/content.mjs    内容模型：读 arrange.json，取段/拼接，输出「产物页面」
scripts/lib/content-version.mjs  按文件夹名选择 polish 版本，站点、EPUB 与 CI 共用
scripts/resolve-polish-version.mjs  输出最新 polish 文件夹名（CI 入口，无需 npm 依赖）
scripts/prepare-site.mjs   页面 → site/chapters/*.md、site/toc.md、book.json
scripts/build-epub.mjs     页面 → dist/epub/《书名》{卷名}-孙齐宏译本-{版本号}.epub
scripts/build-all.mjs      固定同一个 polish 版本，再构建站点与 EPUB
scripts/epub.css           EPUB 排版样式
book.config.mjs            书目元数据与输入/输出路径
site/                      VitePress 站点源码（主题、阅读器、首页）
site/.vitepress/heading-attrs.mjs  标题属性清理（`### 标题 {#id .class}`）
```

`content.mjs` 同时负责把稿件的书写约定转成两种渲染器都认的 Markdown：

| 稿件写法 | 产物 | 说明 |
| --- | --- | --- |
| `⊂被标注文本⊃≼注释≽` | 站点：锚点文字 + 小蓝点；EPUB：`被标注文本^[注释]` | 站点锚点文字带灰色虚线下划线 |
| `≼注释≽` | 站点：小蓝点；EPUB：`^[注释]` | 注解保留在原文插入位置 |
| `*斜体*` / `**粗体**` | `<em>` / `<strong>` | 中文标点会让 Markdown 的强调语法失效，故直接转标签 |
| 单独一行 `🥒🥒🥒🥒🥒` | `<p class="scene-break">＊　＊　＊</p>` | 段间分隔 |
| 正文里的 `### …` | 站点：`<p class="chapter-subtitle">`；EPUB：允许解析 Markdown 的同名 `div` | 原书概要式副题，不进目录；两端均支持注解 |

注释语法见 [docs/标注.md](docs/标注.md)。

## 站点

- 注解由 `buildBook({ annotationStyle: 'popover' })` 生成，正文与章内副题均支持。`ReaderAnnotations.vue` 通过事件委托管理一个浮层：鼠标悬停临时显示，移开隐藏；点击后固定显示并启用遮罩，点击遮罩关闭；触屏仅响应点击，也可按 Escape 关闭。浮层会在视口内定位，长注解可以滚动。
- 阅读偏好（字号、行距、字体、主题、版心）与阅读进度都保存在 `localStorage`（`lost-time:reader-prefs:v2`、`lost-time:progress:v2`），不上传。
- 进度精确到段落 ID、段落文本哈希与段内偏移；译文改动导致段落编号变化时按哈希回退匹配。
- 全书总进度按页面字数加权。
- 所有页面顶部栏都提供下载 EPUB、GitHub 主仓库和页内目录面板；外部入口在新标签页打开。目录面板与 `/toc.html` 都来自 `book.json` 里的同一棵树，`心灵的间歇` 这类 3/4 级条目可直达锚点。非阅读页面不会采集段落或更新阅读进度。
- 阅读页顶部栏在下滚时向上收起，滚动不再触发重新显示；点击或触屏轻点阅读正文时重新显示，选取文字不会触发。目录或设置打开、键盘焦点进入顶部栏时保持显示。阅读进度条随顶部栏收放，段落定位按顶部栏当前可见高度计算。
- 全文搜索按段落做连续子串匹配：不拆中文词、不做模糊匹配，英文忽略大小写；空格分隔的关键词须在同一段出现。`prepare-site.mjs` 使用与页面相同的 Markdown 配置生成 `generated/search.json`，包含标题及正文段落，不包含隐藏注释。`paragraphs.mjs` 在渲染时按原阅读进度的规则生成 `p-000001` 锚点，`ReaderDock` 复用这些锚点。
- 保留 VitePress 本地搜索的入口与快捷键，通过 Vite alias 把 `VPLocalSearchBox.vue` 替换为 `ReaderSearch.vue`，停用默认的整章分词索引。首次实际查询才加载带全书索引的 Worker，之后复用；结果按书中顺序展示，每批 30 段，摘要围绕匹配位置截取并以文本节点安全高亮。升级 VitePress 时需要检查此组件替换入口。
- 搜索链接采用 `?search=查询文字#段落ID`；`ReaderSearchHighlight.vue` 在正文就绪后高亮并滚动到段内首个匹配位置，支持跨行内标签、同页跳转、刷新和返回。显式搜索定位优先于 `resume=1` 阅读恢复，不改动正文文本和注解事件。回归测试：`node --test scripts/tests/test_search.mjs`；浏览器验收需同时覆盖根路径和 GitHub Pages 子路径。正文改版后，旧链接的段落编号可能变化，应重新搜索。

## EPUB

构建使用 **Pandoc 3.10**。CI 从 Pandoc 官方 GitHub Release 安装此固定版本，并打印、核对版本号；本地也应使用同一版本。不要直接依赖 Ubuntu 的 `apt-get install pandoc`：旧版本的 EPUB 注解结构和无障碍角色与当前校验要求不同。升级 Pandoc 时，应同时运行下列样例测试及八本电子书的完整校验。

每本电子书的第一页是 `publish/版权页.md`；**书内不放读者可见的目录页**，目录只写进 EPUB 3 的 `nav.xhtml` 与 `toc.ncx`，阅读器可据此跳转。因此构建 pandoc 时不加 `--toc`（`--toc` 会把 nav 文档塞进阅读顺序），只给 `--toc-depth 4`。

产出：

| 文件 | 内容 |
| --- | --- |
| `《追忆似水年华》第一卷：在斯万家那边-孙齐宏译本-{版本号}.epub` 等七卷 | 单卷 |
| `《追忆似水年华》全七卷-孙齐宏译本-{版本号}.epub` | 全七卷合集 |
| `release-notes.md` | Release 正文 |

章节切分与站点一致：`--split-level 2` 让每个 2 级节点起一个 xhtml。

正文和概要式副题的注解统一转为上标编号。保留 EPUB 3 原生 `noteref` / `footnote` 语义及 `doc-noteref` / `doc-footnote` 无障碍角色：支持的阅读器点击编号弹出注解，其他阅读器通过链接跳转到对应章节末尾。弹窗外观由阅读器决定，不使用 JavaScript，也不通过 CSS 隐藏注解。

`scripts/epub-notes.lua` 为每条注解添加可见编号和带 `doc-backlink` 角色的“返回正文”链接。编号在每个分章 XHTML 文件中从 1 开始，副题与正文按出现顺序共同编号；返回锚点在每本书（包括合集）内唯一。过滤器的编号重置层级与构建脚本的 `--split-level 2` 保持一致。

验证命令（需要 Node、Pandoc 和 Python 3；Python 检查仅使用标准库）：

```bash
python3 -m unittest discover -s scripts/tests -p 'test_epub_*.py'
npm run build:epub
python3 scripts/check_epub_notes.py dist/epub --expect-books 8
```

检查会解析全部 XHTML，验证章内编号、全书返回锚点唯一性、注解语义和往返链接，以及目录等内部链接是否有效；CI 先运行样例测试，通过后构建并检查八本电子书，失败即停止发布。结构验证无法替代阅读器实测；验证弹窗时应记录阅读器名称、版本及操作结果。

## CI

| 工作流 | 触发 | 产物 |
| --- | --- | --- |
| `.github/workflows/deploy.yml` | `release` 分支推送 `polish/`（排除 `polish/dev/**`）、`publish/`、`site/`、`scripts/` 等，或在 `release` 分支手动运行 | GitHub Pages；仅正式 `polish/` 内容有变化时调用 EPUB 发布工作流 |
| `.github/workflows/release-epub.yml` | 由上述工作流在 push 含正式 `polish/` 变更时调用，仅允许 `release` 分支 | 8 个 EPUB，Release 标签与名称均为 polish 文件夹名 |

EPUB 发布条件由 `scripts/check-polish-changes.mjs` 比较 push 事件的 `before` 与 `after`，覆盖一次推送中的全部提交，检测 `polish/` 内除 `dev/` 以外的文件新增、修改或删除。只改站点、脚本、工作流等文件时只部署站点；手动运行没有 push 比较范围，也跳过 EPUB。版本检查任务拉取完整 Git 历史，无法比较提交时明确失败。相关回归测试：`node --test scripts/tests/test_polish_changes.mjs`。

CI 检出仓库后运行 `node scripts/resolve-polish-version.mjs`，排除 `dev` 后按文件夹名选出最新正式版本，通过 `POLISH_VERSION` 同时传给站点与 EPUB（满足发布条件时）。目录不存在或没有可用正式版本时立即失败，不回退到 `dev`。仅修改 `polish/dev/**` 不触发发布工作流；与其他构建文件一起修改或手动运行时，站点仍只使用正式版本，EPUB 须另行满足上述变更条件。EPUB 文件名、版权页、阅读器显示及 Release 标签和名称都直接使用该文件夹名；内容模型的 `book.buildVersion` 与 `book.version` 相同。不再生成独立的 CI 时间版本号，也不再递增语义版本标签。同一 polish 版本后续有正式稿变更时更新同名 Release。

本地 `npm run build:all` 只选择一次 polish 文件夹，传给站点和 EPUB 两个构建子进程。分别执行构建命令时，也默认按相同规则选择最新正式版本，或通过 `POLISH_VERSION` 指定同一个已有版本；`BUILD_VERSION` 不再生效。日常修订集中在 `dev`，正式时间戳目录由维护者发布时创建并保留旧版。手动选择其他分支运行 CI 时会跳过构建与发布。

版本选择与内容模型的回归测试：`node --test scripts/tests/test_content_version.mjs`。

`base` 由工作流按仓库名自动设置（项目站点为 `/<repo>/`，用户站点为 `/`）；自定义域名可在 **Settings → Secrets and variables → Actions → Variables** 里设 `VITEPRESS_BASE`。
