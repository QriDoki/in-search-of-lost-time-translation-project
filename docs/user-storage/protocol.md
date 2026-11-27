# 用户存储与同步系统 · 实施协议

> **⚠️ 部分已被取代（2026-11-28）**：本文的「永久段落 ID 注册表」（`publish/paragraph-map.json`、`scripts/assign-paragraph-ids.mjs`、`scripts/lib/paragraph-ids.mjs`）与「supersedes 谱系（lineage）」机制已**移除**，改为**位置编码段落 ID**（`{章节键}_{非空白行序号:0000}`，如 `vol1-1_0003`），无注册表、无构建期写入；定位管线降为四级（删除级别 3），旧格式 ID 走全文精确搜索兜底。现行实现以 `DEVELOPMENT.md`「用户存储与位置编码段落 ID」一节为准。本文其余部分（Dexie 存储、同步引擎、MSAL、导入导出、交互契约）仍有效，保留作历史施工合同。

本文是施工合同。后端开发者（数据与构建层）、后端测试、前端开发者、前端测试四方照此施工，互不越界。
权威输入：`plan.md`（总体设计）、`data-model.md`（数据建模）、`interaction.md`（交互设计）。
**本文与三份设计文档冲突时，以本文「偏离与决策记录」（§1）为准**；本文未覆盖的细节回落到设计文档。
所有路径相对仓库根 `/home/qri/lost-time-worktrees/user-storage`（分支 `codex/user-storage-20261127`）。

「后端」= 数据与构建层：构建期永久段落 ID、Dexie 存储、定位管线、同步引擎、MSAL 封装、导入导出。
「前端」= Vue 组件与 UI 接线。
接口契约（§3–§6）是两层的唯一耦合面；任何一方需要改契约，先修订本协议再动代码。

---

## 1. 偏离与决策记录

每条含：背景 → 裁决。施工者不得静默偏离。

### D1 法文底本语料缺失，永久 ID 基准改为中文内容管线
`raw-proust-corpus/` 被 `.gitignore` 排除且本机不存在（`scripts/split-proust-corpus.py` 的输入源缺失）。
data-model §2 假设以法文底本分配 ID，无法落地。裁决：

- 首次分配基准 = 现有内容管线产物：`buildBook()`（`scripts/lib/content.mjs` + `publish/arrange.json` + `polish/{版本}/chapters`）渲染出的每页 `<p>` 序列，按全书阅读顺序分配 `P000001` 起递增号。
- 注册表 `publish/paragraph-map.json` 仍**只增不改、随仓库版本化**；条目记录分配时的中文指纹（hash/len/head/tail）与位置（page/legacy），`fr` 字段保留为 `null`，待语料可得时由后续脚本补挂（补挂只写 `fr`，不动其他字段，不算违反只增不改）。
- 跨构建的段落身份维持靠 §2.4 的对齐算法（指纹 + 序列对齐 + 拆分/合并检测），不靠法文锚点。
- data-model §2.2 的 `hash` 语义改为「分配时中文段落文本的 FNV-1a 指纹」（原为法文）。

### D2 定位级别 3「Git 历史 Diff」改为 supersedes 谱系解析
纯前端无法访问 git 历史。级别 3 重定义为：查注册表 `supersedes` 谱系（旧 ID → 吸收它的新 ID），唯一命中取该候选，多命中交级别 4 裁决（与 data-model §2.2 解析规则一致）。五级管线其余不变（§5.3）。

### D3 指纹算法沿用现有 hashText：FNV-1a 32 位、base36、空白折叠
data-model §2.2 示例 hash 为 8 位 hex，但现有 `ReaderDock.hashText` 是 `(hash>>>0).toString(36)` 且先做 `replace(/\s+/g,' ').trim()`。裁决：**全系统统一沿用现有算法**（存量进度 `paragraphHash` 无需换算），函数名 `fnv1a36`，唯一实现放 `scripts/lib/fingerprint.mjs`，构建侧与浏览器侧共同导入（先例：`annotation-types.mjs` 已被 theme 导入）。
**NFC 归一化只用于偏移量基准**（data-model §2.3），不用于指纹。两套基准并存，见 §2.2。
黄金向量（两侧测试必须断言一致）：

| 输入 | fnv1a36 |
|---|---|
| `''` | `ztntfp` |
| `'很久以来，我都是早早就躺下了'` | `1mkkj7` |
| `'  贡布雷。  '` | `zer7p0` |
| `'Marcel Proust'` | `1xyq7u2` |
| `'　'`（U+3000） | `ztntfp` |
| `'áb'`（不做 NFC） | `etsjxr` |
| `'那是很久以前的事了，那时贡布雷的教堂'` | `1fe33xc` |

### D4 注册表治理：显式分配脚本，构建只读，CI 校验门禁
`npm run gen` / `build` **永不写注册表**（保证构建确定性、CI 无需提交）。分配由维护者显式运行 `node scripts/assign-paragraph-ids.mjs`（§2.6）。CI 增加 `--check` 步骤：最新正式版本存在未分配段落即失败，倒逼发布前先分配并提交注册表。

### D5 dev 独有段落用临时 T ID；版权页排除在永久 ID 体系外
- 注册表只从**正式版本**分配。dev 构建对齐后未命中的段落渲染为临时 ID `T` + 8 位 hex（内容哈希，§2.5），不进注册表、不可作为跨版本永久锚点（anchor 视同未锚定，走级别 2/5）。dev 内容转正后下次分配获得 P ID。
- 版权页（`copyright`）正文含 `版本: {buildVersion}`，每次发布必变，**不分配永久 ID**，保留旧位置 ID；前端在版权页禁用摘录/书签（`pageKind === 'copyright'`）。
- 卷首页（`vol{N}-00`）的 `title-fr` 段、场景分隔段（`scene-break`）、副题段（`chapter-subtitle`）**全部纳入**编号与对齐（与旧位置 ID 一一对应，legacy 索引才完整）。

### D6 注入点 = 渲染插件 + 生成映射；content.mjs 与 EPUB 零改动
永久 ID 在 `paragraphs.mjs` 的 `paragraphAnchorsPlugin` 渲染期注入（查 prepare-site 生成的映射表），不改 `content.mjs` 的块模型。EPUB 构建（`build-epub.mjs` → `buildBook({root})` → pandoc）不经过该插件，**EPUB 不注入永久 ID，产物与现状逐字节一致**。理由：把段落包成 raw HTML `<p>` 会破坏 pandoc 对 `^[脚注]` 的解析。

### D7 测试选型：vitest + fake-indexeddb + happy-dom + @vue/test-utils；禁 Playwright
仓库无 vitest；现有 `scripts/tests/*.mjs` 是 node:test，CI 入口 `node --test scripts/tests/*.mjs`（deploy.yml，Node 22）。裁决：

- 构建侧新测试沿用 node:test，放 `scripts/tests/`（CI 现有命令自动拾取，零新依赖）。
- 数据层与组件测试用 **vitest ^3.2.4**（已核实：vite 依赖 `^5||^6||^7`，与现有 vite 5.4.21 去重；engines 覆盖 CI Node 22 与本机 24；happy-dom peer 为 `*`）+ **fake-indexeddb ^6.2.8** + **happy-dom ^21.0.4** + **@vue/test-utils ^2.6.0** + **@vitejs/plugin-vue ^5.2.4**（编译 SFC，peer vite ^5||^6 已核实）。
- vitest 测试放仓库根 `tests/`，**不得**放 `scripts/tests/*.mjs`（会被 node --test 误拾取）。
- 前端测试禁止 Playwright（用户硬性要求）；关键交互用 happy-dom + VTU + 事件模拟覆盖（§7.4）。
- 全部新依赖放 `devDependencies`（沿用现有约定：私有包，运行时库全部构建期打包）。

### D8 DOCX 用 docx 库（懒加载）；fuzzy 用 diff-match-patch（懒加载）
- **DOCX：采用 `docx ^9.16.1`**（已核实版本，MIT，纯浏览器 Blob）。interaction §1.3.3 的体积顾虑用**动态 import 懒加载**化解：只在用户点「生成 DOCX」时加载独立 chunk，阅读主 bundle 零增量。Markdown 导出自研字符串拼接，零依赖，作为保底。不采用「打印成 PDF」降级。
- **Fuzzy：采用 `diff-match-patch ^1.0.5`**（Apache-2.0，`match_main` 即工业级模糊锚定）+ `@types/diff-match-patch ^1.0.36`（dev）。不自研「最长公共子串 + 编辑距离」：阈值调参与对抗测试成本高于引库，且 dmp 同样懒加载（仅级别 1–2 失败时加载）。

### D9 MSAL 无真实应用注册：配置占位 + 可注入 AuthProvider
`@azure/msal-browser ^5.30.0`（已核实 latest；P1 引入，动态 import）。clientId 来自构建期环境变量 `VITE_ONEDRIVE_CLIENT_ID`，缺省 `''` → 同步功能整体禁用（UI 显示「未配置」，不弹登录）。所有 MSAL API 收敛在 `auth.ts` 的 `AuthProvider` 接口后（§5.5）；测试注入 mock，永不触真实 OAuth。v5 的具体 API 面由 auth.ts 实现者核对官方文档，接口契约不变。

### D10 z-index 层序表修正
interaction §1.3.2 漏了现有 `.reader-note-select__options` 的 **z-index 100**（custom.css:815，Teleport 下拉菜单）。修正后的完整层序见 §6.2。新组件对号入座，不得改现有值。

### D11 localStorage 策略：prefs 永久双写，progress 迁移后冻结
- `prefs` **永久双写** localStorage `lost-time:reader-prefs:v2`：config.mts 的 head 内联脚本靠它防主题闪烁（同步读），不能断。它是「最后活跃账号的显示缓存」，账号切换时由 IDB 水合后覆写。
- `progress` 迁移成功后**停写** localStorage `lost-time:progress:v2`（冻结为回滚快照，键不删，两个大版本后清理）；IDB 权威。
- IndexedDB 不可用（隐私模式等）：整体回退 localStorage 模式（现有路径原样），永不迁移，面板常驻提示。
- 账号隔离由 IDB 库名保证（§5.2）；localStorage 缓存不参与同步、不上传。

### D12 ReadingPosition 增加可选字段
data-model §12 要求迁移失配标记 `needsRelocate`，但 §6.1 类型无此字段；§8.3 要求同刻比 `deviceId`，但 ReadingPosition 无 `deviceId`。裁决：两字段以可选形式补入（§3.4），旧数据缺失时按缺省规则处理。

### D13 CSP 暂缓
GitHub Pages 无法设置响应头；meta CSP 需 `unsafe-inline`（VitePress 内联脚本/样式），强度有限。P0/P1 不配置 CSP，以「零第三方脚本 + 依赖审计 + 独立 Origin」落实 plan §7 的意图；CSP 列为上线前硬化项（plan §9 已要求上线前实测）。

### D14 P0 的导入导出入口在摘录面板
云同步面板是 P1 产物。P0 期间「导出 ▾」菜单（含导出 JSON / 导入 JSON）挂摘录面板状态行；P1 云同步面板复用同一菜单组件。状态行 P0 恒为「仅保存在本机」。

### D15 If-Match 在 content PUT 上的支持需 P1 实测，契约不变
data-model §14 待定项。transport 契约（§5.6）强制 412 语义。P1 首个任务含真实 Graph API 验证 spike；若 content PUT 不支持 If-Match，降级协议：PUT 后立即 GET 校验 eTag，发现并发变化按冲突合并后重传（有界竞态窗口），并在面板提示。契约与测试矩阵不变（mock transport 始终按 412 语义测）。

### D16 冲突溢出文件命名与同步
`conflicts` 超 3 份时最旧副本转 `highlights/{id}.conflict-{n}.json`（n = 该记录最小未用正整数）。同步发现该命名模式的文件 → 下载并挂回父记录 `conflicts`；父记录被 GC 清除时溢出文件一并清除、同入 graveyard。

### D17 旧搜索链接降级兼容
搜索索引 ID 随插件改为 P ID 后，旧 `?search=…#p-000007` 链接失效。`ReaderSearchHighlight.vue` 允许增加一行回退：`getElementById(id)` 失败时查 `[data-legacy="${id}"]`。`data-legacy` 属性保留到 P2 结束再移除（data-model §2.1「一个版本后移除」放宽为两个阶段，覆盖迁移窗口）。P2 结束（F2-4）前端移除该回退；构建侧属性移除已完成（D34），迁移走 public map 不受影响。

### D18 未同步的「创建+删除」= 硬删除 + outbox 无操作
interaction §2.3 要求合并为无操作。裁决：记录从未上传（无 cloudState 且 baseEtag 为 null）时删除 → 硬删本地行、丢弃 outbox op、**不产生墓碑**（云端从未存在，无复活风险）。撤销 toast 持有完整记录快照，撤销 = 以原 id 重建（rev+1）。已同步过的记录删除一律软删除墓碑。

### D19 模块清单超出 interaction §1.3 命名的部分
新增 `merge.ts`（纯函数三方合并，独立可测）、`transport.ts`（Graph 收敛为可 mock 接口）、`config.ts`（配置注入点）、`util.ts`（UUID/编码/时钟）、`vue.ts`（liveQuery/状态响应式桥）、`index.ts`（初始化编排）。理由：测试合同要求合并规则全表可测、Graph 可 mock、配置可注入；混在 sync.ts 里无法隔离。前端新增 `ReaderConflictCard.vue`、`ReaderProgressBanner.vue`、`useToasts.ts`、`useSelection.ts`、`usePopoverPosition.ts`（后两者为 interaction 已要求的提取）。

### D20 ReaderAIEdit 收编方式：window 事件契约
浮动圆钮退役；组件保留 notice + Agent dialog，新增监听 `reader-ai-edit:trigger`（`CustomEvent<string>`，detail = 选区文本）。工具条 dispatch 该事件即触发原 `copyPrompt` 流程。组件不删、逻辑不改名，最小 diff。

### D21 revision 字段 = 内容版本号，不是 git SHA
data-model §4.1 注释称 revision 为「译本 Git Commit SHA」，但运行时客户端无从得知 SHA（manifest 只有 polish 文件夹名）。裁决：`Highlight.revision` / `Bookmark` 创建上下文中的 revision = `book.buildVersion`（如 `20261102182045` 或 `dev`）。注册表的 `revision` 字段仍是分配时的 git SHA（构建期可得，仅信息性）。

### D22 颜色：数据 5 色，P0 UI 4 色
data-model `HighlightColor` 含 pink（5 色），interaction 工具条/弹层只画 4 色。裁决：类型与 CSS token 支持 5 色（导入兼容）；P0 UI 展示 yellow/green/blue/purple 4 色，pink 仅经导入产生、弹层色板 P2 补齐第 5 色。

### D23 合并字段集与身份字段
`selector`/`textHash`/`revision` 按 data-model §8.1 作为**整体字段**（anchorBundle）参与合并。`id/schemaVersion/kind/chapterId/paragraphId` 为身份字段：同 id 记录身份字段不一致视为对抗数据，保留本机整条、远端整条存为冲突副本，不做字段级合并。

### D24 重叠高亮 P0 禁止创建
interaction §13：P0 选区与已有高亮重叠 → 提示「此处已有摘录」并打开已有弹层，不创建；P2 放开重叠与叠加渲染。同范围同色重复创建 → 直接打开已有弹层（interaction §2.4）。

### D25 GC 时钟风险接受
墓碑 90 天 GC 用本机时钟判定（data-model §8.4）。快钟设备可能提前清除，但 graveyard 传播保证删除事实不丢（无复活），仅缩短「撤销删除」窗口。接受，测试覆盖边界即可。

### D26 进度落库节流沿用 650ms
data-model §6.1 写「滚动停止 5s」，现有 `scheduleSave` 为 650ms 防抖 + pagehide/路由切换强制落盘。沿用 650ms（更频繁、单行写入成本可忽略），同步队列另有 3s 防抖（§5.4）。

### D27 base64url 与 URL 预算
SharePayload 编码 = base64url(UTF-8 JSON)，无填充 `=`。整 URL ≤ 2000 字符；超限先省 `b`/`a`，再截 `q`（下限 50 字符），仍超限报错不生成。`q` 创建时超 200 字符即截断（data-model §10）。

### D28 导出到 OneDrive 的文件名沿用 plan
`exports/我的摘录.docx`（Graph 路径 encodeURIComponent，UTF-8 安全），每次生成无条件覆写。

### D29 类型检查引入 typescript（devDependency）
任务质量门槛要求 `npx tsc --noEmit` 无类型错误，但 §7.1 依赖清单未含 typescript，仓库亦无 tsconfig（VitePress 用 esbuild 转译，不做类型检查）。裁决：新增 `typescript ^5.9.3`（dev，仅类型检查，不进运行时 bundle）与仓库根 `tsconfig.json`（scope 限定 `user-storage/`、`reader.ts`、`tests/storage/`，`allowJs` 推断 `.mjs` 导入，`resolveJsonModule` 读 generated/books.json）。不检查 `.vue`（需 vue-tsc，超出本协议范围）。理由：满足质量门槛 5 且不引入运行时依赖。

### D30 D15 真实 Graph spike 状态：上线前待实测
本机无 Azure 应用注册与凭证，B1-1 的真实 Graph API spike（If-Match content PUT / 分页 / eTag）**无法执行**，记为「上线前待实测」（与 plan §9 末段一致）。transport.ts 按 §5.6 契约实现并以注入 fetch 的 mock 矩阵覆盖 412/If-Match/If-None-Match/分页/错误语义；若上线实测发现 content PUT 不支持 If-Match，按 D15 降级协议（PUT 后 GET 校验 eTag）处理，契约与测试矩阵不变。
另：EPUB 不变性验证用本机 pandoc 3.1.3（CI 为 3.10）；改动前后各跑一次 `build:epub` 对比哈希，同版本 pandoc 下逐字节一致即证明本次改动零影响（pandoc 版本差异不影响「改动前后一致」这一命题）。

### D32 迁移哈希校验交由定位管线运行时执行（public map 不携带哈希）
§5.2 迁移步骤 2 要求「旧 hash 与映射目标段 hash 比（raw/NFC 双基准）」，但 §2.8 的浏览器端 public map 格式为 `{ pages: { [pageId]: string[] } }`，**只含 ID 不含哈希/文本**，迁移时（DOM 未必就绪）无从取得目标段哈希。裁决：migrateLegacyData 按 legacy 索引映射 ID，索引越界/缺失 → 保留旧值 + `needsRelocate:true`；**哈希漂移检测推迟到运行时定位管线**（resolveHighlight 级别 1 的 `hash===textHash` 校验，失配自动降级级别 2+）。`legacyHashMatches(oldHash, targetText)` 辅助函数保留，供持有目标文本的调用方做双基准校验。理由：public map 体积与格式约束下，运行时检测等价覆盖「失配不静默错关联」。

### D33 前端内部协调事件与附加导出（前端施工补充）
背景：§6.5 事件表只覆盖工具条→AIEdit 与两弹层互斥；实际施工中还需要「打开摘录弹层」「打开面板」「失效计数上报」「重锚模式抑制工具条」四条前端内部协调通道，且云同步面板需要登录/登出入口、断开可选清除账号库、摘录集导出需要 barrel 暴露 B2-2 产物。裁决（全部为**加法**，不改既有契约语义）：

- 新增 window 事件（均为 `CustomEvent`，前端组件间协调，不跨层）：
  | 事件 | detail | 方向 |
  |---|---|---|
  | `reader-highlight:open` | `{ id: string; startInEdit?: boolean; flash?: boolean }` | 工具条/面板/分享 → ReaderHighlightPopover |
  | `reader-panel:open` | `ReaderPanel`（非 null） | 弹层「未同步」小字/状态行 → Layout |
  | `reader-excerpts:degraded` | `{ count: number }` | 摘录层/面板 → Layout（红点） |
  | `reader-reanchor:active` | `boolean` | ReaderHighlightPopover → 工具条（重锚期间抑制创建） |
- 新增前端共享组件 `theme/components/ReaderDataTools.vue`：导出▾菜单 + JSON 导入预览对话框 + 摘录集生成对话框（P2），供 ReaderExcerpts（D14）与 ReaderSyncPanel 复用。归属前端，列入 §4.2。
- 数据层**附加导出**（不改任何既有函数签名/语义，storage 测试保持全绿）：
  - barrel 补出 `buildMarkdownExcerpt / buildDocxExcerpt / ExcerptItem / ExcerptOptions`（B2-2 已实现但未导出）、`SelectionAnchor / AnchorContext / VersionMap` 类型、`loadFuzzyMatcher`、`SyncEngine / SyncReport` 类型、`deepClone`（响应式 Proxy 入 IDB 前需纯对象化）。
  - `index.ts` 补 `getSyncAuth(): AuthProvider | null`（返回编排中的同一 auth 实例；面板登录/登出必须走它，第二实例不共享 MSAL 内存会话）。
  - `db.ts` 补 `deleteScopeDatabase(scope): Promise<void>`（Dexie.delete；仅用于断开连接时用户显式勾选「清除本机缓存的云端数据」）。
- F2-4 归属拆分：`data-legacy` 的**构建侧移除**属 paragraphs.mjs（后端禁改区），前端只移除 ReaderSearchHighlight 的 legacy 回退（D17）；构建侧属性移除记为遗留项交后端，迁移本就走 public map（D32），不受影响。

### D34 F2-4 构建侧 data-legacy 移除完成（D17 窗口结束）
背景：D17/D33 将 `data-legacy` 保留到 P2 结束（F2-4）再移除；前端已移除 ReaderSearchHighlight 的 legacy 回退（零 diff）。裁决：构建侧 `paragraphs.mjs` 的插件命中分支与 `rewriteParagraphIds` **不再输出 `data-legacy` 属性**，渲染产物为 `<p id="P…">`（copyright/映射缺失回退仍为旧位置 ID `p-00000N`，本就不带 data-legacy）。
- 全仓 grep 确认无其他代码依赖渲染 `data-legacy`：前端组件零依赖；`anchor.ts` 的 `collectAnchorParagraphs` 仍读 `node.dataset.legacy ?? ''`（属性缺失时优雅返回 ''，`ParagraphInfo.legacy` 契约字段保留，不参与定位逻辑）；注册表 `zh.legacy` 是对齐用的 legacy 索引，与渲染属性无关，保留。
- 存量进度迁移走 `paragraph-ids-{version}.json` 的页内 ID 序（legacy 索引，D32），不依赖渲染属性，不受影响。
- §2.1/§2.7/§2.8 措辞同步去掉 data-legacy 输出描述；`test_paragraph_plugin.mjs` 改为「无 data-legacy」守护。

### D31 拆分/合并检测以 head/tail/len 启发式为准（注册表不携带全文）
§2.4 第 3 步的 `stripWs(o1.text)+stripWs(o2.text)===stripWs(n.text)` 分支需要旧段落全文，但 §2.3 注册表只存 hash/len/head/tail，不存 text。裁决：alignPage 的 old 侧来自注册表，**以「或」之后的 head/tail/len 启发式分支为实际判定**；text 拼接分支仅在 old 条目额外提供 `text` 时（如测试 fixture）才参与。另加空段守卫：启发式要求参与段落 `len>0`，避免场景分隔段（head/tail 均空、len 0）被误判为拆分/合并。扫描序确定：先合并（按 new 序、取未配 old 列表中相邻两两），后拆分（按剩余 old 序、取未配 new 列表中相邻两两）。

---

## 2. 构建侧协议（归属：后端）

### 2.1 产物与文件清单

| 文件 | 新增/修改 | 职责 |
|---|---|---|
| `scripts/lib/fingerprint.mjs` | 新增 | `fnv1a36` / `normalizeWs` 唯一实现（构建 + 浏览器共用） |
| `scripts/lib/paragraph-ids.mjs` | 新增 | 段落枚举、对齐、分配、临时 ID、legacy 索引（纯函数，node:test 可测） |
| `scripts/assign-paragraph-ids.mjs` | 新增 | 分配 CLI：`--version` / `--bootstrap` / `--check`；唯一写注册表的入口 |
| `publish/paragraph-map.json` | 新增（入库） | 永久 ID 注册表，只增不改 |
| `site/.vitepress/paragraphs.mjs` | 修改 | 插件注入 P/T ID（D34 起不再输出 `data-legacy`）；导出映射设置函数 |
| `scripts/prepare-site.mjs` | 修改 | 每版本对齐、写生成映射与 public 资产、搜索 HTML ID 改写 |
| `site/.vitepress/generated/paragraph-ids.json` | 生成（gitignore） | 渲染插件查表：`{ [version]: { [pageId]: string[] } }` |
| `site/public/reader/paragraph-ids-{version}.json` | 生成（gitignore） | 浏览器端映射（迁移 + pid→page 路由） |
| `site/public/reader/paragraph-lineage.json` | 生成（gitignore） | supersedes 倒排索引（版本无关） |
| `scripts/tests/test_paragraph_ids.mjs` | 新增 | 对齐/分配/稳定性测试（node:test） |
| `scripts/tests/test_fingerprint.mjs` | 新增 | 黄金向量 + 边界（node:test） |
| `.github/workflows/deploy.yml` | 修改 | 加 vitest 步骤与 `--check` 步骤（§7.5） |
| `package.json` | 修改 | 依赖与 scripts（§7.1） |
| `DEVELOPMENT.md` | 修改 | 新命令、注册表治理、ID 体系说明 |

**禁改**：`scripts/lib/content.mjs`、`scripts/build-epub.mjs`、`scripts/lib/content-version.mjs`、`book.config.mjs`、`publish/arrange.json`、`site/.vitepress/markdown.mjs`、`site/.vitepress/config.mts`、`site/.vitepress/search.mjs`。EPUB 产物必须与改动前逐字节一致（CI 现有 EPUB 校验兜底）。

### 2.2 文本基准（两套，不得混用）

- **指纹基准**（hash / textHash / paragraphHash / 注册表 hash）：`fnv1a36(rawText)`，内部先 `normalizeWs` = `replace(/\s+/g,' ').trim()`。与现有 `hashText` 逐位一致（D3 黄金向量）。
- **偏移量基准**（offset/start/end/head/tail/len）：`nfc(rawText)` = `rawText.normalize('NFC')` 后的 UTF-16 code unit 下标。
- 构建侧 `rawText` = `visibleText(段落 innerHTML)`（paragraphs.mjs 现有函数：去注释/锚点链接/script/style/标签 + 解码实体）。
- 浏览器侧 `rawText` = `paragraph.textContent`（DOM 已解码实体；注解 trigger 按钮文本为空、注记在 data 属性里，不混入）。两者对同一渲染产物相等，测试断言。
- 场景分隔段 `　` 指纹 = `ztntfp`（空串指纹），对齐时按位置处理，**禁止参与跨页哈希救援**（§2.4 第 5 步）。

### 2.3 注册表格式 `publish/paragraph-map.json`

```jsonc
{
  "schemaVersion": 1,
  "revision": "<分配时 git rev-parse HEAD，仅信息性>",
  "nextIndex": 5124,                    // 下一个可用号；单调不减
  "paragraphs": {
    "P000001": {
      "zh": { "page": "vol1-00", "legacy": "p-000001" },  // 分配时位置，永不更新
      "hash": "ztntfp",                 // 分配时中文指纹（fnv1a36）
      "len": 12,                        // 分配时 NFC 文本长度
      "head": "在斯万家那边",            // NFC 文本前 24 字符（不足取全）
      "tail": "……",                    // NFC 文本后 24 字符
      "fr": null,                       // 保留；语料可得时补挂 { file, index }
      "supersedes": []                  // 本段吸收的旧 ID（拆分/合并时非空）
    }
  }
}
```

不变量（测试断言）：
1. 条目一旦写入，除补挂 `fr` 外**任何字段不得修改**；删除的段落条目保留（号不复用）。
2. `supersedes` 只出现在**新铸造**的条目上。
3. `nextIndex` 单调；ID 格式 `P` + 6 位十进制（上限 999999，当前全书约 5 千段，余量充足）。
4. JSON 序列化：2 空格缩进、`paragraphs` 键按 ID 升序、文件以 `\n` 结尾（diff 友好）。
5. `copyright` 页段落永不入注册表。

### 2.4 对齐算法（`alignVersion`，纯函数，确定性）

输入：某版本每页的段落列表（渲染序）+ 注册表。输出：每页 ID 列表 + 报告。

```
enumerateParagraphs(renderedHtml) →
  按出现顺序正则匹配 /<p(?=[\s>])([^>]*)>([\s\S]*?)<\/p>/gi
  每项：{ index, attrs, innerHtml, text: nfc(visibleText(innerHtml)),
          hash: fnv1a36(visibleText(innerHtml)), len, head, tail }
  与插件的 <p> 替换顺序一一对应（含 scene-break / chapter-subtitle / title-fr）。

alignPage(oldEntries, newParas)：
  old = 注册表中 zh.page === pageId 的条目，按 zh.legacy 数字升序
  1. 哈希锚定：对 old.hash 序列与 new.hash 序列求 LCS（标准 DP，平局优先对角线），
     得到锚定配对（文本未变的段落）。
  2. 间隙相似度匹配：锚点之间的间隙内，对每对 (o, n) 计算
       headSim = 公共前缀(o.head, n.head).length / max(o.head.length, n.head.length, 1)
       tailSim = 公共后缀(o.tail, n.tail).length / max(o.tail.length, n.tail.length, 1)
       lenRatio = min(o.len, n.len) / max(o.len, n.len, 1)
       score = 0.4 * headSim + 0.3 * tailSim + 0.3 * lenRatio
     取 score ≥ 0.6 的候选对，按 (-score, oIndex, nIndex) 全序排序，贪心接受（双方均未配才接受）。
     → 轻微编辑的段落保住原 ID。
  3. 拆分/合并检测（仅相邻、仅两两，确定性扫描序）：
     合并：相邻未配 old (o1, o2) + 未配 new n，若
       stripWs(o1.text) + stripWs(o2.text) === stripWs(n.text)
       或（n.head 前缀匹配 o1.head 且 n.tail 后缀匹配 o2.tail 且 |n.len - o1.len - o2.len| ≤ 2）
       → n 标记 supersedes: [o1.id, o2.id]
     拆分：未配 old o + 相邻未配 new (n1, n2)，对称判定 → n1、n2 各 supersedes: [o.id]
     不满足 → 视为删 + 增（安全侧：定位管线级别 2+ 兜底）。
  4. 剩余未配 new → unassigned；剩余未配 old → retired（条目保留）。
  5. 跨页救援（全部页对齐后，全局）：unassigned 且 stripWs(text) !== '' 的 new，
     在全局未配 old 中找 hash 相等者：唯一 → 配对（报告 moved）；多个 → 放弃（不自动挑）。
     注册表 zh 字段不因此更新（D1：分配时位置不可变；后续构建靠全局哈希救援）。
```

确定性要求：所有排序有全序 tie-break；同输入重复运行输出逐字节相同（测试断言）。

### 2.5 临时 ID（dev 未分配段落）

```
provisionalId(pageId, text, usedSet):
  base = 'T' + fnv1a32hex(pageId + '\u0000' + nfc(text))   // 8 位 hex，FNV-1a 32 位
  若 base 已在 usedSet → 依次试 base + '-2', '-3'…（渲染序确定性）
```
同内容同页 → 跨构建、跨版本稳定；不进注册表；anchor.ts 见 `T` 前缀按「无永久锚点」处理（级别 2 精确匹配仍可用）。

### 2.6 分配脚本 `scripts/assign-paragraph-ids.mjs`

```
node scripts/assign-paragraph-ids.mjs                 # 对最新正式版本增量分配
node scripts/assign-paragraph-ids.mjs --version NAME  # 指定正式版本（禁 dev）
node scripts/assign-paragraph-ids.mjs --bootstrap     # 首次：全部正式版本按文件夹名升序依次分配
node scripts/assign-paragraph-ids.mjs --check         # 只读校验，CI 门禁用
```

流程：`buildBook({ root, version, annotationStyle: 'popover' })` → 每页用与 prepare-site 相同的渲染器渲染 → `enumerateParagraphs` → `alignVersion` → 对 unassigned 按**全书阅读顺序**（book.pages 顺序 × 页内序）铸造新 P ID（含 supersedes 标记）→ 写注册表（§2.3 格式）。
`--bootstrap` 从最旧正式版本开始逐版分配，使谱系（supersedes）完整、旧版本段落全覆盖。
`--check`：对齐最新正式版本，存在任何 unassigned（含场景分隔段）→ 打印清单、exit 1；否则 exit 0。不写文件。
脚本拒绝 `--version dev`；拒绝在 `GITHUB_ACTIONS=true` 时写注册表。

### 2.7 渲染插件改造（`paragraphs.mjs`）

```js
// 新增导出
export function setParagraphIdMap(map)   // prepare-site 计算后注入（进程内）
export function resetParagraphIdMap()    // 测试用
// paragraphId(index) 与 visibleText / extractSearchRecords 签名不变

paragraphAnchorsPlugin(md)：
  懒加载 site/.vitepress/generated/paragraph-ids.json（fs，一次性；进程内缓存）
  env.relativePath 解析：/^(?:versions\/([^/]+)\/)?chapters\/(.+)\.md$/ → version（缺省 'dev'）+ pageId
  copyright 页或映射缺失 → 旧行为（id = p-00000N，无 data-legacy），首次 console.warn 一次
  命中 → 第 index 个 <p> 输出（D34 起不再输出 data-legacy）：
    <p{attrs 去原 id} id="{ids[index]}">
  ids[index] 为 P 或 T ID；数组长度与 <p> 数不一致 → 整页回退旧行为 + warn（防御）
```

`extractSearchRecords` 不改：它读 `id` 属性，自动获得 P/T ID，搜索索引与页面锚点一致。

### 2.8 prepare-site 接线

在现有每版本循环内（`writePages` 之后、搜索记录生成处）：

1. 渲染每页 HTML（现有 `md.render`，此时插件处于 legacy 模式——generated 映射尚未注入）。
2. `enumerateParagraphs(html)` → `alignVersion(注册表)` → 得每页 ids（unassigned → provisionalId）。
3. 累积写 `generated/paragraph-ids.json`（全部版本算完后一次写入）。
4. 搜索记录：对已渲染 HTML 按序改写 `<p>` 的 id 为 P/T（字符串替换，不二次渲染；D34 起无 data-legacy），再 `extractSearchRecords`。
5. 写 public 资产：
   - `site/public/reader/paragraph-ids-{version}.json` = `{ schemaVersion: 1, version, pages: { [pageId]: string[] } }`（copyright 页不含）。
   - `site/public/reader/paragraph-lineage.json` = `{ schemaVersion: 1, supersedes: { [oldId]: string[] } }`（注册表 supersedes 倒排，仅非空条目；版本无关，每构建覆写）。
6. 注册表缺失（首次 checkout 未 bootstrap）→ 全部段落走 provisionalId + 醒目 warn，构建不失败（CI 的 `--check` 步骤负责拦截）。

浏览器端获取：`fetch(withBase('/reader/paragraph-ids-' + book.contentVersion + '.json'))`，按版本缓存；lineage 同理。离线首载失败 → 迁移推迟到下次启动（§5.2），阅读不受影响。

### 2.9 多版本一致性

同一注册表对齐所有版本：文本相同的段落在 dev 与 `/versions/{v}/` 获得**同一 P ID**（哈希锚定保证）；编辑过的段落靠相似度匹配保 ID。分享 URL 用分享者当前版本前缀（`versionPrefix`），落地者在其当前版本解析；P ID 跨版本稳定，payload 不含版本字段（data-model §10 原样）。版本切换是整页导航（ReaderVersionMenu 现状），`#share=` fragment 随 `versionUrl` 保留（现有代码已保留 hash）。

---

## 3. 类型契约（`user-storage/types.ts`，归属：后端）

照抄 data-model 并补全局部细节（补全处注释标明）。所有类型从此文件导出；前端不得另造实体类型。

```typescript
/* ---------- 基础 ---------- */
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'
export type EntityKind = 'highlight' | 'bookmark' | 'progress' | 'settings'
export type Scope = string   // 'anon' | 'ms-' + sha256(graphUser.id).hex.slice(0,16)

export interface Selector {
  exact: string              // kind='note' 时 ''；跨段以 '\n' 连接；≤ 10000 字符
  prefix: string             // ≤ 32 字符（创建时截断）
  suffix: string             // ≤ 32 字符
  start: { paragraphId: string; offset: number }   // NFC UTF-16 下标
  end:   { paragraphId: string; offset: number }
}

export type HighlightSnapshot = Pick<Highlight, 'note' | 'types' | 'color' | 'selector' | 'deletedAt'>
export type BookmarkSnapshot = Pick<Bookmark, 'label' | 'deletedAt'>
export interface ConflictCopy<S = HighlightSnapshot> {
  deviceId: string
  rev: number
  updatedAt: string
  keptAt: string
  snapshot: S
}

export interface SelectorHistoryEntry {   // D19/interaction §9.2：手动重锚保留原始锚点
  selector: Selector
  revision: string
  textHash: string
  replacedAt: string
}

export interface Highlight {
  id: string                 // UUIDv7
  schemaVersion: 1
  kind: 'highlight' | 'note'
  chapterId: string          // = pageId
  paragraphId: string        // = selector.start.paragraphId（冗余索引）
  revision: string           // = book.buildVersion（D21）
  textHash: string           // fnv1a36(起始段 rawText)
  selector: Selector
  note: string               // ≤ 20000 字符
  types: string[]            // annotation-types.mjs 枚举（sanitizeAnnotationTypes）
  color: HighlightColor
  createdAt: string          // ISO 8601 UTC ms
  updatedAt: string
  deletedAt: string | null
  rev: number
  deviceId: string
  conflicts?: ConflictCopy[]           // ≤ 3；溢出见 D16
  selectorHistory?: SelectorHistoryEntry[]  // ≤ 5，溢出丢最旧；仅重锚时追加
  [unknown: string]: unknown           // 未知字段原样保留回写（解析时不丢弃）
}

export interface Bookmark {
  id: string
  schemaVersion: 1
  chapterId: string
  paragraphId: string
  label: string              // 可 ''；唯一可编辑内容字段
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  rev: number
  deviceId: string
  conflicts?: ConflictCopy<BookmarkSnapshot>[]
  [unknown: string]: unknown
}

/* ---------- 仅本地块（上传前剥离） ---------- */
export interface LocalOnly {
  local: {
    dirty: 0 | 1
    baseEtag: string | null
    baseSnapshot: Record<string, unknown> | null   // 三方合并共同祖先（云端结构）
    readOnly?: 'higher-schema'                     // 远端 schemaVersion 更高时置位
  }
}
export type LocalHighlight = Highlight & LocalOnly
export type LocalBookmark = Bookmark & LocalOnly

/* ---------- 进度与设置 ---------- */
export interface ReadingPosition {
  pageId: string
  paragraphId: string        // 迁移后为 P ID；失配保留旧值
  paragraphHash: string
  offset: number             // 0–1
  pageProgress: number       // 0–1
  maxProgress: number        // 单调不减
  updatedAt: string
  deviceId?: string          // D12 补全：同刻合并 tie-break
  needsRelocate?: boolean    // D12 补全：迁移失配标记，下次成功保存即清除
}
export interface ProgressDoc {
  schemaVersion: 1
  last: ReadingPosition | null
  pages: Record<string, ReadingPosition>
}
export interface SyncedPrefs {
  fontSize: number
  lineHeight: number
  fontFamily: 'serif' | 'sans' | 'kai'
  theme: 'paper' | 'light' | 'sepia' | 'dark'
  annotationTypes: string[]
}
export interface SettingsDoc {
  schemaVersion: 1
  prefs: SyncedPrefs
  stamps: Record<string, { t: string; d: string }>   // 每字段 {时间, 设备}
}
export interface DevicePrefs { width: number }        // settings 表 key='device'，不同步

/* ---------- 同步 ---------- */
export interface OutboxOp {
  seq?: number
  entity: EntityKind
  id: string                 // progress/settings 固定 'doc'
  type: 'put' | 'delete'
  createdAt: string
}
export interface CloudStateRow {
  id: string                 // 记录 uuid；文档用 'progress' | 'settings' | 'graveyard'
  eTag: string
  syncedRev: number
  purged?: boolean
}
export interface GraveyardDoc {
  schemaVersion: 1
  entries: Record<string, { purgedAt: string }>       // 按 id 并集，同 id 取较早 purgedAt
}
export type SyncState =
  | 'disconnected' | 'synced' | 'syncing' | 'pending'
  | 'offline' | 'conflict' | 'error' | 'paused' | 'needs-auth'
export interface SyncStatus {
  state: SyncState
  pending: number            // outbox 长度
  conflicts: number          // 含 conflicts 的存活记录数
  lastSyncAt: string | null
  lastError: string | null
  unknownFiles: boolean      // 云端目录存在本应用之外的文件（interaction §11）
}
export interface ConflictInfo {
  entity: 'highlight' | 'bookmark'
  id: string
  current: Highlight | Bookmark          // 本机当前值（合并胜者）
  copies: ConflictCopy<HighlightSnapshot | BookmarkSnapshot>[]   // 待处理败者副本
}

/* ---------- 导入导出 ---------- */
export interface ExportEnvelope {
  format: 'proust-reader-export'
  formatVersion: 1
  app: { name: 'proust-reader'; buildVersion: string }
  exportedAt: string
  scope: Scope               // 仅参考，导入不强制匹配
  data: {
    highlights: Highlight[]  // 含墓碑与 conflicts；无 local 块、无 token、无邮箱
    bookmarks: Bookmark[]
    progress: ProgressDoc
    settings: SettingsDoc
  }
}
export type ImportStrategy = 'local' | 'import' | 'both'
export interface ImportPreview {
  added: number; updated: number; skipped: number
  conflicts: { id: string; entity: 'highlight' | 'bookmark'; localUpdatedAt: string; importUpdatedAt: string }[]
}
export interface ImportResult { added: number; updated: number; skipped: number; conflictsKept: number }

/* ---------- 永久链接 ---------- */
export interface SharePayload {
  v: 1
  c: string                  // chapterId
  s: string                  // start.paragraphId
  e?: string                 // end.paragraphId（同段省略）
  q: string                  // exact（≤ 200 字符，超限截断）
  b?: string                 // prefix
  a?: string                 // suffix
}

/* ---------- 定位 ---------- */
export interface ParagraphInfo {
  id: string                 // P / T / legacy ID（DOM 实际 id）
  legacy: string             // data-legacy（可 '')
  text: string               // NFC rawText
  hash: string               // fnv1a36(rawText)
  node: HTMLElement
}
export interface ParagraphRange { paragraphId: string; start: number; end: number }
export type AnchorResult =
  | { status: 'exact'; level: 1 | 2; ranges: ParagraphRange[] }
  | { status: 'fuzzy'; level: 3 | 4; ranges: ParagraphRange[] }   // UI「已重新定位」
  | { status: 'paragraph'; level: 5; paragraphId: string }        // UI「定位失效」
  | { status: 'missing' }                                          // UI「段落已不存在」
export interface LineageIndex { supersedes: Record<string, string[]> }

/* ---------- 面板（前端共用） ---------- */
export type ReaderPanel = 'toc' | 'settings' | 'excerpts' | 'sync' | null

/* ---------- 配置 ---------- */
export interface UserStorageConfig {
  clientId: string           // '' = 未配置，同步禁用
  authority: string          // 缺省 'https://login.microsoftonline.com/common'
  redirectUri: string        // 缺省 window.location.origin
  appFolder: string          // 缺省 'Proust Reader'（仅展示文案用；Graph approot 由 scope 决定）
}

/* ---------- 认证 ---------- */
export interface AuthAccount {
  scope: Scope               // 'ms-' + sha256hex(graphUser.id).slice(0,16)
  displayName: string
  email: string              // 仅本地展示，永不上传/导出
}
export class AuthError extends Error {
  constructor(message: string, public code: 'needs-login' | 'not-configured' | 'popup-closed' | 'network') { super(message) }
}
export interface AuthProvider {
  init(): Promise<void>                       // 恢复缓存会话（静默）
  current(): AuthAccount | null
  login(): Promise<AuthAccount>               // popup；失败抛 AuthError
  logout(): Promise<void>
  getToken(): Promise<string>                 // 静默获取/续期；失败抛 AuthError('needs-login')
  onChange(cb: (account: AuthAccount | null) => void): () => void
}

/* ---------- Graph transport（唯一外部 IO 面，可 mock） ---------- */
export class GraphError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) { super(message) }
}
export interface GraphItem { name: string; eTag: string; id: string }
export type GraphFolder = 'highlights' | 'bookmarks' | 'exports' | 'root'
export interface GraphTransport {
  list(folder: GraphFolder): Promise<GraphItem[]>        // 内部分页（@odata.nextLink），携带 eTag
  read(path: string): Promise<{ body: string; eTag: string } | null>   // 404 → null
  write(path: string, body: string | ArrayBuffer, cond?: { ifMatch?: string; ifNoneMatch?: '*' }): Promise<{ eTag: string }>
  remove(path: string, cond?: { ifMatch?: string }): Promise<void>
}
// path 相对 approot，如 'highlights/{id}.json'、'progress.json'
// 错误语义：401 → GraphError(401,false)；404 → read 返回 null / remove 幂等成功；
// 412 → GraphError(412,false)（冲突）；429/5xx/网络 → retryable=true
```

### 3.1 全局不变量（所有模块必须遵守，测试对抗覆盖）

1. `selector` 永不自动改写；重定位只产出运行时 `AnchorResult`，不回写记录。仅显式重锚生成新 selector（rev+1，旧锚点入 `selectorHistory`）。
2. outbox 只存指针不存载荷；载荷以实体表当前值为准。
3. 上传前剥离 `local` 块；下载后重建（baseEtag/baseSnapshot 来自本次同步结果）。
4. 未知字段原样保留并回写。
5. graveyard 中的 id：丢弃一切版本（含离线迟到上传），永不复活。
6. 账号库隔离；`claimedBy` 置位的 anon 库只读。
7. 导入永不整库覆盖；逐条合并。
8. 远端 `schemaVersion` 更高 → 本地只读展示，禁编辑禁上传。
9. 合并败者进 `conflicts`，系统永不自动丢弃（用户显式丢弃除外）。
10. 设备时钟不可信：时间戳仅用于展示与同设备排序；跨设备裁决按 §5.4 判定表（updatedAt 比较是**合并规则的一部分**，不是信任时钟——两侧都改且不同才比，败者不丢）。
11. 注册表只增不改；构建不写注册表；EPUB 不注入 ID。
12. mark 清理各认各的 data 标记：`mark.reader-highlight[data-reader-highlight]`（用户）、`mark[data-reader-search]`（搜索）、`mark[data-reader-share]`（分享），互不误删，允许嵌套。
13. 同步失败不阻塞阅读、不丢本地数据。
14. 同段摘录创建时 `exact === nfcText.slice(start.offset, end.offset)`；跨段逐段校验，任一段失配整体降级。

---

## 4. 模块分解与文件归属

### 4.1 新增文件（后端 = 数据层，全部在 `site/.vitepress/theme/composables/user-storage/`）

| 文件 | 职责 | 依赖（仅允许向下） |
|---|---|---|
| `types.ts` | §3 全部类型 | 无 |
| `util.ts` | uuidv7/v4、base64url、sha256Hex、nowIso、deepEqual、nfc；re-export fingerprint.mjs | types, scripts/lib/fingerprint.mjs |
| `config.ts` | 配置注入点（§5.1） | types |
| `db.ts` | Dexie 库、scope、CRUD、outbox 合并、迁移、认领（§5.2） | types, util, dexie |
| `merge.ts` | 纯函数三方合并全表（§5.4）；**零 IO、零 dexie 依赖** | types, util |
| `anchor.ts` | 五级定位、mark 渲染、DOM 偏移映射、重锚（§5.3） | types, util, ../../search.mjs, scripts/lib/fingerprint.mjs；P2 懒 import diff-match-patch |
| `transport.ts` | GraphTransport 实现（fetch）（§5.6） | types, config, auth（仅 getToken 注入） |
| `auth.ts` | AuthProvider + MSAL 封装（懒 import）（§5.5） | types, config, util |
| `sync.ts` | 同步引擎状态机与回合算法（§5.4） | types, util, db, merge, transport, auth |
| `export.ts` | JSON 信封导出/导入、Markdown、DOCX（懒 import docx） | types, util, db, merge |
| `share.ts` | SharePayload 编解码、URL 构建/解析 | types, util |
| `vue.ts` | useLiveQuery、useSyncState、useUserStorage 响应式桥 | vue, db, sync, dexie |
| `index.ts` | initUserStorage 编排、barrel 导出 | 上述全部 |

依赖方向：`components → user-storage → (dexie / transport / auth)`；`merge` 与 `share` 是纯函数叶子；**禁止循环**；前端组件不得直接 import dexie。

### 4.2 新增文件（前端）

| 文件 | 职责 |
|---|---|
| `theme/components/ReaderSelectionToolbar.vue` | 选区工具条（interaction §2.1），z 62；触屏底部动作栏 |
| `theme/components/ReaderHighlightPopover.vue` | 摘录弹层（§2.3），z 61，与注解弹层互斥 |
| `theme/components/ReaderExcerpts.vue` | 摘录面板（§3）：摘录/书签 tab、筛选、搜索、批量、导出▾ |
| `theme/components/ReaderSyncPanel.vue` | 云同步面板（§5–§7、§10）P1 |
| `theme/components/ReaderConflictCard.vue` | 单条冲突卡片（§7），三按钮裁决 |
| `theme/components/ReaderShareLanding.vue` | 分享落地卡（§8.2），z 63 |
| `theme/components/ReaderToast.vue` | 全局轻提示 + 撤销（§6），z 65 |
| `theme/components/ReaderProgressBanner.vue` | 跨设备进度横幅（§6.2）P1 |
| `theme/components/ReaderDataTools.vue` | 导出▾菜单 + JSON 导入预览对话框 + 摘录集生成对话框（D33），ReaderExcerpts/ReaderSyncPanel 复用 |
| `theme/composables/usePopoverPosition.ts` | 从 ReaderAnnotations 提取的定位算法（§6.3） |
| `theme/composables/useToasts.ts` | toast 单例状态 + push/dismiss + 撤销快照 |
| `theme/composables/useSelection.ts` | 选区监听 + 正文 containment + DOM Range→锚点映射 |

### 4.3 现有文件允许改动范围（超出即越界）

| 文件 | 归属 | 允许改动 | 禁止 |
|---|---|---|---|
| `theme/Layout.vue` | 前端 | readerPanel 类型扩为 ReaderPanel；nav 加「摘录」按钮与 ☁︎ 图标（P1，含红点）；挂载新组件（ReaderToast 全站；工具条/弹层/落地卡/横幅仅阅读页）；provide 面板开关给 Dock | 改页头收放逻辑、改 onReaderClick 选区排除 |
| `theme/components/ReaderDock.vue` | 前端 | panel model 类型扩展；新增 excerpts/sync 两个 Transition section（宿主新面板组件）；settings 面板底部加「云同步」区块（P1） | 改 collectParagraphs/hashText/maybeResume/scheduleSave/saveNow 的算法（P ID 自动兼容，见 §5.7） |
| `theme/composables/reader.ts` | **后端** | savePosition/prefs watch/clearReadingProgress 内部接持久化适配器；新增 setPersistAdapter/hydrateProgress/hydratePrefs 导出；initReader 保持同步 localStorage 加载 | 改 ReadingPosition/ReaderPrefs 公开形状（除 D12 可选字段）、改 sanitize 白名单、改 overallProgress 公式 |
| `theme/components/ReaderAIEdit.vue` | 前端 | 删浮动圆钮模板与 .reader-ai-edit 样式；加 `reader-ai-edit:trigger` 事件监听（detail 文本 → selectedText → copyPrompt） | 改 copyPrompt 文案/Agent 列表/dialog 结构 |
| `theme/components/ReaderAnnotations.vue` | 前端 | updatePosition/ResizeObserver/scroll-resize 提取到 usePopoverPosition（行为不变）；加弹层互斥监听（§6.3） | 改 hover/pin 双态、注解过滤、内容渲染 |
| `theme/components/ReaderSearchHighlight.vue` | 前端 | 仅加 legacy 回退查找（D17） | 改 mark 算法/滚动公式/事件 |
| `theme/components/ContinueReading.vue` | 前端 | 无需改动（reader.ts 水合透明切换数据源）；如显示 needsRelocate 提示可加一行 | 改 ?resume=1 约定 |
| `theme/custom.css` | 前端 | 四主题块各加 5 个高亮 token；新组件样式；mark.reader-highlight/书签图标/脉冲动效/bottom-sheet 媒体查询 | 改现有 token 值与现有 z-index |
| `theme/components/ReaderVersionMenu.vue` / `ReaderSearch.vue` / `ReaderAnnotationTypes.vue` / `ChapterNav.vue` / `ReadingProgress.vue` | — | **不改**（复用范式照抄进新组件） | |
| `site/.vitepress/paragraphs.mjs` | 后端 | §2.7 | 改 visibleText/extractSearchRecords |
| `scripts/prepare-site.mjs` | 后端 | §2.8 | 改 frontmatter 字段、页面划分 |
| `package.json` / `.github/workflows/deploy.yml` / `DEVELOPMENT.md` | 后端 | §7.1/§7.5/新命令文档 | 改现有构建命令语义 |

---

## 5. 数据层接口契约（归属：后端）

签名即合同：参数、返回、错误语义照此实现。所有异步函数失败抛类型化错误，不返回哨兵值（明确标注 null 语义的除外）。

### 5.1 config.ts

```typescript
export function configureUserStorage(patch: Partial<UserStorageConfig>): void
export function getUserStorageConfig(): UserStorageConfig
// 缺省值：clientId = import.meta.env.VITE_ONEDRIVE_CLIENT_ID ?? ''
// authority = 'https://login.microsoftonline.com/common'；redirectUri = location.origin
// 测试：configureUserStorage({ clientId: 'test' }) 注入；afterEach 复位
// clientId === '' → sync 整体禁用，auth 为 DisabledAuthProvider（login 抛 AuthError('not-configured')）
```

### 5.2 db.ts

```typescript
export function openDatabase(scope: Scope): Promise<UserDb>     // Dexie 实例封装
export function switchScope(scope: Scope): Promise<void>        // 关旧开新 + 通知水合；同步引擎随之 rebind
export function currentScope(): Scope
export function currentDb(): UserDb                             // 未打开抛 Error('db-not-open')
export function storageMode(): 'idb' | 'localStorage' | 'unavailable'

// Dexie schema（version 1；库名 proust-reader-v1-{scope}）
// highlights: 'id, chapterId, paragraphId, updatedAt, deletedAt, dirty, [chapterId+paragraphId]'
// bookmarks:  'id, chapterId, updatedAt, deletedAt, dirty'
// progress:   'pageId'
// settings:   'key'            // 'synced' → SettingsDoc；'device' → DevicePrefs
// cloudState: 'id'
// outbox:     '++seq, id, [entity+id]'   // 复合索引为 data-model §7.2 的补全（'doc' id 跨实体歧义）
// meta:       'key'            // account/lastSyncAt/graveyard/claimedBy/legacyMigrated/lastExportAt/paused
// 注意：deletedAt=null 的行不进该索引（IndexedDB 不索引 null），墓碑查询用 .filter()

/* 记录操作：同一 Dexie 事务内写实体 + 合并 outbox + 置 dirty */
export function putHighlight(h: Highlight): Promise<void>       // 先 sanitizeHighlight，非法抛 ValidationError
export function softDeleteHighlight(id: string): Promise<void>  // D18 分支：未同步创建 → 硬删 + 丢 op
export function putBookmark(b: Bookmark): Promise<void>
export function softDeleteBookmark(id: string): Promise<void>
export function getHighlight(id: string): Promise<LocalHighlight | null>
export function listHighlights(): Promise<LocalHighlight[]>     // 含墓碑（面板过滤）
export function liveHighlights(): LiveQuery<LocalHighlight[]>   // dexie liveQuery 实例（含墓碑，面板过滤）
export function liveBookmarks(): LiveQuery<LocalBookmark[]>

export function sanitizeHighlight(input: unknown): Highlight    // 白名单 + 限额：exact>10000 / note>20000 抛错；
                                                                // prefix/suffix 截 32；color/types 枚举；offset 非负整数；
                                                                // 同段 exact===slice 校验；未知字段保留
export function sanitizeBookmark(input: unknown): Bookmark

/* 进度 / 设置 */
export function saveProgress(pos: ReadingPosition): Promise<void>   // maxProgress=max(旧,新)；置 outbox('progress','doc','put')
export function getProgressDoc(): Promise<ProgressDoc>              // 聚合 progress 表 + meta.last
export function saveSyncedPrefs(prefs: SyncedPrefs): Promise<void>  // 逐字段 stamps={nowIso, deviceId}；outbox('settings','doc','put')
export function getSettingsDoc(): Promise<SettingsDoc>
export function saveDevicePrefs(p: DevicePrefs): Promise<void>      // 不置 outbox

/* 迁移（幂等；meta.legacyMigrated 守卫） */
export function migrateLegacyData(version: string): Promise<{ migrated: boolean; needsRelocate: string[] }>
// 1. fetch paragraph-ids-{version}.json（失败 → 返回 migrated:false，下次重试）
// 2. lost-time:progress:v2 逐页：legacy 索引映射 p-00000N → P ID；
//    fnv1a36 校验（旧 hash 与映射目标段 hash 比；旧值按 raw 与 NFC 两种基准各算一次，任一命中即通过）；
//    失配 → 保留旧 paragraphId + needsRelocate:true
// 3. lost-time:reader-prefs:v2 → SettingsDoc（width 落 device 行）；stamps=迁移时刻+本机 deviceId
// 4. meta.legacyMigrated=true；旧键不删（D11）

/* 认领迁移（首次登录；anon → 账号库） */
export function claimAnonData(targetScope: Scope): Promise<void>
// 逐条复制（含墓碑）：目标已有同 id → mergeRecords（base=目标.baseSnapshot）；否则 dirty=1 复制
// progress/settings 按 §5.4 文档合并；完成写 anon.meta.claimedBy=targetScope
// claimedBy 置位后 anon 库一切写操作抛 Error('scope-claimed')

export function rebuildOutbox(): Promise<void>   // 崩溃恢复：按 dirty 重建，与现存 op 互为校验
export function deviceId(): string               // localStorage 'lost-time:device-id'，UUIDv4，跨库共用
export function deleteScopeDatabase(scope: Scope): Promise<void>  // D33 附加：断开连接显式清除账号库
```

错误语义：`ValidationError`（sanitize 失败，含字段名）；IndexedDB 打开失败 → `storageMode()='localStorage'`，initUserStorage 不抛（降级）；事务失败原样抛，调用方（UI）toast。

### 5.3 anchor.ts

```typescript
export function collectAnchorParagraphs(root: HTMLElement): ParagraphInfo[]
// .vp-doc 下全部 <p>；text=nfc(textContent)；hash=fnv1a36(textContent)；legacy=dataset.legacy ?? ''

export function domRangeToSelection(range: Range, paras: ParagraphInfo[]): SelectionAnchor | null
// DOM Range → { start:{paragraphId,offset}, end:{...}, exact, prefix, suffix }
// NFC 偏移映射：逐 Text 节点累积；节点 NFC 前后长度不同时建逐字符映射表（常见 CJK 恒等快路径）
// 跨出正文 → 截取正文内部分；截后为空 → null（interaction §2.4）
export interface SelectionAnchor {
  start: { paragraphId: string; offset: number }
  end: { paragraphId: string; offset: number }
  exact: string; prefix: string; suffix: string
}

export function resolveHighlight(h: Highlight, ctx: AnchorContext, lineage: LineageIndex): AnchorResult
export function resolveShare(p: SharePayload, ctx: AnchorContext, lineage: LineageIndex): AnchorResult
export interface AnchorContext { pageId: string; paragraphs: ParagraphInfo[] }

export function renderHighlights(items: { id: string; color: HighlightColor; result: AnchorResult; hasNote: boolean }[], root: HTMLElement): void
// mark.reader-highlight + data-reader-highlight={id} + tabindex=0 + aria-label
// 跨 Text 节点 splitText 从后往前拆（复用 ReaderSearchHighlight 算法，只换 class/data）
// status='paragraph' → 整段淡底 + 虚线左缘（class is-degraded），不包精确范围
// status='missing' → 不渲染
export function clearHighlightMarks(root: HTMLElement): void   // 只认 data-reader-highlight

export function reanchor(h: Highlight, sel: SelectionAnchor, revision: string): Highlight
// 显式重锚：旧 {selector,revision,textHash} 入 selectorHistory（≤5），新 selector，rev+1，updatedAt/deviceId 更新
// 这是唯一允许写 selector 的函数（不变量 1）

export function loadVersionMap(version: string): Promise<VersionMap>     // fetch + 缓存
export function loadLineage(): Promise<LineageIndex>
export interface VersionMap { pages: Record<string, string[]> }
export function pidLocation(map: VersionMap, pid: string): { pageId: string; index: number } | null  // 反查（加载时建倒排）
```

**五级管线（resolveHighlight，确定性，宁可降级不错关联）**：

```
候选发现：
  a. h.paragraphId 在 ctx.paragraphs → candidates=[该段]，direct=true
  b. 否则查 lineage.supersedes[h.paragraphId]：
     唯一 → candidates=[该段]（level 3 候选）；多个 → candidates=全部（不自动挑）
  c. 否则 pidLocation(当前版本 map)：指向他页 → 本页 { status:'missing' }（面板可跳转）
  d. 无 → { status:'missing' }
级别 1：direct 且 段.hash === h.textHash 且 nfcText.slice(start.offset,end.offset) === exact
        （跨段：逐段校验，任一段失配 → 降级）→ { status:'exact', level:1 }
级别 2：exact 非空时，在 candidates 内找 exact+prefix+suffix 全匹配；
        无 → 扩大到当前页全部段落；唯一命中 → { status:'exact', level:2 }
        多处命中：取候选段内/距原偏移最近者；仍平局 → 进级别 4
级别 3：supersedes 唯一命中且切片校验通过 → { status:'fuzzy', level:3 }（UI 徽标「已重新定位」）
级别 4（P2，懒加载 dmp）：对 candidates 逐段 match_main(text, exact, locHint=原 offset clamp)
        Match_Threshold=0.6，Match_Distance=max(1000, text.length)
        命中（≥0）→ ranges=[idx, idx+exact.length clamp]；跨段逐段必须全命中
        → { status:'fuzzy', level:4 }
级别 5：candidates 非空 → { status:'paragraph', level:5, paragraphId:candidates[0] }
        （多候选取第一个仅为降级展示，不假装精确）
kind='note'：跳过 exact 校验，段落存在即 { status:'exact', level:1 }（offset 0..len）
T ID：视同 direct=false 且无谱系 → 级别 2 起
```

P0 实现级别 1/2/5；级别 3/4 的候选发现分支 P0 即写入（lineage 资产 P0 生成），裁决逻辑 P2 补全（P0 遇 supersedes 多命中直接级别 5）。

### 5.4 merge.ts + sync.ts

#### merge.ts（纯函数，§8 判定表的唯一实现）

```typescript
export interface MergeInput<T> { base: T | null; local: T; remote: T; selfDeviceId: string; now: string }
export interface MergeOutput<T, S = HighlightSnapshot> {
  record: T                      // 合并结果（rev=max+1，deviceId=self，updatedAt=now）
  appended: ConflictCopy<S>[]    // 本次新增败者副本
  overflow: ConflictCopy<S>[]    // 超 3 份被挤出的最旧副本（调用方落溢出文件）
  readOnly?: 'higher-schema'     // 远端 schemaVersion 更高：不合并，record=local 原样
}
// mergeHighlight → MergeOutput<Highlight, HighlightSnapshot>
// mergeBookmark  → MergeOutput<Bookmark, BookmarkSnapshot>
export function mergeHighlight(input: MergeInput<Highlight>): MergeOutput<Highlight>
export function mergeBookmark(input: MergeInput<Bookmark>): MergeOutput<Bookmark>
export function mergeProgress(local: ProgressDoc, remote: ProgressDoc, selfDeviceId: string): ProgressDoc
export function mergeSettings(local: SettingsDoc, remote: SettingsDoc): SettingsDoc
export function mergeGraveyard(local: GraveyardDoc, remote: GraveyardDoc): GraveyardDoc
export function isGraveyarded(id: string, g: GraveyardDoc): boolean
```

**单条记录逐字段判定表**（Highlight 字段集 F = `note, types, color, anchorBundle{selector,textHash,revision}, deletedAt`；Bookmark F = `label, deletedAt`。身份字段不一致 → D23 整条冲突副本）：

| # | 条件 | 结果 |
|---|---|---|
| 1 | 两侧均未改（相对 base） | 取 base 值 |
| 2 | 仅本地改 | 取本地 |
| 3 | 仅远端改 | 取远端 |
| 4 | 两侧改且值相同 | 取该值 |
| 5 | 两侧改且值不同 | updatedAt 较新者胜；同刻 deviceId 字典序大者胜；**败者内容字段 → ConflictCopy** |
| 6 | 一侧删除、另一侧**未改内容** | 墓碑生效（deletedAt 取删除侧），无冲突副本 |
| 7 | 一侧删除、另一侧**改了内容** | 存活记录 = 删除侧整条（含其墓碑）；编辑侧整条内容 → ConflictCopy（snapshot.deletedAt=null），等用户裁决 |
| 8 | 两侧都删除 | deletedAt 取**较早**者；内容字段按 1–5 正常合并 |
| 9 | base 缺失（导入/无 baseSnapshot） | 逐字段：值相同 → 保留；不同 → 按 #5（两侧修改即冲突副本） |
| 10 | 远端 schemaVersion > 本地 | `readOnly:'higher-schema'`，不合并、不上传、不改动本地 |
| 11 | 本地 schemaVersion > 远端 | 正常合并（本地新端可覆盖旧端字段，败者仍存副本） |

补充规则：
- `rev = max(local.rev, remote.rev) + 1`（仅当合并实际发生；远端与本地全等 → 不合并、rev 不变）。
- 未知字段载体 = 整体胜者侧（updatedAt/deviceId 同 #5 规则），深拷贝保留。
- ConflictCopy = 败者的 `{note,types,color,selector,deletedAt}` + 败者 `deviceId/rev/updatedAt` + `keptAt=now`。
- conflicts 追加后 >3 → 最旧挤出到 overflow（D16）。
- **deletedAt 特殊规则（#6–8）优先于 #5**：先判删除态，再对剩余内容字段走 1–5。
- mergeProgress：页集合取并集；逐页 `maxProgress=max`，其余字段取 updatedAt 较新（同刻比 deviceId，缺失视为 ''）；`last` 取两侧 updatedAt 较新。任何一侧的页不丢。
- mergeSettings：逐 prefs 字段比 stamps（t 相同比 d 字典序）；annotationTypes 整体比较；缺 stamp 视为 `{t:'1970-01-01T00:00:00.000Z', d:''}`；结果 stamps 取胜者。
- mergeGraveyard：按 id 并集，同 id 取较早 purgedAt。只增不减。

#### sync.ts

```typescript
export interface SyncDeps {
  db: UserDb; transport: GraphTransport; auth: AuthProvider
  now?: () => string            // 可注入时钟（测试）
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  random?: () => number         // 退避抖动（测试注入确定性）
}
export function createSyncEngine(deps: SyncDeps): SyncEngine
export interface SyncEngine {
  getStatus(): SyncStatus
  subscribe(cb: (s: SyncStatus) => void): () => void
  trigger(reason: 'init' | 'mutation' | 'online' | 'manual'): void
  syncNow(): Promise<SyncReport>          // 手动；已在跑 → 返回当前回合 Promise（单飞）
  pause(): void; resume(): void
  listConflicts(): Promise<ConflictInfo[]>
  resolveConflict(entity: 'highlight' | 'bookmark', id: string, copyIndex: number,
                  choice: 'local' | 'remote' | 'both'): Promise<void>
  dispose(): void
}
export interface SyncReport { uploaded: number; downloaded: number; merged: number; conflicts: number; failed: number; purged: number }
```

**状态机**（派生规则，优先级从高到低）：

```
disconnected  auth.current() === null
needs-auth    已连接且最近 getToken 抛 needs-login
paused        meta.paused（首次连接选「稍后」/手动）
offline       navigator.onLine === false 或最近错误为网络类
syncing       回合进行中
conflict      存活记录含未处理 conflicts（>0）
error         最近回合有非网络失败且重试耗尽
pending       outbox.length > 0
synced        其余（队列空、无冲突）
```

**触发与防抖**：mutation → 3s 防抖合并；init/online/manual → 立即（manual 在 syncing 时按钮禁用）。单飞：回合进行中再触发 → 置 rerun 标记，回合结束后若 dirty 仍在 → 再跑一轮。回合内顺序：graveyard → 记录 → progress → settings → GC（进度/设置优先级最低，失败静默下轮重试）。

**回合算法**（每步失败按退避处理，不阻塞后续步骤的记录级隔离）：

```
1. graveyard.json：read → mergeGraveyard → 本地 meta.graveyard；
   本地有新增 purged → write（If-Match；412 → 重拉重合再传，≤3 次）
2. list('highlights') + list('bookmarks')（分页、eTag）
   对每个远端项：
   - 文件名解析：{uuid}.json → 记录；{uuid}.conflict-{n}.json → 溢出副本（D16）；
     其他命名 → unknownFiles=true，不读不删
   - graveyard 命中 → remove 远端文件，跳过（防复活，含离线迟到上传）
   - cloudState 缺失或 eTag 变化 → read → 剥离校验 → mergeHighlight/Bookmark
     （base = local.baseSnapshot；本地不存在 → base=null 且本地侧视为「未改」：
      远端整条落库，dirty=0，baseSnapshot=远端）→ 写本地 + cloudState
   - 本地 dirty 且远端 eTag 未变 → 留给上传步
3. 远端缺失但 cloudState 存在（外部删改）：本地记录仍在 → 以本地为准重建上传；
   本地已 GC → 删 cloudState 行
4. 上传 outbox（seq 序）：
   - 载荷 = 实体表当前值，剥离 local；Blob size > 256KB → 该 op 失败（error 态，不上传）
   - readOnly='higher-schema' → 跳过（不上传）
   - put：write(path, json, baseEtag ? {ifMatch} : {ifNoneMatch:'*'})
     412 → read 远端 → merge → 写本地 → 重传（≤3 次；仍 412 → 下轮）
     成功 → cloudState={eTag,syncedRev:rev}；local.dirty=0；baseEtag/baseSnapshot=上传值
   - delete（墓碑）：同 put 上传墓碑文件（软删除照常同步）；GC 步才真删文件
5. progress.json / settings.json：read → mergeProgress/mergeSettings → write If-Match；
   412 → 重拉重合再传 ≤3 次；本地无变更且远端无变化 → 跳过
6. GC：deletedAt + 90 天 < now 的墓碑 → remove 远端 + 删本地行 + graveyard 追加 {id, purgedAt=now}
   + 其溢出文件一并 remove；graveyard 变更下轮步骤 1 上传
7. meta.lastSyncAt=now；发 SyncReport；状态重算
```

**退避**：单请求失败（retryable）→ 1s/2s/4s（×2，≤3 次，random 抖动 ±20%）；耗尽 → 该条 failed，回合继续其余条；401 → auth.getToken 续期一次重试，仍 401 → needs-auth 终止回合；网络错误 → offline 终止回合，等 online 事件。**本地数据在任何失败下不丢**（outbox 与 dirty 持久）。

**resolveConflict**：`local` = 丢弃该副本（用户显式）；`remote` = 副本内容作为一次正常编辑（rev+1，进 outbox）；`both` = 副本另存新记录（新 UUIDv7，selector/锚点字段同原记录，内容取副本，deletedAt=null），原副本丢弃。处理完自动重算冲突数；归零 → trigger('mutation')。

### 5.5 auth.ts

```typescript
export function createAuthProvider(config: UserStorageConfig, msalLoader?: () => Promise<unknown>): AuthProvider
// clientId='' → DisabledAuthProvider（current()=null，login 抛 not-configured）
// MSAL 动态 import 收敛于此；scope 派生：'ms-' + sha256Hex(account.idTokenClaims.oid ?? account.homeAccountId).slice(0,16)
// getToken：acquireTokenSilent 优先；失败抛 AuthError('needs-login')（UI 横幅「重新登录」走 login popup）
// login：loginPopup({ scopes: ['Files.ReadWrite.AppFolder'] })；用户关闭 → AuthError('popup-closed')
// 凭证内存保存（MSAL 缺省 cacheLocation=sessionStorage 改为 memoryStorage；刷新后 init 静默恢复）
// onChange：登录/登出/账号切换回调 → index.ts 编排 switchScope + claim + sync rebind
```

### 5.6 transport.ts

```typescript
export function createGraphTransport(getToken: () => Promise<string>, fetchImpl?: typeof fetch): GraphTransport
// URL 基址 'https://graph.microsoft.com/v1.0/me/drive/special/approot'
// list：':/{folder}:/children?$select=name,eTag,id&$top=200'，root 用 '/children'；跟 @odata.nextLink
// read：':/{path}:/content'；404 → null
// write：PUT ':/{path}:/content'，body + Content-Type: application/json（或 octet-stream）
//        cond.ifMatch → If-Match；cond.ifNoneMatch:'*' → If-None-Match: *
// remove：DELETE '/{path}'（item 路径，不带 :/content）；404 幂等成功
// 每请求 Authorization: Bearer {getToken()}；401 → GraphError(401,false)
// fetchImpl 可注入（测试）；D15 的实测 spike 在此层做
```

### 5.7 reader.ts 适配器（后端改，前端消费）

```typescript
// reader.ts 新增导出
export function setPersistAdapter(a: PersistAdapter): void
export interface PersistAdapter {
  saveProgress(pos: ReadingPosition): void      // fire-and-forget，内部 catch
  savePrefs(prefs: ReaderPrefs): void           // prefs 双写：IDB + localStorage（D11）
  clearProgress(): void
}
export function hydrateProgress(doc: ProgressDoc, mode: 'merge' | 'replace'): void
// merge：迁移水合（localStorage 快照与 IDB 同为 anon 数据，按页 updatedAt 较新胜、maxProgress max）
// replace：switchScope 时整体替换 reactive progress（★ 不得并集，否则账号间串数据）
export function hydratePrefs(doc: SettingsDoc, mode: 'merge' | 'replace'): void   // 同上语义
```

- `savePosition` 现有逻辑不动，末尾追加 `persist.saveProgress(next)`；缺省适配器 = localStorage（现状）。迁移成功 → setPersistAdapter(IDB 适配器)，progress 停写 localStorage。
- prefs watch 回调：现有 writeJson 保留（双写），追加 `persist.savePrefs`。
- **ReaderDock 零改动即兼容**：`saveNow` 写 `node.id`（渲染后已是 P ID）；`maybeResume` 三级恢复对 P ID 原样工作（id 命中 → hash 回退 → 百分比兜底）；`hashText` 与 fnv1a36 同算法（D3）。
- `initUserStorage()`（index.ts，客户端 onMounted 调用）：探测 IDB → openDatabase('anon') → migrateLegacyData(book.contentVersion) → hydrate → setPersistAdapter → (P1) auth.init → 有账号 → switchScope + 首次 claimAnonData → createSyncEngine + trigger('init')。任何一步失败降级 localStorage 模式，阅读不中断。

### 5.8 export.ts / share.ts

```typescript
/* export.ts */
export function buildExportEnvelope(): Promise<ExportEnvelope>     // 全量含墓碑/conflicts；剥 local；无 token/邮箱
export function downloadJson(env: ExportEnvelope): void            // proust-reader-backup-YYYYMMDD.json；写 meta.lastExportAt
export function parseImportFile(text: string): { ok: true; envelope: ExportEnvelope } | { ok: false; error: string }
// 校验：format 字符串、formatVersion ≤ 1（更高拒绝，不猜测解析）、逐条 sanitize；任何非法 → ok:false，零写入
export function previewImport(env: ExportEnvelope): Promise<ImportPreview>   // 干跑合并，不写库
export function applyImport(env: ExportEnvelope, strategy: ImportStrategy): Promise<ImportResult>
// 逐条 merge（base=本地 baseSnapshot，缺失走判定表 #9）；冲突按 strategy：
//   local=本机胜（败者仍存副本）；import=导入胜；both=导入侧另存新记录
// graveyard id → 丢弃导入记录；progress/settings 按文档合并；结果进 outbox；永不整库覆盖
export function buildMarkdownExcerpt(items: ExcerptItem[], opts: ExcerptOptions): string
export function buildDocxExcerpt(items: ExcerptItem[], opts: ExcerptOptions): Promise<Blob>  // 懒 import docx
export interface ExcerptItem { highlight: Highlight; chapterLabel: string; permalink: string }
export interface ExcerptOptions { includeNotes: boolean; includeLinks: boolean; groupByVolume: boolean }
// 色 token → 导出 hex 映射表为导出模块常量（数据不携带色值）

/* share.ts */
export function encodeShare(p: SharePayload): string               // base64url(UTF-8 JSON)，无填充
export function decodeShare(s: string): SharePayload | null        // 非法 → null，不抛
export function buildShareUrl(input: ShareInput, opts: { base: string; versionPrefix: string }): string
// withBase 语义由调用方传入 base；D27 预算裁剪；不含 note/types/凭证
export function parseShareUrl(url: URL): SharePayload | null       // 识别 '#share='
export interface ShareInput { chapterId: string; start: { paragraphId: string; offset: number }; end: { paragraphId: string; offset: number }; exact: string; prefix: string; suffix: string }
```

### 5.9 vue.ts / index.ts

```typescript
/* vue.ts */
export function useLiveQuery<T>(querier: () => Promise<T>, initial: T): Ref<T>   // dexie liveQuery + onScopeDispose
export function useSyncState(): { status: Ref<SyncStatus>; engine: SyncEngine | null }
export function useUserStorage(): { ready: Ref<boolean>; mode: Ref<'idb'|'localStorage'|'unavailable'>; scope: Ref<Scope>; account: Ref<AuthAccount|null> }
/* index.ts */
export function initUserStorage(opts?: { config?: Partial<UserStorageConfig> }): Promise<void>  // §5.7 编排；幂等
export function getSyncAuth(): AuthProvider | null   // D33 附加：编排中的同一 auth 实例（面板登录/登出入口）
export * from './types'  // barrel：前端只从 user-storage 包面 import（D33 补出 B2-2 产物与 anchor/sync 类型）
```

---

## 6. 前端组件契约（归属：前端）

### 6.1 新组件接口

| 组件 | props | emits | 关键行为契约 |
|---|---|---|---|
| ReaderSelectionToolbar | 无 | 无（直接调 user-storage） | useSelection 驱动；色块×4 点击即 putHighlight；批注=创建+开弹层编辑态；🔖 toggle 书签；⧉ 复制 toast；🔗 buildShareUrl+剪贴板；✦ dispatch `reader-ai-edit:trigger`；全部按钮 `@pointerdown.prevent`；Esc/外点/选区塌陷/滚动 → 消失；触屏=底部固定动作栏（safe-area）；版权页不触发；重叠 P0 拒绝（D24） |
| ReaderHighlightPopover | `highlightId: string \| null`；`anchorEl: HTMLElement \| null`；`startInEdit?: boolean` | `close` | usePopoverPosition 定位；hover 预览（300ms 入/120ms 出，any-hover+pointerType 检测）/click pin；编辑 textarea 650ms 防抖 + Cmd/Ctrl+Enter 保存 + Esc 放弃；改色即生效；删除=softDelete+撤销 toast(5s)；复制链接 toast「链接已复制（不含批注）」；与注解弹层互斥；未同步小字链到 sync 面板 |
| ReaderExcerpts | 无 | `navigate(pageId: string, paragraphId: string, highlightId?: string)`；`openSync` | liveHighlights/liveBookmarks；双 tab；排序（正文位置=map 反查 pageIndex×段序 / 最近创建 / 最近修改）；筛选（卷章/颜色/只看有批注/定位失效）；搜索 100ms 防抖+isComposing+sequence 守卫+↑↓/Enter/Esc；批量多选+确认对话框；导出▾（JSON 导出/导入 P0，DOCX/MD P2）；状态行 P0「仅保存在本机」 |
| ReaderSyncPanel | 无 | 无 | 账号区（连接/断开/切换，原生 dialog 确认）；状态行+立即同步；冲突入口→ReaderConflictCard 列表；数据区（JSON 导入导出/摘录集/备份提醒 >30 天）；首次连接两对话框（说明+预览计数）；「稍后」=pause |
| ReaderConflictCard | `conflict: ConflictInfo`；`index: number`；`total: number` | `resolve(choice: 'local'\|'remote'\|'both')`；`later` | 两版并排（移动上下）；删除 vs 修改一版显示「已删除」；处理完自动下一条 |
| ReaderShareLanding | 无 | 无 | parseShareUrl→resolveShare→滚动（max(90,innerHeight*.35)）→临时 mark[data-reader-share] 2.5s 呼吸后转常驻淡色；底部卡：保存到我的摘录/复制正文/×；失败降级：滚到段落+「译文已更新，原文可能略有出入」+展示原 exact；关闭卡保留高亮至离页 |
| ReaderToast | 无 | 无 | useToasts 单例渲染；role=status aria-live=polite；action 槽（撤销）；z65；成功/失败两态 |
| ReaderProgressBanner | `remote: ReadingPosition` | `jump`；`stay` | 异页且云端较新才显示；跳转/留下/开始滚动 → 消失；绝不自动跳转 |

### 6.2 z-index 层序（修正版，D10）

```
正文 mark（文档流）
45  顶部进度条 / 注解触发器（现有）
46  AI 圆钮（退役）/ 版本面板导航（现有）
47  面板遮罩（现有，新面板复用）
48  面板（现有，excerpts/sync 复用）
60  注解遮罩（现有）
61  注解弹层 / 用户摘录弹层（新）
62  选区工具条（新）
63  分享落地卡（新）
65  toast（现有 notice 层级）
100 下拉菜单 .reader-note-select__options（现有，interaction 漏列；新筛选器复用）
原生 <dialog> top layer（确认对话框，天然最高）
```

### 6.3 提取与互斥契约

- `usePopoverPosition(anchor, panel, { margin=12, gap=10 })` → `{ position, positioned, schedule, dispose }`：算法逐行提取自 ReaderAnnotations.updatePosition（锚点居中、上下翻转、视口 clamp）+ ResizeObserver + scroll(capture)/resize 跟随。ReaderAnnotations 改为消费它，行为回归不变。
- 弹层互斥：window 事件 `reader-popover:open`（detail `{ source: 'annotation' | 'highlight' }`）；两弹层各自监听，source 非己 → close。打开时 dispatch。
- Esc 处理顺序：工具条/弹层自行 `stopPropagation`；面板 Esc 沿用 Dock 现有 document 监听。
- 焦点归还：弹层关闭回 trigger（mark tabindex=0）；面板关闭回 nav 按钮（现有模式）。

### 6.4 样式 token（custom.css 四主题块各一份）

```css
--reader-highlight-yellow / -green / -blue / -pink / -purple
/* paper/light/sepia：半透明底色；dark：提亮降饱和；正文对比度 ≥ 4.5:1 */
```
复用 class：`reader-panel*`、`reader-setting*`、`reader-text-button`/`reader-icon-button`、`reader-segmented`、`reader-note-select*`、`reader-ui`、`reader-fade`/`reader-panel` 过渡。脉冲动效：底色脉冲 2 次约 1.2s；`prefers-reduced-motion` → 静态描边 2s。移动端 <768px 面板改全宽底部抽屉（拖拽把手、下滑关闭）。触屏目标 ≥44×44px。

### 6.5 事件契约汇总

| 事件 | detail | 方向 |
|---|---|---|
| `reader-ai-edit:trigger` | `string`（选区文本） | 工具条 → ReaderAIEdit |
| `reader-popover:open` | `{ source: 'annotation' \| 'highlight' }` | 两弹层互斥 |
| `reader-search:navigate` | 无（现有） | ReaderSearch → ReaderSearchHighlight |
| `reader-highlight:open` | `{ id: string; startInEdit?: boolean; flash?: boolean }`（D33） | 工具条/面板/分享 → ReaderHighlightPopover |
| `reader-panel:open` | `ReaderPanel`（D33） | 弹层/状态行 → Layout |
| `reader-excerpts:degraded` | `{ count: number }`（D33） | 摘录层/面板 → Layout |
| `reader-reanchor:active` | `boolean`（D33） | ReaderHighlightPopover → 工具条 |
| `reader-excerpts:show-degraded` | 无（D33，F2-1） | 失效 toast「查看」→ ReaderExcerpts（置失效筛选） |

## 7. 测试合同

### 7.1 框架与配置

新增 devDependencies（版本均已对 registry 核实，2026-11-27）：

```jsonc
{
  "dexie": "^4.4.7",
  "@azure/msal-browser": "^5.30.0",        // P1
  "docx": "^9.16.1",                        // P2
  "diff-match-patch": "^1.0.5",             // P2
  "vitest": "^3.2.4",
  "@vitejs/plugin-vue": "^5.2.4",
  "@vue/test-utils": "^2.6.0",
  "happy-dom": "^21.0.4",
  "fake-indexeddb": "^6.2.8",
  "@types/diff-match-patch": "^1.0.36"      // P2
}
```

package.json scripts 增补：

```jsonc
{
  "test": "node --test scripts/tests/*.mjs && vitest run",
  "test:node": "node --test scripts/tests/*.mjs",
  "test:vitest": "vitest run",
  "assign:ids": "node scripts/assign-paragraph-ids.mjs"
}
```

`vitest.config.ts`（仓库根，新增）：

```typescript
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
  },
})
```

`tests/setup.ts`（新增）：
- `import 'fake-indexeddb/auto'`（每测试文件独立 IDB 环境；afterEach 删库）。
- `window.crypto.subtle` 缺失时从 `node:crypto` webcrypto 补齐；`crypto.getRandomValues` 同理。
- ResizeObserver / matchMedia / scrollTo / requestAnimationFrame 缺失时补 stub（happy-dom 已提供的不动）。
- `configureUserStorage` 复位钩子。

布局与命名：
- 构建侧（node:test，零新依赖）：`scripts/tests/test_paragraph_ids.mjs`、`test_fingerprint.mjs`。fixture 模式沿用 test_content_version.mjs（mkdtemp + t.after 清理 + env 保存恢复）。
- 数据层：`tests/storage/{db,merge,anchor,sync,auth,transport,export,share,util,migration}.test.ts`
- 组件：`tests/components/{selection-toolbar,highlight-popover,excerpts,sync-panel,conflict-card,share-landing,toast,progress-banner}.test.ts`
- 禁止 Playwright；禁止把 vitest 文件放进 `scripts/tests/`。

### 7.2 后端测试矩阵（数据层）

每模块正常 + 边界 + 对抗。★ = 必须覆盖的对抗用例。

**merge（全表，逐行断言）**
- 判定表 #1–#11 每行 × 每字段（note/types/color/anchorBundle/deletedAt；Bookmark label）独立用例。
- ★ 两侧改且不同：updatedAt 胜负、同刻 deviceId 字典序、败者入 conflicts 不丢。
- ★ 删除 vs 编辑：墓碑存活 + 编辑侧副本 deletedAt=null；两侧删除取较早。
- ★ base 缺失（导入路径）：两侧修改即冲突副本。
- ★ 远端高 schemaVersion：只读、不上传、本地原样。
- ★ 身份字段不一致（D23）：整条冲突副本。
- 未知字段保留回写（远端胜者载体）；rev=max+1；全等不合并 rev 不变。
- conflicts  cap 3 溢出最旧；selectorHistory cap 5。
- mergeProgress：页并集不丢页、maxProgress 单调、同刻 deviceId（含缺失）、last 取新。
- mergeSettings：逐字段 stamps、annotationTypes 整体、缺 stamp 缺省。
- mergeGraveyard：并集、较早 purgedAt、只增不减。

**db**
- ★ 账号串数据防护：两 scope 同 id 不同内容互不可见；switchScope 后 reactive progress/prefs 为 **replace** 语义（账号 A 的页/偏好不得残留进账号 B 视图）。
- ★ 认领迁移：anon 逐条复制去重、同 id 走合并、claimedBy 后 anon 写抛错、登出回 anon 数据仍在。
- ★ outbox 合并：put+put→put、put+delete→delete、未同步创建+删除→硬删无 op（D18）、撤销重建 rev+1。
- ★ 崩溃恢复：rebuildOutbox 与 dirty 互为校验（丢 op / 丢 dirty 两种残缺都恢复）。
- 迁移幂等（跑两次结果相同）；★ legacy hash 失配 → 保留旧值 + needsRelocate；旧键不删。
- sanitize：exact 10000/10001、note 20000/20001、prefix 截 32、color/types 枚举外拒绝、offset 负数/非整数拒绝、同段 exact≠slice 拒绝、未知字段保留。
- IDB 不可用 → localStorage 模式；256KB 序列化校验。
- UUIDv7：时间有序、版本位、10k 无碰撞；getRandomValues 缺失降级 v4。

**sync（mock transport + 注入时钟）**
- ★ 412 → 拉远端 → 合并 → 重传；≤3 次仍 412 下轮再来。
- ★ 软删除复活防护：graveyard id 的迟到上传被丢弃 + 远端文件被清；离线设备积压上传不复活已删记录。
- ★ 外部删改：远端文件缺失 → 本地重建上传；未知文件不读不删 + unknownFiles 标记。
- 增量发现：eTag 未变不下载；新增下载；分页（mock nextLink 两页）。
- 退避 1/2/4s ≤3 次（注入 timers/random 断言）；401 → 续期一次 → needs-auth；网络 → offline + online 触发。
- 单飞 + rerun；mutation 3s 防抖合并；状态机派生优先级全组合。
- GC 90 天边界（89d23h 不清 / 90d 清）；溢出文件随父清除；graveyard 上传合并。
- resolveConflict 三选择 × 多副本迭代；both 产生新 uuid 且原 selector 不变。
- ★ 时钟不可信：两侧 updatedAt 乱序（快钟设备）仍走判定表不丢数据；时间戳仅展示。

**anchor（happy-dom DOM fixture）**
- 级别 1：hash 命中 + slice 校验；hash 漂移 → 级别 2。
- 级别 2：exact+prefix+suffix 唯一；重复短语多处命中 → 最近优先 → 平局降级（★ 宁可降级不错关联）。
- 级别 3：supersedes 唯一/多命中（P0 多命中 → 级别 5）；级别 4：dmp 阈值边界、跨段逐段全命中否则整体降级。
- ★ resolve 绝不改记录 selector（深比较前后）。
- NFC 偏移映射：组合字符 fixture（'á' 2→1）、CJK 恒等快路径；domRangeToSelection 跨段 exact '\n' 连接、正文外截取、空选区 null。
- reanchor：rev+1、selectorHistory 追加、cap 5；这是唯一写 selector 路径。
- mark 渲染：跨 em/注解锚点拆分；三种 mark 共存嵌套；clear 各认各的 data（★ 互不误删）。
- T ID / missing / paragraph 降级渲染分级。

**export / share / auth / transport**
- ★ 导入永不整库覆盖：本地独有记录在导入后存活；非法 JSON / 高 formatVersion → 零写入。
- 信封 roundtrip（含墓碑/conflicts/未知字段）；剥 local；无 token/邮箱字段。
- 导入三策略；preview 计数与 apply 一致；graveyard 丢弃导入记录。
- 256KB 拒绝；DOCX/MD 懒加载（mock import 断言主 bundle 不含）；色 token→hex 映射。
- share：unicode roundtrip、q 200 截断、URL 2000 预算裁剪顺序（D27）、payload 无 note/types、decode 非法 → null。
- auth：mock MSAL loader；login/logout/silent 续期失败 → needs-login；popup-closed；scope=sha256 前 16；clientId='' → not-configured。
- transport：注入 fetch；401/404/412/429/5xx 错误语义；If-Match/If-None-Match 头；分页拼接；remove 404 幂等。

### 7.3 构建侧测试矩阵（node:test）

- ★ ID 稳定性：fixture 语料 → 分配 → 插入/删除/编辑段落 → 重对齐：未变段落旧 ID 不漂移、编辑段落保 ID（score≥0.6）、新段落取新号、删除号不复用。
- ★ 注册表只增不改：分配前后已有条目深相等；nextIndex 单调；supersedes 仅在新条目。
- 拆分/合并检测：两两相邻判定、supersedes 正确、不满足 heuristic 安全侧删+增。
- legacy 索引 1:1：枚举序 === 插件替换序（含 scene-break/subtitle/title-fr）；`<p id="P…" data-legacy="p-00000N">` 格式断言。
- 跨版本一致：同文本两版本同 PID；dev 独有 → T ID 稳定、不入注册表。
- copyright 排除；场景分隔段不参与跨页救援。
- 确定性：同输入两次运行输出逐字节相同。
- fingerprint 黄金向量（D3 表）+ 空白折叠边界。
- --check：未分配 → exit 1；全覆盖 → exit 0；不写文件。
- EPUB 不变：buildBook({root})（footnote 风格）输出 markdown 与改动前一致（fixture 快照）。

### 7.4 前端测试矩阵（happy-dom + VTU，无 Playwright）

通用手法：document.body 注入正文 fixture（`.reader-chapter > .vp-doc > p[id][data-legacy]`）；选区用 happy-dom Range 构造或 vi.mock useSelection 注入 SelectionAnchor；fake-indexeddb 真库断言写入；vi.useFakeTimers 驱动防抖/toast；getBoundingClientRect 无布局 → 定位逻辑断言调用与 clamp 边界值，不断言像素。

- 工具条：选区出现/塌陷消失；★ pointerdown.prevent 后选区仍在（模拟事件断言 defaultPrevented）；色块创建写库；Esc 关闭保留选区；外点关闭；正文外选区不触发；版权页不触发；重叠拒绝提示（D24）；AI 事件 dispatch。
- 弹层：hover 300/120ms 双态（fake timers + pointerType）；pin 遮罩/Esc/焦点归还；编辑 650ms 防抖保存、Cmd+Enter、Esc 放弃；改色即生效；★ 删除→撤销 toast 5s 内恢复（快照重建 rev+1）、超时软删；互斥事件。
- 面板：tab 切换；筛选组合；搜索防抖 + isComposing 保护 + ↑↓/Enter/Esc + sequence 竞态（旧查询作废）；批量删除确认对话框；空态文案；失效徽标与筛选；导出▾菜单。
- 冲突卡片：三按钮 → resolveConflict 调用参数；删除 vs 修改显示「已删除」；逐条迭代 1/N。
- toast：action 槽执行、自动消失计时、aria-live。
- 分享落地：fragment 解析→滚动调用→临时 mark；保存写库；降级文案；关闭卡保留高亮。
- 同步面板（P1）：状态机文案映射；连接两对话框流程（mock auth）；断开保留本地；暂停/恢复；备份提醒 30 天边界。
- 进度横幅（P1）：异页较新才显示；jump/stay/滚动消失；绝不自动跳转。
- 无障碍断言：role/aria-label/aria-expanded/aria-pressed、mark tabindex+Enter、reduced-motion class。

### 7.5 CI 接线（deploy.yml build job，现有测试步骤之后）

```yaml
      - name: Test storage and components
        run: npx vitest run
      - name: Verify paragraph registry
        run: node scripts/assign-paragraph-ids.mjs --check
```

现有 `node --test scripts/tests/*.mjs` 步骤不动（自动拾取新构建测试）。`--check` 在 bootstrap 注册表提交之后才可启用（任务依赖见 §8）。EPUB 工作流不改。

---

## 8. 分期任务清单

归属：B=后端（数据/构建），F=前端。依赖列前置任务 ID。验收标准一句话可测。

### P0（本地全量 + 永久 ID + 永久链接 + JSON 导入导出）

| ID | 归属 | 任务 | 依赖 | 验收标准 |
|---|---|---|---|---|
| B0-1 | B | fingerprint.mjs + paragraph-ids.mjs（枚举/对齐/分配/T ID）+ node 测试 | — | §7.3 矩阵全绿，黄金向量两侧一致 |
| B0-2 | B | assign 脚本 + --bootstrap 全正式版本升序分配 + 注册表提交 | B0-1 | 注册表覆盖全部正式版本段落，--check exit 0，条目只增不改 |
| B0-3 | B | paragraphs.mjs 插件 + prepare-site 接线 + public 资产 + node 测试 | B0-2 | 渲染产物 `<p id="P…" data-legacy="p-…">`；搜索索引用 P ID；EPUB 产物逐字节不变 |
| B0-4 | B | package.json 依赖/scripts + vitest 配置 + tests/setup + CI vitest 步骤 | — | `npm test` 双套件绿；CI 新步骤通过 |
| B0-5 | B | types.ts + util.ts + config.ts + db.ts（schema/scope/CRUD/outbox/sanitize/迁移/认领）+ 测试 | B0-4 | §7.2 db 矩阵全绿；localStorage→IDB 迁移幂等、旧键保留 |
| B0-6 | B | merge.ts 全表 + 测试 | B0-5 | 判定表 #1–#11 逐行断言绿 |
| B0-7 | B | anchor.ts 级别 1/2/5 + DOM 映射 + mark 渲染 + 测试 | B0-3, B0-5 | 定位分级正确；resolve 不改 selector；三种 mark 共存互不误删 |
| B0-8 | B | share.ts + export.ts JSON 信封/导入 + 测试 | B0-6 | 导入永不整库覆盖；URL 预算裁剪；信封 roundtrip |
| B0-9 | B | reader.ts 适配器 + initUserStorage 编排 + vue.ts 桥 + 测试 | B0-5 | 迁移后 progress 走 IDB、prefs 双写；IDB 不可用降级；ReaderDock 零改动恢复进度 |
| F0-1 | F | usePopoverPosition 提取 + ReaderAnnotations 回归 + useToasts/ReaderToast + custom.css token | B0-4 | 注解弹层行为回归不变；toast 撤销可用；四主题 5 token |
| F0-2 | F | useSelection + ReaderSelectionToolbar + ReaderAIEdit 收编 | B0-7, B0-9, F0-1 | 选区创建高亮写库；AI 圆钮退役、事件流程文案不变；pointerdown.prevent 保选区 |
| F0-3 | F | ReaderHighlightPopover + 正文 mark 接线 + 互斥 | B0-7, F0-1 | 编辑/改色/删除撤销/复制链接全通；与注解弹层互斥 |
| F0-4 | F | ReaderExcerpts（双 tab/筛选/搜索/批量/空态）+ Layout/Dock 面板扩展 | B0-9, F0-1 | 面板跳转闪烁定位；键盘导航；批量确认；状态行「仅保存在本机」 |
| F0-5 | F | 书签 UI（工具条 toggle + 页边图标 + 列表 tab） | B0-9, F0-2 | 段落级 toggle、撤销、首句 40 字列表 |
| F0-6 | F | ReaderShareLanding + 永久链接入口（工具条/弹层/面板） | B0-8, F0-2 | 免登录落地定位+临时高亮+保存；降级文案诚实 |
| F0-7 | F | JSON 导入导出 UI（导出▾ + 预览对话框 + 策略单选） | B0-8, F0-4 | 预览计数准确；非法文件零写入；默认本机胜 |
| F0-8 | F | 组件测试全量（§7.4 P0 部分） | F0-2…F0-7 | 无 Playwright；矩阵绿 |

### P1（MSAL + 同步 + 冲突 UI）

| ID | 归属 | 任务 | 依赖 | 验收标准 |
|---|---|---|---|---|
| B1-1 | B | transport.ts + 真实 Graph spike（If-Match/分页/eTag，D15） | B0-5 | mock 矩阵绿；spike 结论记录回本协议 §1 |
| B1-2 | B | auth.ts（MSAL 懒加载 + 配置占位 + mock 注入） | B0-4 | 未配置禁用；测试不触真实 OAuth；scope 隔离 |
| B1-3 | B | sync.ts 引擎（状态机/回合/退避/GC/认领接线）+ 测试 | B0-6, B1-1, B1-2 | §7.2 sync 矩阵全绿；复活防护/串数据防护通过 |
| B1-4 | B | 账号切换/登出/认领端到端 + 进度 settings 同步 | B1-3 | 切账号界面只显示新空间+anon；登出保留全部库 |
| F1-1 | F | ReaderSyncPanel（连接两对话框/断开/切换/状态行/备份提醒） | B1-2, F0-4 | 流程文案与真实 scope 一致；断开保留本地 |
| F1-2 | F | ☁︎ 图标 + 状态机文案 + 红点 + 离线/错误/暂停态 | B1-3, F1-1 | 八态映射正确；同步不打断阅读 |
| F1-3 | F | ReaderConflictCard + 冲突列表 + 三裁决 | B1-3, F1-1 | 败者不静默丢；both 新记录；处理完自动同步 |
| F1-4 | F | ReaderProgressBanner + ContinueReading 水合验证 | B1-4 | 异页横幅绝不自动跳转；同页静默 |
| F1-5 | F | P1 组件测试 | F1-1…F1-4 | 矩阵绿 |

### P2（模糊定位 + 重锚 + 可读摘录集）

| ID | 归属 | 任务 | 依赖 | 验收标准 |
|---|---|---|---|---|
| B2-1 | B | anchor 级别 3/4（lineage 裁决 + dmp 懒加载）+ 测试 | B0-7 | 阈值边界/跨段整体降级/多候选不自动挑 |
| B2-2 | B | export.ts Markdown + DOCX（docx 懒加载）+ 测试 | B0-8 | 主 bundle 零增量；每条附永久链接；色映射 |
| F2-1 | F | 降级渲染分级 + 手动重锚流程 + 失效筛选 + 失效 toast | B2-1, F0-3 | 重锚显式确认才写 selector；取消原样保留 |
| F2-2 | F | 摘录集生成对话框 + OneDrive exports/ 可选 | B2-2, F1-1 | 范围/选项生效；spinner；下载 |
| F2-3 | F | 重叠高亮完整支持（放开 D24 限制）+ pink 第 5 色 | B2-1, F0-3 | 重叠叠加渲染；点击列出覆盖摘录（≤3+查看全部） |
| F2-4 | F | data-legacy 移除（D17 窗口结束）+ 清理 | F2-1 | 移除后迁移仍走 public map；搜索 legacy 回退同步移除 |

---

## 9. 验收对照（plan §9）

| plan 验收项 | 本协议支撑点 | 验证任务 |
|---|---|---|
| 不登录断网可阅读摘录 | IDB 权威 + localStorage 降级 + outbox 积压不阻塞（§5.2/§5.7） | B0-5, B0-9, F0-2 |
| 跨设备同步 | 一条一文件 + eTag 增量 + 文档合并（§5.4） | B1-3, B1-4 |
| Token 权限边界 | 仅 Files.ReadWrite.AppFolder + approot transport（§5.5/§5.6）；上线前真实账号实测 | B1-1, B1-2 |
| 并发不静默丢失 | 判定表全表 + ConflictCopy + graveyard（§5.4） | B0-6, B1-3 测试 |
| 译文更新可重定位 | 注册表对齐保 ID + 五级管线 + 手动重锚（§2.4/§5.3） | B0-1, B0-7, B2-1, F2-1 |
| 外链免授权定位 | SharePayload 自包含无凭证（§5.8） | B0-8, F0-6 |
| 随时导出脱离 OneDrive | 全量信封含墓碑 + 导入逐条合并（§5.8） | B0-8, F0-7 |

上线前实测清单（plan §9 末段，P1 执行）：个人 Microsoft 账号授权、approot 目录权限边界、If-Match content PUT 行为（D15）、浏览器 IndexedDB/剪贴板/dialog 兼容、并发同步双设备实测。