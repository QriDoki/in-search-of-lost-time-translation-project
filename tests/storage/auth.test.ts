import { describe, expect, it } from 'vitest'
import { createAuthProvider } from '../../site/.vitepress/theme/composables/user-storage/auth'
import { AuthError } from '../../site/.vitepress/theme/composables/user-storage/types'
import { sha256Hex } from '../../site/.vitepress/theme/composables/user-storage/util'
import type { UserStorageConfig } from '../../site/.vitepress/theme/composables/user-storage/types'

const config: UserStorageConfig = { clientId: 'test-client', authority: 'https://login.microsoftonline.com/common', redirectUri: 'https://x.test', appFolder: 'Proust Reader' }

function mockMsal(opts: { accounts?: unknown[]; loginError?: string; silentError?: boolean; loginAccount?: unknown } = {}) {
  const state = { accounts: opts.accounts ?? [], loggedOut: false }
  class PublicClientApplication {
    async initialize() {}
    async handleRedirectPromise() {}
    getAllAccounts() {
      return state.accounts
    }
    async loginPopup() {
      if (opts.loginError) {
        const e = new Error('login failed') as Error & { errorCode: string }
        e.errorCode = opts.loginError
        throw e
      }
      const acc = opts.loginAccount ?? { homeAccountId: 'home-1', username: 'user@example.com', name: 'User', idTokenClaims: { oid: 'oid-123' } }
      state.accounts = [acc]
      return { account: acc }
    }
    async logoutPopup() {
      state.accounts = []
      state.loggedOut = true
    }
    async acquireTokenSilent() {
      if (opts.silentError) throw new Error('silent failed')
      return { accessToken: 'silent-token' }
    }
  }
  return { loader: async () => ({ PublicClientApplication }), state }
}

describe('auth', () => {
  it('★ clientId="" → DisabledAuthProvider（login/getToken not-configured）', async () => {
    const provider = createAuthProvider({ ...config, clientId: '' })
    expect(provider.current()).toBeNull()
    await expect(provider.login()).rejects.toMatchObject({ code: 'not-configured' })
    await expect(provider.getToken()).rejects.toMatchObject({ code: 'not-configured' })
  })

  it('★ login → scope=sha256(oid) 前 16；displayName/email', async () => {
    const { loader } = mockMsal()
    const provider = createAuthProvider(config, loader)
    const acc = await provider.login()
    const expected = `ms-${(await sha256Hex('oid-123')).slice(0, 16)}`
    expect(acc.scope).toBe(expected)
    expect(acc.email).toBe('user@example.com')
    expect(acc.displayName).toBe('User')
    expect(provider.current()).toEqual(acc)
  })

  it('scope 隔离：不同 oid → 不同 scope', async () => {
    const a = await createAuthProvider(config, mockMsal({ loginAccount: { homeAccountId: 'h', idTokenClaims: { oid: 'oid-A' } } }).loader).login()
    const b = await createAuthProvider(config, mockMsal({ loginAccount: { homeAccountId: 'h', idTokenClaims: { oid: 'oid-B' } } }).loader).login()
    expect(a.scope).not.toBe(b.scope)
  })

  it('init 静默恢复缓存会话', async () => {
    const { loader } = mockMsal({ accounts: [{ homeAccountId: 'h', username: 'u@x.com', idTokenClaims: { oid: 'cached' } }] })
    const provider = createAuthProvider(config, loader)
    await provider.init()
    expect(provider.current()?.scope).toBe(`ms-${(await sha256Hex('cached')).slice(0, 16)}`)
  })

  it('getToken 静默续期；失败 → needs-login', async () => {
    const ok = createAuthProvider(config, mockMsal().loader)
    await ok.login()
    expect(await ok.getToken()).toBe('silent-token')
    const fail = createAuthProvider(config, mockMsal({ silentError: true }).loader)
    await fail.login()
    await expect(fail.getToken()).rejects.toMatchObject({ code: 'needs-login' })
    // 未登录 getToken → needs-login
    const fresh = createAuthProvider(config, mockMsal().loader)
    await expect(fresh.getToken()).rejects.toBeInstanceOf(AuthError)
  })

  it('★ popup 关闭 → popup-closed', async () => {
    const provider = createAuthProvider(config, mockMsal({ loginError: 'user_cancelled' }).loader)
    await expect(provider.login()).rejects.toMatchObject({ code: 'popup-closed' })
  })

  it('logout → current null + onChange 回调', async () => {
    const { loader } = mockMsal()
    const provider = createAuthProvider(config, loader)
    const events: (unknown | null)[] = []
    provider.onChange((a) => events.push(a))
    await provider.login()
    await provider.logout()
    expect(provider.current()).toBeNull()
    expect(events).toHaveLength(2)
    expect(events[1]).toBeNull()
  })
})