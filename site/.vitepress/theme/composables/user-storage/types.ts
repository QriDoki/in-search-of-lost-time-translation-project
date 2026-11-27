/**
 * 用户存储系统类型契约（protocol §3）。所有实体类型从此文件导出；前端不得另造。
 * 照抄 data-model 并补全局部细节（补全处注释标明）。
 */

/* ---------- 基础 ---------- */
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'
export type EntityKind = 'highlight' | 'bookmark' | 'progress' | 'settings'
export type Scope = string // 'anon' | 'ms-' + sha256(graphUser.id).hex.slice(0,16)

export interface Selector {
  exact: string // kind='note' 时 ''；跨段以 '\n' 连接；≤ 10000 字符
  prefix: string // ≤ 32 字符（创建时截断）
  suffix: string // ≤ 32 字符
  start: { paragraphId: string; offset: number } // NFC UTF-16 下标
  end: { paragraphId: string; offset: number }
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

export interface SelectorHistoryEntry {
  // D19/interaction §9.2：手动重锚保留原始锚点
  selector: Selector
  revision: string
  textHash: string
  replacedAt: string
}

export interface Highlight {
  id: string // UUIDv7
  schemaVersion: 1
  kind: 'highlight' | 'note'
  chapterId: string // = pageId
  paragraphId: string // = selector.start.paragraphId（冗余索引）
  revision: string // = book.buildVersion（D21）
  textHash: string // fnv1a36(起始段 rawText)
  selector: Selector
  note: string // ≤ 20000 字符
  types: string[] // annotation-types.mjs 枚举（sanitizeAnnotationTypes）
  color: HighlightColor
  createdAt: string // ISO 8601 UTC ms
  updatedAt: string
  deletedAt: string | null
  rev: number
  deviceId: string
  conflicts?: ConflictCopy[] // ≤ 3；溢出见 D16
  selectorHistory?: SelectorHistoryEntry[] // ≤ 5，溢出丢最旧；仅重锚时追加
  [unknown: string]: unknown // 未知字段原样保留回写（解析时不丢弃）
}

export interface Bookmark {
  id: string
  schemaVersion: 1
  chapterId: string
  paragraphId: string
  label: string // 可 ''；唯一可编辑内容字段
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
    baseSnapshot: Record<string, unknown> | null // 三方合并共同祖先（云端结构）
    readOnly?: 'higher-schema' // 远端 schemaVersion 更高时置位
  }
}
export type LocalHighlight = Highlight & LocalOnly
export type LocalBookmark = Bookmark & LocalOnly

/* ---------- 进度与设置 ---------- */
export interface ReadingPosition {
  pageId: string
  paragraphId: string // 迁移后为 P ID；失配保留旧值
  paragraphHash: string
  offset: number // 0–1
  pageProgress: number // 0–1
  maxProgress: number // 单调不减
  updatedAt: string
  deviceId?: string // D12 补全：同刻合并 tie-break
  needsRelocate?: boolean // D12 补全：迁移失配标记，下次成功保存即清除
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
  stamps: Record<string, { t: string; d: string }> // 每字段 {时间, 设备}
}
export interface DevicePrefs {
  width: number
} // settings 表 key='device'，不同步

/* ---------- 同步 ---------- */
export interface OutboxOp {
  seq?: number
  entity: EntityKind
  id: string // progress/settings 固定 'doc'
  type: 'put' | 'delete'
  createdAt: string
}
export interface CloudStateRow {
  id: string // 记录 uuid；文档用 'progress' | 'settings' | 'graveyard'
  eTag: string
  syncedRev: number
  purged?: boolean
}
export interface GraveyardDoc {
  schemaVersion: 1
  entries: Record<string, { purgedAt: string }> // 按 id 并集，同 id 取较早 purgedAt
}
export type SyncState =
  | 'disconnected'
  | 'synced'
  | 'syncing'
  | 'pending'
  | 'offline'
  | 'conflict'
  | 'error'
  | 'paused'
  | 'needs-auth'
export interface SyncStatus {
  state: SyncState
  pending: number // outbox 长度
  conflicts: number // 含 conflicts 的存活记录数
  lastSyncAt: string | null
  lastError: string | null
  unknownFiles: boolean // 云端目录存在本应用之外的文件（interaction §11）
}
export interface ConflictInfo {
  entity: 'highlight' | 'bookmark'
  id: string
  current: Highlight | Bookmark // 本机当前值（合并胜者）
  copies: ConflictCopy<HighlightSnapshot | BookmarkSnapshot>[] // 待处理败者副本
}

/* ---------- 导入导出 ---------- */
export interface ExportEnvelope {
  format: 'proust-reader-export'
  formatVersion: 1
  app: { name: 'proust-reader'; buildVersion: string }
  exportedAt: string
  scope: Scope // 仅参考，导入不强制匹配
  data: {
    highlights: Highlight[] // 含墓碑与 conflicts；无 local 块、无 token、无邮箱
    bookmarks: Bookmark[]
    progress: ProgressDoc
    settings: SettingsDoc
  }
}
export type ImportStrategy = 'local' | 'import' | 'both'
export interface ImportPreview {
  added: number
  updated: number
  skipped: number
  conflicts: { id: string; entity: 'highlight' | 'bookmark'; localUpdatedAt: string; importUpdatedAt: string }[]
}
export interface ImportResult {
  added: number
  updated: number
  skipped: number
  conflictsKept: number
}

/* ---------- 永久链接 ---------- */
export interface SharePayload {
  v: 1
  c: string // chapterId
  s: string // start.paragraphId
  e?: string // end.paragraphId（同段省略）
  q: string // exact（≤ 200 字符，超限截断）
  b?: string // prefix
  a?: string // suffix
}

/* ---------- 定位 ---------- */
export interface ParagraphInfo {
  id: string // P / T / legacy ID（DOM 实际 id）
  legacy: string // data-legacy（可 ''）
  text: string // NFC rawText
  hash: string // fnv1a36(rawText)
  node: HTMLElement
}
export interface ParagraphRange {
  paragraphId: string
  start: number
  end: number
}
export type AnchorResult =
  | { status: 'exact'; level: 1 | 2; ranges: ParagraphRange[] }
  | { status: 'fuzzy'; level: 4; ranges: ParagraphRange[] } // UI「已重新定位」
  | { status: 'paragraph'; level: 5; paragraphId: string } // UI「定位失效」
  | { status: 'missing' } // UI「段落已不存在」

/* ---------- 面板（前端共用） ---------- */
export type ReaderPanel = 'toc' | 'settings' | 'excerpts' | 'sync' | null

/* ---------- 配置 ---------- */
export interface UserStorageConfig {
  clientId: string // '' = 未配置，同步禁用
  authority: string // 缺省 'https://login.microsoftonline.com/common'
  redirectUri: string // 缺省 window.location.origin
  appFolder: string // 缺省 'Proust Reader'（仅展示文案用；Graph approot 由 scope 决定）
}

/* ---------- 认证 ---------- */
export interface AuthAccount {
  scope: Scope // 'ms-' + sha256hex(graphUser.id).slice(0,16)
  displayName: string
  email: string // 仅本地展示，永不上传/导出
}
export class AuthError extends Error {
  constructor(
    message: string,
    public code: 'needs-login' | 'not-configured' | 'popup-closed' | 'network',
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
export interface AuthProvider {
  init(): Promise<void> // 恢复缓存会话（静默）
  current(): AuthAccount | null
  login(): Promise<AuthAccount> // popup；失败抛 AuthError
  logout(): Promise<void>
  getToken(): Promise<string> // 静默获取/续期；失败抛 AuthError('needs-login')
  onChange(cb: (account: AuthAccount | null) => void): () => void
}

/* ---------- Graph transport（唯一外部 IO 面，可 mock） ---------- */
export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message)
    this.name = 'GraphError'
  }
}
export interface GraphItem {
  name: string
  eTag: string
  id: string
}
export type GraphFolder = 'highlights' | 'bookmarks' | 'exports' | 'root'
export interface GraphTransport {
  list(folder: GraphFolder): Promise<GraphItem[]> // 内部分页（@odata.nextLink），携带 eTag
  read(path: string): Promise<{ body: string; eTag: string } | null> // 404 → null
  write(
    path: string,
    body: string | ArrayBuffer,
    cond?: { ifMatch?: string; ifNoneMatch?: '*' },
  ): Promise<{ eTag: string }>
  remove(path: string, cond?: { ifMatch?: string }): Promise<void>
}
// path 相对 approot，如 'highlights/{id}.json'、'progress.json'
// 错误语义：401 → GraphError(401,false)；404 → read 返回 null / remove 幂等成功；
// 412 → GraphError(412,false)（冲突）；429/5xx/网络 → retryable=true