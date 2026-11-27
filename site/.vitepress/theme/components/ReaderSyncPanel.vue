<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useToasts } from '../composables/useToasts'
import ReaderDataTools from './ReaderDataTools.vue'
import ReaderConflictCard from './ReaderConflictCard.vue'
import {
  createGraphTransport,
  currentDb,
  deleteScopeDatabase,
  getProgressDoc,
  getSyncAuth,
  getUserStorageConfig,
  listBookmarks,
  listHighlights,
  useSyncState,
  useUserStorage,
  type ConflictInfo,
} from '../composables/user-storage'

const { push } = useToasts()
const { mode, account } = useUserStorage()
const { status, engine } = useSyncState()

const config = getUserStorageConfig()
const connecting = ref(false)
const explainDialog = ref<HTMLDialogElement | null>(null)
const previewDialog = ref<HTMLDialogElement | null>(null)
const disconnectDialog = ref<HTMLDialogElement | null>(null)
const dontShowAgain = ref(false)
const clearCache = ref(false)
const switchMode = ref(false)
const dataTools = ref<InstanceType<typeof ReaderDataTools> | null>(null)

const EXPLAIN_KEY = 'lost-time:sync-explained'

/* ------------------------------------------------------------------ */
/* 状态行文案（与 ☁︎ 图标共用映射）                                      */
/* ------------------------------------------------------------------ */

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - Date.parse(iso)
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return iso.slice(0, 10)
}

const syncText = computed(() => {
  const s = status.value
  switch (s.state) {
    case 'synced': return `已同步 · ${relativeTime(s.lastSyncAt)}`
    case 'syncing': return '正在同步…'
    case 'pending': return `${s.pending} 项待同步`
    case 'offline': return '离线 · 更改已保存在本机'
    case 'conflict': return `${s.conflicts} 条冲突待处理`
    case 'error': return '同步失败 · 重试'
    case 'paused': return '同步已暂停'
    case 'needs-auth': return '需要重新登录'
    default: return '数据仅保存在本机'
  }
})

const syncButtonLabel = computed(() => {
  if (status.value.state === 'syncing') return '同步中…'
  if (status.value.state === 'error') return '重试'
  return '立即同步'
})

/* ------------------------------------------------------------------ */
/* 连接流程（说明对话框 → MSAL popup → 预览计数对话框）                  */
/* ------------------------------------------------------------------ */

const localCounts = ref({ highlights: 0, bookmarks: 0, pages: 0 })
const cloudCounts = ref<{ highlights: number; bookmarks: number } | null>(null)

function startConnect(): void {
  let explained = false
  try {
    explained = localStorage.getItem(EXPLAIN_KEY) === '1'
  } catch {
    explained = false
  }
  if (explained) void doLogin()
  else explainDialog.value?.showModal()
}

function confirmExplain(): void {
  if (dontShowAgain.value) {
    try {
      localStorage.setItem(EXPLAIN_KEY, '1')
    } catch {
      // 隐私模式忽略
    }
  }
  explainDialog.value?.close()
  void doLogin()
}

async function doLogin(): Promise<void> {
  const auth = getSyncAuth()
  if (!auth) {
    push('OneDrive同步功能待上线, 敬请期待', { kind: 'error' })
    return
  }
  connecting.value = true
  try {
    await auth.login()
    await loadPreview()
    previewDialog.value?.showModal()
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'popup-closed') push('未完成登录', { kind: 'info' })
    else if (code === 'not-configured') push('OneDrive同步功能待上线, 敬请期待', { kind: 'error' })
    else push('登录失败，请重试。', { kind: 'error' })
  } finally {
    connecting.value = false
  }
}

async function loadPreview(): Promise<void> {
  const [highlights, bookmarks, progress] = await Promise.all([listHighlights(), listBookmarks(), getProgressDoc()])
  localCounts.value = {
    highlights: highlights.filter((h) => !h.deletedAt).length,
    bookmarks: bookmarks.filter((b) => !b.deletedAt).length,
    pages: Object.keys(progress.pages).length,
  }
  cloudCounts.value = null
  const auth = getSyncAuth()
  if (!auth) return
  try {
    const transport = createGraphTransport(() => auth.getToken())
    const recordName = /^[0-9a-f-]{36}\.json$/i
    const [hs, bs] = await Promise.all([transport.list('highlights'), transport.list('bookmarks')])
    cloudCounts.value = {
      highlights: hs.filter((i) => recordName.test(i.name)).length,
      bookmarks: bs.filter((i) => recordName.test(i.name)).length,
    }
  } catch {
    cloudCounts.value = null
  }
}

function startSync(): void {
  previewDialog.value?.close()
  engine.value?.resume()
  void engine.value?.syncNow()
}

function laterSync(): void {
  previewDialog.value?.close()
  engine.value?.pause()
}

async function relogin(): Promise<void> {
  const auth = getSyncAuth()
  if (!auth) return
  try {
    await auth.login()
    engine.value?.trigger('manual')
  } catch {
    push('未完成登录', { kind: 'info' })
  }
}

/* ------------------------------------------------------------------ */
/* 断开 / 切换                                                         */
/* ------------------------------------------------------------------ */

function askDisconnect(asSwitch: boolean): void {
  switchMode.value = asSwitch
  clearCache.value = false
  disconnectDialog.value?.showModal()
}

async function confirmDisconnect(): Promise<void> {
  const auth = getSyncAuth()
  const scope = account.value?.scope
  const shouldClear = clearCache.value
  disconnectDialog.value?.close()
  try {
    await auth?.logout()
    if (shouldClear && scope) await deleteScopeDatabase(scope)
    push('已断开连接，本机数据已保留。')
  } catch {
    push('断开失败，请重试。', { kind: 'error' })
    return
  }
  if (switchMode.value) startConnect()
}

/* ------------------------------------------------------------------ */
/* 冲突列表（F1-3）                                                    */
/* ------------------------------------------------------------------ */

const conflicts = ref<ConflictInfo[]>([])
const showConflicts = ref(false)
const resolvedCount = ref(0)
/** G3：分母按待裁决副本总数计（interaction §7 逐份裁决 1/N），非记录数。 */
const remainingCopies = computed(() => conflicts.value.reduce((n, c) => n + c.copies.length, 0))

async function loadConflicts(): Promise<void> {
  conflicts.value = (await engine.value?.listConflicts()) ?? []
}

function openConflicts(): void {
  showConflicts.value = true
  resolvedCount.value = 0
  void loadConflicts()
}

async function onResolve(choice: 'local' | 'remote' | 'both'): Promise<void> {
  const c = conflicts.value[0]
  if (!c || !engine.value) return
  await engine.value.resolveConflict(c.entity, c.id, 0, choice)
  resolvedCount.value += 1
  await loadConflicts()
  if (!conflicts.value.length) {
    showConflicts.value = false
    push('冲突已处理，正在同步')
  }
}

watch(
  () => status.value.conflicts,
  (n) => {
    if (showConflicts.value) void loadConflicts()
    if (n === 0) showConflicts.value = false
  },
)

/* ------------------------------------------------------------------ */
/* 备份提醒（>30 天）                                                  */
/* ------------------------------------------------------------------ */

const lastExportAt = ref<string | null>(null)
const backupOverdue = computed(() => {
  if (!lastExportAt.value) return true
  return Date.now() - Date.parse(lastExportAt.value) > 30 * 86400000
})
const backupLabel = computed(() => (lastExportAt.value ? lastExportAt.value.slice(0, 10) : '从未（建议定期导出）'))

async function refreshBackup(): Promise<void> {
  try {
    lastExportAt.value = ((await currentDb().meta.get('lastExportAt'))?.value as string) ?? null
  } catch {
    lastExportAt.value = null
  }
}

function exportBackup(): void {
  void dataTools.value?.exportJson().then(refreshBackup)
}

watch(account, refreshBackup)
onMounted(refreshBackup)
</script>

<template>
  <div class="reader-sync-panel">
    <p v-if="mode === 'localStorage'" class="reader-sync-panel__notice">
      当前浏览器无法持久保存，请及时导出。
      <button type="button" class="reader-text-button" @click="exportBackup">导出</button>
    </p>

    <div v-if="account && status.state === 'needs-auth'" class="reader-sync-panel__banner" role="alert">
      <span>凭证已过期，需要重新登录（阅读与本机摘录不受影响）。</span>
      <button type="button" class="reader-sync-panel__bannerbutton" @click="relogin">重新登录</button>
    </div>

    <section class="reader-sync-panel__account" aria-label="账号">
      <template v-if="account">
        <div class="reader-sync-panel__user">
          <span aria-hidden="true">👤</span>
          <span class="reader-sync-panel__email">{{ account.email || account.displayName }}</span>
        </div>
        <div class="reader-sync-panel__accountactions">
          <button type="button" class="reader-text-button" @click="askDisconnect(false)">断开连接</button>
          <button type="button" class="reader-text-button" @click="askDisconnect(true)">切换账号</button>
        </div>
      </template>
      <template v-else>
        <p class="reader-sync-panel__hint">未连接 · 数据仅保存在本机</p>
        <button type="button" class="reader-sync-panel__primary" :disabled="connecting" @click="startConnect">
          {{ connecting ? '登录中…' : '连接 OneDrive' }}
        </button>
      </template>
    </section>

    <section v-if="account" class="reader-sync-panel__statusrow" aria-label="同步状态">
      <span class="reader-sync-panel__status">☁︎ {{ syncText }}</span>
      <button
        type="button"
        class="reader-text-button"
        :disabled="status.state === 'syncing'"
        @click="engine?.syncNow()"
      >{{ syncButtonLabel }}</button>
      <button type="button" class="reader-text-button" @click="status.state === 'paused' ? engine?.resume() : engine?.pause()">
        {{ status.state === 'paused' ? '恢复同步' : '暂停' }}
      </button>
    </section>

    <p v-if="account && status.unknownFiles" class="reader-sync-panel__notice">云端目录存在本应用之外的文件（不会读取或删除）。</p>

    <section v-if="account && status.conflicts > 0 && !showConflicts" class="reader-sync-panel__conflicts">
      <span>⚠ {{ status.conflicts }} 条冲突待处理</span>
      <button type="button" class="reader-text-button" @click="openConflicts">查看</button>
    </section>

    <ReaderConflictCard
      v-if="showConflicts && conflicts.length"
      :conflict="conflicts[0]"
      :index="resolvedCount"
      :total="resolvedCount + remainingCopies"
      @resolve="onResolve"
      @later="showConflicts = false"
    />

    <section class="reader-sync-panel__data" aria-label="数据">
      <h3>数据</h3>
      <ReaderDataTools ref="dataTools" />
      <p class="reader-sync-panel__backup" :class="{ 'is-overdue': backupOverdue }">
        上次备份：{{ backupLabel }}
        <button v-if="backupOverdue" type="button" class="reader-text-button" @click="exportBackup">立即备份</button>
      </p>
    </section>

    <!-- 首次连接说明对话框 -->
    <dialog
      ref="explainDialog"
      class="reader-data-dialog reader-ui"
      aria-labelledby="reader-sync-explain-title"
      @cancel.prevent="explainDialog?.close()"
      @click="($event.target === explainDialog) && explainDialog?.close()"
    >
      <div class="reader-data-dialog__header">
        <h2 id="reader-sync-explain-title">把摘录同步到你自己的 OneDrive</h2>
        <button type="button" class="reader-data-dialog__close" aria-label="关闭说明" autofocus @click="explainDialog?.close()">×</button>
      </div>
      <ul class="reader-sync-panel__bullets">
        <li>数据存放在 OneDrive「应用/{{ config.appFolder }}」</li>
        <li>本应用只能访问这一个文件夹，无法读取你的其他文件</li>
        <li>不登录也能正常阅读和摘录</li>
        <li>可随时断开并导出全部数据</li>
      </ul>
      <label class="reader-sync-panel__check"><input v-model="dontShowAgain" type="checkbox" /> 不再提示</label>
      <div class="reader-data-dialog__actions">
        <button type="button" class="reader-text-button" @click="explainDialog?.close()">取消</button>
        <button type="button" class="reader-data-dialog__primary" @click="confirmExplain">前往微软登录</button>
      </div>
    </dialog>

    <!-- 连接成功预览对话框 -->
    <dialog
      ref="previewDialog"
      class="reader-data-dialog reader-ui"
      aria-labelledby="reader-sync-preview-title"
      @cancel.prevent="laterSync"
      @click="($event.target === previewDialog) && laterSync()"
    >
      <div class="reader-data-dialog__header">
        <h2 id="reader-sync-preview-title">已连接：{{ account?.email || account?.displayName }}</h2>
        <button type="button" class="reader-data-dialog__close" aria-label="关闭预览" @click="laterSync">×</button>
      </div>
      <p class="reader-data-dialog__meta">
        本机已有 {{ localCounts.highlights }} 条摘录、{{ localCounts.bookmarks }} 个书签、{{ localCounts.pages }} 页阅读进度
      </p>
      <p class="reader-data-dialog__meta">
        <template v-if="cloudCounts">云端已有 {{ cloudCounts.highlights }} 条摘录、{{ cloudCounts.bookmarks }} 个书签（来自其他设备）</template>
        <template v-else>云端清单暂不可用，开始同步后将自动拉取</template>
      </p>
      <p class="reader-data-dialog__meta">将合并两边数据；相同摘录的冲突会请你选择。</p>
      <div class="reader-data-dialog__actions">
        <button type="button" class="reader-text-button" @click="laterSync">稍后</button>
        <button type="button" class="reader-data-dialog__primary" autofocus @click="startSync">开始同步</button>
      </div>
    </dialog>

    <!-- 断开 / 切换确认对话框 -->
    <dialog
      ref="disconnectDialog"
      class="reader-data-dialog reader-ui"
      aria-labelledby="reader-sync-disconnect-title"
      @cancel.prevent="disconnectDialog?.close()"
      @click="($event.target === disconnectDialog) && disconnectDialog?.close()"
    >
      <div class="reader-data-dialog__header">
        <h2 id="reader-sync-disconnect-title">{{ switchMode ? '切换账号' : '断开连接' }}</h2>
        <button type="button" class="reader-data-dialog__close" aria-label="关闭确认" autofocus @click="disconnectDialog?.close()">×</button>
      </div>
      <p class="reader-data-dialog__meta">断开不会删除 OneDrive 中已同步的文件。</p>
      <p v-if="switchMode" class="reader-data-dialog__meta">
        切换后界面只显示新账号空间 + 本机未连接期间的数据；旧账号数据保留在其命名空间，切回即恢复。
      </p>
      <label class="reader-sync-panel__check">
        <input v-model="clearCache" type="checkbox" /> 同时清除本机缓存的云端数据
      </label>
      <div class="reader-data-dialog__actions">
        <button type="button" class="reader-text-button" @click="disconnectDialog?.close()">取消</button>
        <button type="button" class="reader-data-dialog__primary" @click="confirmDisconnect">断开并保留本机数据</button>
      </div>
    </dialog>
  </div>
</template>