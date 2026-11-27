/**
 * 响应式桥（protocol §5.9）：useLiveQuery / useSyncState / useUserStorage。
 * 共享状态由 index.ts 编排写入；组件只读这些 Ref。
 */
import { onScopeDispose, ref, type Ref } from 'vue'
import { liveQuery } from 'dexie'
import { currentScope, onScopeChange, storageMode } from './db'
import type { SyncEngine } from './sync'
import type { AuthAccount, Scope, SyncStatus } from './types'

export function useLiveQuery<T>(querier: () => Promise<T>, initial: T): Ref<T> {
  const value = ref(initial) as Ref<T>
  const sub = liveQuery(querier).subscribe({
    next: (v) => {
      value.value = v
    },
    error: () => {},
  })
  onScopeDispose(() => sub.unsubscribe())
  return value
}

/* ---------- 共享状态（index.ts 写入） ---------- */

const ready = ref(false)
const mode = ref<'idb' | 'localStorage' | 'unavailable'>(storageMode())
const scope = ref<Scope>(currentScope())
const account = ref<AuthAccount | null>(null)
const engineRef = ref<SyncEngine | null>(null)
const status = ref<SyncStatus>({ state: 'disconnected', pending: 0, conflicts: 0, lastSyncAt: null, lastError: null, unknownFiles: false })

onScopeChange((s) => {
  scope.value = s
})

export function _setReady(v: boolean): void {
  ready.value = v
}
export function _setMode(m: 'idb' | 'localStorage' | 'unavailable'): void {
  mode.value = m
}
export function _setAccount(a: AuthAccount | null): void {
  account.value = a
}
export function _setEngine(e: SyncEngine | null): void {
  engineRef.value = e
  if (e) {
    status.value = e.getStatus()
    e.subscribe((s) => {
      status.value = s
    })
  }
}

export function useSyncState(): { status: Ref<SyncStatus>; engine: Ref<SyncEngine | null> } {
  return { status, engine: engineRef }
}

export function useUserStorage(): {
  ready: Ref<boolean>
  mode: Ref<'idb' | 'localStorage' | 'unavailable'>
  scope: Ref<Scope>
  account: Ref<AuthAccount | null>
} {
  return { ready, mode, scope, account }
}