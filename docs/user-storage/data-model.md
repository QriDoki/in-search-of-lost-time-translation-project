# 数据建模设计

> **⚠️ 段落 ID 部分已被取代（2026-11-28）**：本文 §2 的「全局永久段落 ID + `publish/paragraph-map.json` 注册表」已移除，改为**位置编码段落 ID**（`{章节键}_{非空白行序号:0000}`，如 `vol1-1_0003`），由稿件源位置直接决定，无注册表。现行实现见 `DEVELOPMENT.md`。其余实体结构、本地库表、云端格式、同步与合并规则仍有效。

本文是 [plan.md](./plan.md) 的详细数据建模，覆盖实体结构、本地库表、云端文件格式、同步元数据、合并规则与迁移路径。命名与 plan.md 保持一致：摘录记录称 `Highlight`（批注是其一种形态），云端目录沿用 `highlights/`。

## 0. 与现有代码的衔接

| 现有事实 | 建模决策 |
|---|---|
| `pageId`（`vol1-01` 等）由 `publish/arrange.json` 推导，跨版本稳定 | 直接作为 `chapterId`，不再另造章节 ID |
| 段落 ID 目前是渲染期页内序号 `p-000001`（`site/.vitepress/paragraphs.mjs`），不永久 | 新增全局永久段落 ID（§2），构建期注入；旧序号保留为迁移索引 |
| 阅读进度在 localStorage `lost-time:progress:v2`，含 `paragraphHash` | `ReadingPosition` 结构沿用并迁入 IndexedDB（§12） |
| 批注已有 emoji 类型体系（`scripts/lib/annotation-types.mjs`） | `Highlight.types` 直接复用该枚举 |
| 阅读器有多版本路径 `/versions/{v}/` | 永久段落 ID 以法文底本为基准，跨译文版本全局唯一；`revision` 记录创建时的译本 SHA |

## 1. 实体总览与存储位置

```text
法文底本 ──(构建期)──> 段落 ID 映射表 paragraph-map.json（仓库产物，非用户数据）
                              │ 继承
用户数据（IndexedDB 权威 ──同步──> OneDrive JSON 权威副本）
  ├── Highlight   摘录 / 批注（含软删除、冲突副本）
  ├── Bookmark    书签
  ├── Progress    阅读进度（每页一条 + last）
  └── Settings    阅读偏好（部分字段仅设备本地）
```

| 实体 | IndexedDB 表 | OneDrive 文件 | 粒度 |
|---|---|---|---|
| Highlight | `highlights` | `highlights/{id}.json` | 一条一文件 |
| Bookmark | `bookmarks` | `bookmarks/{id}.json` | 一条一文件 |
| Progress | `progress`（每页一行）+ `meta.last` | `progress.json` | 整份一文件，按页合并 |
| Settings | `settings` | `settings.json` | 整份一文件，按字段合并 |
| 同步元数据 | `meta`、`cloudState`、`outbox` | 不上传 | 仅本地 |
| 冲突副本 | 内嵌于 Highlight 记录 | 随记录同文件 | 见 §4.4 |
| 清除台账 | `meta.graveyard` | `graveyard.json` | 追加合并，见 §8.4 |

JSON 是唯一权威格式；DOCX / Markdown 导出是单向产物，不参与同步与导入。

## 2. 永久段落 ID 与映射表

### 2.1 ID 格式

- 格式：`P` + 6 位十进制，如 `P001234`。
- 按法文底本全书阅读顺序一次性分配，**只增不改**；新段落取未用过的号，不复用已删除段落的号。
- 中文译文与 HTML 渲染继承同一 ID。渲染产物中 `<p id="P001234" data-legacy="p-000007">`：`id` 为永久 ID，`data-legacy` 保留旧页内序号仅供迁移（§12），一个版本后移除。

### 2.2 映射表（仓库构建产物）

`publish/paragraph-map.json`，随译文仓库版本化，不属于用户数据：

```jsonc
{
  "schemaVersion": 1,
  "revision": "<git commit SHA>",
  "paragraphs": {
    "P001234": {
      "fr": { "file": "raw-proust-corpus/vol1.txt", "index": 42 },
      "hash": "a1b2c3d4",          // 创建映射时法文段落文本的 FNV-1a 哈希
      "supersedes": ["P000100"]     // 本段吸收了哪些旧 ID（合并）
    },
    "P001235": { "fr": { "...": "..." }, "hash": "...", "supersedes": ["P000100"] }
  }
}
```

拆分 / 合并的解析规则（供 plan §5.2 定位管线使用）：

1. 旧 ID 直接存在 → 命中。
2. 否则查 `supersedes` 包含旧 ID 的条目：唯一命中 → 命中（合并）；多个命中 → 拆分，候选集交给精确匹配 / Fuzzy Anchoring 裁决，**不自动挑选**。
3. 无命中 → 降级段落定位，允许手动重新关联。

### 2.3 偏移量基准

所有字符偏移量（`offset`、`start`、`end`）定义为：对渲染段落的 `visibleText`（`paragraphs.mjs` 现有函数：去标签、去锚点链接、解码实体）做 **NFC 归一化**后的 UTF-16 code unit 下标。创建摘录时必须满足 `exact === text.slice(start.offset, end.offset)`（同段时）。`textHash` 用同一基准计算，用于低成本检测译文漂移。

## 3. 公共约定

| 项 | 约定 |
|---|---|
| 记录 ID | UUIDv7（时间有序，便于按创建时间粗排与调试）；`crypto.randomUUID()` 不可用时降级 v4 |
| 设备 ID | UUIDv4，存 localStorage `lost-time:device-id`，同一浏览器跨账号库共用 |
| 时间戳 | ISO 8601 UTC 毫秒，如 `2026-11-27T08:30:00.000Z`。**设备时钟不可信**：时间戳只用于展示与同设备排序；跨设备合并一律走 §8 的三方合并，不以墙钟裁决 |
| `schemaVersion` | 每条记录自带，当前为 `1`。读到更高版本：只读展示、禁止编辑与上传（防止旧端覆盖新端数据）；读到更低版本：读时迁移链升级 |
| 未知字段 | 解析时原样保留并回写（向前兼容），不得丢弃 |
| 软删除 | `deletedAt: string \| null`。删除 = 置 `deletedAt` 并照常同步；文件保留为墓碑，GC 见 §8.4 |
| 云端序列化 | 上传前剥离仅本地字段（§7.2 `local` 块）；下载后本地字段重建 |

## 4. Highlight（摘录 / 批注）

### 4.1 结构

```typescript
type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

interface Highlight {
  id: string                    // UUIDv7
  schemaVersion: 1
  kind: 'highlight' | 'note'    // note = 段落级批注，无字符级选区
  chapterId: string             // = pageId，如 'vol1-01'
  paragraphId: string           // 起始段落永久 ID（冗余索引字段，= selector.start.paragraphId）
  revision: string              // 创建时译本 Git Commit SHA
  textHash: string              // 创建时起始段落 visibleText 的 FNV-1a 哈希
  selector: {
    exact: string               // 摘录原文；kind='note' 时为 ''
    prefix: string              // 选区前上下文，≤ 32 字符
    suffix: string              // 选区后上下文，≤ 32 字符
    start: { paragraphId: string; offset: number }
    end:   { paragraphId: string; offset: number }
  }
  note: string                  // 批注正文，可为 ''
  types: string[]               // emoji 类型标记，复用 annotation-types.mjs 枚举
  color: HighlightColor         // 语义色 token，主题负责映射具体色值
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  rev: number                   // 本设备编辑计数，每次修改 +1；仅同设备内可比
  deviceId: string              // 最后编辑设备
  conflicts?: ConflictCopy[]    // 冲突副本，见 §4.4
}
```

约定：

- **跨段落摘录**：`start.paragraphId !== end.paragraphId`，`exact` 为跨段拼接文本（段间以 `\n` 连接）。`prefix` 取自起始段、`suffix` 取自结束段。重定位时逐段校验，任一段失配即整体降级，不允许部分错误关联。
- **段落级批注**（`kind: 'note'`）：`selector.exact/prefix/suffix` 为空，`start.offset = 0`，`end.offset = 起始段落文本长度`。它与摘录共用一条存储与同步管线，这是把批注并入 Highlight 而非独立实体的原因。
- `color` 是 token 不是色值：换主题、导出 DOCX 时各自映射，数据不携带渲染细节。
- 原始 `exact` 永不因译文更新被自动改写；重定位只更新运行时解析结果，不回写 `selector`（用户显式"重新关联"时才生成新 `selector` 并 `rev+1`）。

### 4.2 云端文件示例

`Apps/Proust Reader/highlights/01933f2e-7c1a-7b3e-9f2a-1c2d3e4f5a6b.json`：

```json
{
  "id": "01933f2e-7c1a-7b3e-9f2a-1c2d3e4f5a6b",
  "schemaVersion": 1,
  "kind": "highlight",
  "chapterId": "vol1-01",
  "paragraphId": "P000312",
  "revision": "5c3ea77...",
  "textHash": "9f86d081",
  "selector": {
    "exact": "很久以来，我都是早早就躺下了",
    "prefix": "贡布雷。",
    "suffix": "有时候，蜡烛才灭",
    "start": { "paragraphId": "P000312", "offset": 0 },
    "end":   { "paragraphId": "P000312", "offset": 14 }
  },
  "note": "🔤 开篇第一句的时态处理",
  "types": ["🔤"],
  "color": "yellow",
  "createdAt": "2026-11-27T08:30:00.000Z",
  "updatedAt": "2026-11-27T08:30:00.000Z",
  "deletedAt": null,
  "rev": 1,
  "deviceId": "d3b07384-d9a0-4e9b-8c12-f2a3b4c5d6e7"
}
```

### 4.3 尺寸约束

| 字段 | 上限 | 超限处理 |
|---|---|---|
| `selector.exact` | 10 000 字符 | 创建时截断提示，拒绝保存 |
| `selector.prefix/suffix` | 各 32 字符 | 创建时截断 |
| `note` | 20 000 字符 | 拒绝保存 |
| `conflicts` | 3 份 | 溢出时最旧副本转入 `highlights/{id}.conflict-{n}.json` 独立文件 |
| 单文件 | 256 KB | 序列化后校验，超限报错不上传 |

### 4.4 冲突副本

```typescript
interface ConflictCopy {
  deviceId: string
  rev: number
  updatedAt: string
  keptAt: string               // 冲突被记录的时间
  snapshot: Pick<Highlight, 'note' | 'types' | 'color' | 'selector' | 'deletedAt'>
}
```

冲突副本只保存会冲突的内容字段，不复制整条记录；由用户在 UI 中显式采纳或丢弃，采纳即一次正常编辑（`rev+1`）。系统永不自动丢弃冲突副本。

## 5. Bookmark（书签）

```typescript
interface Bookmark {
  id: string                   // UUIDv7
  schemaVersion: 1
  chapterId: string
  paragraphId: string          // 书签所在段落永久 ID
  label: string                // 用户命名，可为 ''（UI 显示段落首句）
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  rev: number
  deviceId: string
}
```

书签是位置标记，唯一可编辑字段是 `label`，冲突合并退化为 label 的 LWW + 冲突副本（复用 §8 规则，字段集只有 `label`）。不设 `offset`：书签精度到段落即可，避免译文微调导致书签漂移。

## 6. Progress 与 Settings

### 6.1 Progress

云端 `progress.json` 整份一文件，内部按页合并（§8.3）：

```typescript
interface ProgressDoc {
  schemaVersion: 1
  last: ReadingPosition | null
  pages: Record<string, ReadingPosition>   // key = pageId
}

interface ReadingPosition {                // 沿用现有 v2 结构
  pageId: string
  paragraphId: string                      // 永久 ID（迁移后）
  paragraphHash: string                    // 段落 visibleText 哈希，漂移检测
  offset: number                           // 段落内位置 0–1
  pageProgress: number                     // 当前页进度 0–1
  maxProgress: number                      // 历史最大进度，单调不减
  updatedAt: string
}
```

- 本地每页一行存 `progress` 表，`last` 存 `meta`；上传时聚合为 `ProgressDoc`。
- 写入节流：滚动停止 5s 或翻页时落库；同步优先级低于摘录，失败静默重试。
- `maxProgress` 合并取两侧最大值（单调语义），其余字段按页 LWW。

### 6.2 Settings

```typescript
interface SettingsDoc {
  schemaVersion: 1
  prefs: {
    fontSize: number
    lineHeight: number
    fontFamily: 'serif' | 'sans' | 'kai'
    theme: 'paper' | 'light' | 'sepia' | 'dark'
    annotationTypes: string[]
  }
  stamps: Record<string, { t: string; d: string }>  // 每字段最后修改 {时间, 设备}
}
```

- **同步字段**：上表 `prefs` 全部。
- **仅设备本地**：`width`（版心宽度，依赖屏幕尺寸）及未来的窗口/滚动类偏好，存 `settings` 表 `key='device'` 行，不进 `settings.json`。
- 合并按字段比较 `stamps`（时间相同比 `deviceId` 字典序），逐字段取胜者；`annotationTypes` 作为整体字段比较，不做数组元素级合并。

## 7. 本地库（Dexie / IndexedDB）

### 7.1 账号隔离与库名

```text
库名：proust-reader-v1-{scope}
scope = 'anon'                          未登录
      | 'ms-' + sha256(graphUser.id).slice(0, 16)   已登录
```

- 每个 OneDrive 账号一个独立库，切换账号 = 切库，杜绝串数据（plan §7 要求）。
- `anon` 库在首次登录时执行一次性 **认领迁移**：逐条复制到账号库（按 id 去重，账号库已有同 id 则走 §8 合并），完成后 `anon` 库标记 `claimedBy`，保留只读不再写入。
- 登出只切回 `anon` 库，不删除任何库。

### 7.2 表结构

```typescript
db.version(1).stores({
  highlights: 'id, chapterId, paragraphId, updatedAt, deletedAt, dirty, [chapterId+paragraphId]',
  bookmarks:  'id, chapterId, updatedAt, deletedAt, dirty',
  progress:   'pageId',
  settings:   'key',
  cloudState: 'id',        // 云端已知状态：{ id, eTag, syncedRev, purged? }
  outbox:     '++seq, id', // 待上传操作
  meta:       'key',       // deviceId、account、lastSyncAt、graveyard、claimedBy…
})
```

`dirty` 用 `0 | 1`（Dexie 不索引布尔）。每条 Highlight/Bookmark 本地记录 = 云端结构 + 仅本地块：

```typescript
interface LocalOnly {
  local: {
    dirty: 0 | 1
    baseEtag: string | null      // 上次同步成功时云端 eTag；新建未传为 null
    baseSnapshot: object | null  // 上次同步成功时的记录内容，三方合并的共同祖先
  }
}
```

`baseSnapshot` 是 §8 三方合并的关键：没有它就无法区分"谁改了这个字段"。上传前剥离 `local` 块。

### 7.3 outbox 操作

```typescript
interface OutboxOp {
  seq?: number                 // 自增
  entity: 'highlight' | 'bookmark' | 'progress' | 'settings'
  id: string                   // progress/settings 固定为 'doc'
  type: 'put' | 'delete'
  createdAt: string
}
```

outbox 只存指针不存载荷（载荷以实体表当前值为准），同一 `id` 的操作合并为一条：`delete` 覆盖 `put`，新 `put` 覆盖旧 `put`。崩溃恢复后按表内 `dirty` 重建 outbox，二者互为校验。

## 8. 同步与合并规则

### 8.1 单条记录（Highlight / Bookmark）

上传携带 `If-Match: {baseEtag}`（新建不带）。`412 Precondition Failed` 即并发冲突，拉取远端后做**三方合并**：共同祖先 = `baseSnapshot`，两侧 = 本地当前值与远端值。

| 情形 | 规则 |
|---|---|
| 仅一侧修改某字段 | 取修改侧 |
| 两侧修改且值相同 | 取该值 |
| 两侧修改且值不同 | 取 `updatedAt` 较新侧（相同则 `deviceId` 字典序大者），**败者存入 `conflicts`**，不静默丢弃 |
| 一侧删除、一侧编辑 | 保留墓碑（`deletedAt` 生效），编辑侧内容存为 `ConflictCopy`（含 `deletedAt: null`），等用户决定是否恢复 |
| 两侧都删除 | 取较早 `deletedAt` |
| 远端 `schemaVersion` 更高 | 本地只读展示，不上传不合并，提示升级 |

合并结果 `rev = max(两侧 rev) + 1`，`deviceId` 为本机，重新上传。`selector` 与 `textHash`、`revision` 作为整体字段参与合并（不做字段内拆分）。

### 8.2 增量发现

不维护中心化 manifest（避免再造一个全局冲突文件）。每轮同步：

1. 列出 `highlights/`、`bookmarks/` 子项（Graph children 分页，携带 eTag）。
2. 与 `cloudState` 对比：远端新增 / eTag 变化 → 下载合并；本地 `dirty` → 上传。
3. `progress.json`、`settings.json`、`graveyard.json` 各自整份拉取，按 §8.3 / §6.2 / §8.4 合并。

### 8.3 Progress 合并

按 `pageId` 逐页：`maxProgress = max(两侧)`；其余字段取 `updatedAt` 较新侧（同刻比 `deviceId`）。`last` 取两侧 `updatedAt` 较新者。页集合取并集，任何一侧的页不丢失。

### 8.4 墓碑 GC 与清除台账

- 墓碑保留 **90 天**后由任一设备清除：删云端文件、删本地行，并向 `graveyard.json` 追加 `{ id, purgedAt }`。
- `graveyard.json` 是追加型集合，合并 = 按 id 取并集（同 id 取较早 `purgedAt`），天然无冲突。
- 同步时收到台账中已清除的 id：丢弃该记录的一切版本（包括离线设备迟到的上传），防止已删摘录复活。台账只增不减，条目极小（id + 时间），长期可接受。

## 9. 导入 / 导出信封

```jsonc
{
  "format": "proust-reader-export",
  "formatVersion": 1,
  "app": { "name": "proust-reader", "buildVersion": "..." },
  "exportedAt": "2026-11-27T09:00:00.000Z",
  "scope": "anon",                 // 或 'ms-xxxx'；导入时仅作参考，不强制匹配
  "data": {
    "highlights": [ /* 完整记录，含墓碑与 conflicts */ ],
    "bookmarks":  [ /* … */ ],
    "progress":   { /* ProgressDoc */ },
    "settings":   { /* SettingsDoc */ }
  }
}
```

- 导出含墓碑（保证"删除"这一事实也能跨备份传播）；不含 `local` 块、token、账号邮箱。
- 导入 = 按 id 逐条走 §8 合并（本地当前值为一侧，导入值为另一侧，`baseSnapshot` 缺失时退化为"两侧修改即冲突副本"），**永不整库覆盖**。
- `formatVersion` 高于本机支持：拒绝导入并提示，不做猜测性解析。

## 10. 永久链接载荷

URL fragment 自包含定位信息（plan §5.3），不含批注、类型、凭证：

```typescript
interface SharePayload {
  v: 1
  c: string          // chapterId
  s: string          // start.paragraphId
  e: string          // end.paragraphId（同段时可省略）
  q: string          // exact
  b?: string         // prefix（可省略以缩短 URL）
  a?: string         // suffix
}
```

编码：`#share=` + base64url(JSON)。整条 URL 目标 ≤ 2000 字符；`q` 超 200 字符时截断并依赖段落 ID + Fuzzy 定位。打开链接后按 plan §5.2 管线解析，失败降级到段落并提示，不静默错关联。

## 11. Schema 演进

- 记录级 `schemaVersion` + 读时迁移链（`migrations: Record<number, (old) => new>`），迁移在读取时惰性执行并落库。
- 信封级 `formatVersion` 独立演进，导入兼容窗口：当前版及前一版。
- 新增可选字段不需要升版本（未知字段保留规则已覆盖）；改语义、删字段、改偏移量基准必须升版本并写迁移。
- 段落 ID 映射表自身也有 `schemaVersion`，与用户数据版本解耦。

## 12. 存量数据迁移（localStorage → IndexedDB）

首次启动新版阅读器时一次性执行，幂等：

1. `lost-time:progress:v2` → 逐页转换：旧 `paragraphId`（`p-000007`）经构建期生成的 **legacy 索引**（`pageId + 旧序号 → 永久 ID`）映射；用现有 `paragraphHash` 校验映射结果，失配则保留旧值并标记 `needsRelocate`，交给定位管线。`maxProgress` 原样保留。
2. `lost-time:reader-prefs:v2` → `SettingsDoc.prefs`；`width` 落入设备本地行。`stamps` 初始化为迁移时间 + 本机 deviceId。
3. 迁移成功后写 `meta.legacyMigrated = true`；**旧 localStorage 键保留不删**，作为回滚保险，两个大版本后再清理。

## 13. 验收对照

| plan §9 验收项 | 本模型支撑点 |
|---|---|
| 断网可用 | IndexedDB 权威，outbox 积压不阻塞读写 |
| 多设备同步 | 一条一文件 + eTag 增量（§8.1–8.2） |
| 并发不静默丢失 | 三方合并 + ConflictCopy + 墓碑（§8.1、§4.4） |
| 译文更新可重定位 | 永久 ID + supersedes 谱系 + textHash + 五级降级（§2、plan §5.2） |
| 外链免授权定位 | SharePayload 自包含，无凭证（§10） |
| 随时导出脱离 OneDrive | 导出信封含全量与墓碑，导入逐条合并（§9） |
| 账号隔离 | 每账号独立 Dexie 库 + 认领迁移（§7.1） |

## 14. 待定项（实施前需验证）

1. Graph 对 approot 子目录 children 列表的分页与 eTag 行为、`If-Match` 在 content PUT 上的实际支持（plan 已要求上线前实测）。
2. 法文底本段落切分口径（`raw-proust-corpus` 与译文的段落对齐粒度），决定永久 ID 总量与映射表体积。
3. `graveyard.json` 在极端多年使用后的体积上限是否需要分片（当前估算：万条摘录 × ~60B ≈ 600KB，可接受）。