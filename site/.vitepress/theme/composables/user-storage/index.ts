/**
 * 初始化编排 + barrel（protocol §5.7 / §5.9）。前端只从 user-storage 包面 import。
 * initUserStorage 幂等；任何一步失败降级 localStorage 模式，阅读不中断。
 */
import { configureUserStorage, getUserStorageConfig } from './config'
import {
  claimAnonData,
  currentDb,
  deviceId,
  getProgressDoc,
  getSettingsDoc,
  markLocalStorageMode,
  migrateLegacyData,
  openDatabase,
  rebuildOutbox,
  saveDevicePrefs,
  saveProgress as dbSaveProgress,
  saveSyncedPrefs,
  storageMode,
  switchScope,
} from './db'
import { createAuthProvider } from './auth'
import { createSyncEngine, type SyncEngine } from './sync'
import { createGraphTransport } from './transport'
import type { AuthProvider, UserStorageConfig } from './types'
import { _setAccount, _setEngine, _setMode, _setReady } from './vue'
import { hydratePrefs, hydrateProgress, setPersistAdapter } from '../reader'

export * from './types'
export {
  configureUserStorage,
  getUserStorageConfig,
} from './config'
export {
  currentScope,
  currentDb,
  storageMode,
  deleteScopeDatabase,
  putHighlight,
  putBookmark,
  softDeleteHighlight,
  softDeleteBookmark,
  getHighlight,
  listHighlights,
  listBookmarks,
  liveHighlights,
  liveBookmarks,
  sanitizeHighlight,
  sanitizeBookmark,
  saveProgress,
  getProgressDoc,
  saveSyncedPrefs,
  getSettingsDoc,
  saveDevicePrefs,
  migrateLegacyData,
  claimAnonData,
  rebuildOutbox,
  deviceId,
  ValidationError,
} from './db'
export { mergeHighlight, mergeBookmark, mergeProgress, mergeSettings, mergeGraveyard, isGraveyarded } from './merge'
export {
  collectAnchorParagraphs,
  domRangeToSelection,
  resolveHighlight,
  resolveShare,
  renderHighlights,
  clearHighlightMarks,
  reanchor,
  loadVersionMap,
  loadFuzzyMatcher,
  pidLocation,
  nfcRangeToRawOffsets,
  wrapRawRange,
  type SelectionAnchor,
  type AnchorContext,
  type VersionMap,
} from './anchor'
export { encodeShare, decodeShare, buildShareUrl, parseShareUrl } from './share'
export {
  buildExportEnvelope,
  downloadJson,
  parseImportFile,
  previewImport,
  applyImport,
  buildMarkdownExcerpt,
  buildDocxExcerpt,
  COLOR_HEX,
  type ExcerptItem,
  type ExcerptOptions,
} from './export'
export { createGraphTransport } from './transport'
export { createAuthProvider } from './auth'
export { createSyncEngine, type SyncEngine, type SyncReport } from './sync'
export { useLiveQuery, useSyncState, useUserStorage } from './vue'
export { fnv1a36, nfc, normalizeWs, uuidv7, uuidv4, sha256Hex, nowIso, deepEqual, deepClone } from './util'

let initialized = false
let engine: SyncEngine | null = null
let auth: AuthProvider | null = null

/** D33 附加：编排中的同一 auth 实例（云同步面板登录/登出入口；第二实例不共享 MSAL 内存会话）。 */
export function getSyncAuth(): AuthProvider | null {
  return auth
}

function installIdbAdapter(): void {
  setPersistAdapter({
    saveProgress: (pos) => {
      void dbSaveProgress(pos).catch(() => {})
    },
    savePrefs: (prefs) => {
      void saveSyncedPrefs({
        fontSize: prefs.fontSize,
        lineHeight: prefs.lineHeight,
        fontFamily: prefs.fontFamily,
        theme: prefs.theme,
        annotationTypes: prefs.annotationTypes,
      }).catch(() => {})
      void saveDevicePrefs({ width: prefs.width }).catch(() => {})
    },
    clearProgress: () => {
      void (async () => {
        const d = currentDb()
        await d.progress.clear()
        await d.meta.delete('last')
        await d.outbox.where('[entity+id]').equals(['progress', 'doc']).delete()
      })().catch(() => {})
    },
  })
}

async function hydrateFromDb(mode: 'merge' | 'replace'): Promise<void> {
  hydrateProgress(await getProgressDoc(), mode)
  hydratePrefs(await getSettingsDoc(), mode)
}

async function bindSync(): Promise<void> {
  const config = getUserStorageConfig()
  auth = createAuthProvider(config)
  await auth.init()
  const acc = auth.current()
  _setAccount(acc)
  if (acc) {
    await switchScope(acc.scope)
    await claimAnonData(acc.scope)
    await hydrateFromDb('replace')
  }
  const transport = createGraphTransport(() => auth!.getToken())
  engine = createSyncEngine({ db: currentDb(), transport, auth })
  _setEngine(engine)
  if (acc) engine.trigger('init')

  auth.onChange(async (account) => {
    _setAccount(account)
    if (account) {
      await switchScope(account.scope)
      await claimAnonData(account.scope)
      await hydrateFromDb('replace')
    } else {
      await switchScope('anon')
      await hydrateFromDb('replace')
    }
    engine?.dispose()
    const t = createGraphTransport(() => auth!.getToken())
    engine = createSyncEngine({ db: currentDb(), transport: t, auth: auth! })
    _setEngine(engine)
    if (account) engine.trigger('init')
  })
}

export async function initUserStorage(opts?: { config?: Partial<UserStorageConfig> }): Promise<void> {
  if (initialized) return
  initialized = true
  if (opts?.config) configureUserStorage(opts.config)

  try {
    await openDatabase('anon')
  } catch {
    markLocalStorageMode()
    _setMode('localStorage')
    _setReady(true)
    return
  }
  _setMode('idb')

  try {
    const { book } = await import('../book')
    const migration = await migrateLegacyData(book.contentVersion)
    if (migration.migrated) {
      await hydrateFromDb('merge')
      installIdbAdapter()
    }
    await rebuildOutbox()
  } catch {
    // 迁移失败不阻塞阅读；保留 localStorage 路径
  }

  // P1：配置了 clientId 才启用认证与同步
  if (getUserStorageConfig().clientId) {
    try {
      await bindSync()
    } catch {
      // 同步初始化失败降级，阅读不中断
    }
  }

  _setReady(true)
}

/** 测试用：重置初始化状态。 */
export function _resetUserStorage(): void {
  initialized = false
  engine?.dispose()
  engine = null
  auth = null
  _setEngine(null)
  _setAccount(null)
  _setReady(false)
  _setMode(storageMode())
}