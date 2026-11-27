/**
 * vitest 全局 setup（protocol §7.1）：
 *  - fake-indexeddb 自动注入（每测试文件独立 IDB 环境；afterEach 删库）
 *  - crypto.subtle / getRandomValues 缺失时从 node webcrypto 补齐
 *  - ResizeObserver / matchMedia / scrollTo / requestAnimationFrame 缺失补 stub
 *  - configureUserStorage 复位钩子
 */
import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'
import { afterEach } from 'vitest'
import { resetUserStorageConfig } from '../site/.vitepress/theme/composables/user-storage/config'

const g = globalThis as unknown as Record<string, unknown>

// crypto：happy-dom 的 crypto 可能缺 subtle，统一用 node webcrypto 补齐。
const existingCrypto = g.crypto as Crypto | undefined
if (!existingCrypto?.subtle || !existingCrypto?.getRandomValues) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true })
}

// ResizeObserver stub（happy-dom 未提供时）。
if (typeof g.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  g.ResizeObserver = ResizeObserverStub
}

// matchMedia stub。
if (typeof g.matchMedia !== 'function') {
  g.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// scrollTo stub。
if (typeof g.scrollTo !== 'function') {
  g.scrollTo = () => {}
}

// requestAnimationFrame stub（happy-dom 已提供则不动）。
if (typeof g.requestAnimationFrame !== 'function') {
  g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  g.cancelAnimationFrame = (id: number) => clearTimeout(id)
}

afterEach(async () => {
  resetUserStorageConfig()
  // 清空 IDB，避免测试间串库。
  const idb = g.indexedDB as IDBFactory | undefined
  if (idb?.databases) {
    const dbs = await idb.databases()
    await Promise.all(
      dbs.map(
        (db) =>
          new Promise<void>((resolve) => {
            if (!db.name) return resolve()
            const req = idb.deleteDatabase(db.name)
            req.onsuccess = () => resolve()
            req.onerror = () => resolve()
            req.onblocked = () => resolve()
          }),
      ),
    )
  }
})