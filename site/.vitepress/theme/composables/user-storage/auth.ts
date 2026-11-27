/**
 * AuthProvider + MSAL 封装（protocol §5.5 / D9）。
 * clientId='' → DisabledAuthProvider（同步禁用）。MSAL 动态 import 收敛于此。
 * 测试注入 msalLoader mock，永不触真实 OAuth。凭证内存保存（memoryStorage）。
 */
import type { AuthAccount, AuthProvider, UserStorageConfig } from './types'
import { AuthError } from './types'
import { sha256Hex } from './util'

const SCOPES = ['Files.ReadWrite.AppFolder']

interface MsalAccount {
  homeAccountId: string
  username?: string
  name?: string
  idTokenClaims?: { oid?: string }
}
interface MsalInstance {
  initialize?: () => Promise<void>
  handleRedirectPromise?: () => Promise<unknown>
  getAllAccounts: () => MsalAccount[]
  loginPopup: (req: { scopes: string[] }) => Promise<{ account: MsalAccount; accessToken?: string }>
  logoutPopup?: () => Promise<void>
  acquireTokenSilent: (req: { scopes: string[]; account: MsalAccount }) => Promise<{ accessToken: string }>
}
interface MsalModule {
  PublicClientApplication: new (cfg: unknown) => MsalInstance
}

function disabledProvider(): AuthProvider {
  return {
    async init() {},
    current: () => null,
    async login() {
      throw new AuthError('未配置 OneDrive clientId', 'not-configured')
    },
    async logout() {},
    async getToken() {
      throw new AuthError('未配置 OneDrive clientId', 'not-configured')
    },
    onChange: () => () => {},
  }
}

export function createAuthProvider(config: UserStorageConfig, msalLoader?: () => Promise<unknown>): AuthProvider {
  if (!config.clientId) return disabledProvider()

  const loader = msalLoader ?? (() => import('@azure/msal-browser'))
  let pca: MsalInstance | null = null
  let msalAccount: MsalAccount | null = null
  let account: AuthAccount | null = null
  const listeners = new Set<(a: AuthAccount | null) => void>()
  const notify = () => {
    for (const cb of listeners) cb(account)
  }

  async function ensure(): Promise<MsalInstance> {
    if (pca) return pca
    const mod = (await loader()) as MsalModule
    pca = new mod.PublicClientApplication({
      auth: { clientId: config.clientId, authority: config.authority, redirectUri: config.redirectUri },
      cache: { cacheLocation: 'memoryStorage' },
    })
    await pca.initialize?.()
    return pca
  }

  async function derive(msalAcc: MsalAccount): Promise<AuthAccount> {
    const id = msalAcc.idTokenClaims?.oid ?? msalAcc.homeAccountId
    const scope = `ms-${(await sha256Hex(id)).slice(0, 16)}`
    return { scope, displayName: msalAcc.name ?? msalAcc.username ?? '', email: msalAcc.username ?? '' }
  }

  return {
    async init() {
      const p = await ensure()
      await p.handleRedirectPromise?.()
      const accounts = p.getAllAccounts()
      if (accounts.length) {
        msalAccount = accounts[0]
        account = await derive(msalAccount)
        notify()
      }
    },
    current: () => account,
    async login() {
      const p = await ensure()
      try {
        const res = await p.loginPopup({ scopes: SCOPES })
        msalAccount = res.account
        account = await derive(msalAccount)
        notify()
        return account
      } catch (e) {
        const code = (e as { errorCode?: string }).errorCode
        if (code === 'user_cancelled' || code === 'popup_window_error' || code === 'empty_window_error') {
          throw new AuthError('未完成登录', 'popup-closed')
        }
        if (code === 'network_error') throw new AuthError('网络错误', 'network')
        throw new AuthError('登录失败', 'needs-login')
      }
    },
    async logout() {
      const p = await ensure()
      await p.logoutPopup?.()
      msalAccount = null
      account = null
      notify()
    },
    async getToken() {
      if (!msalAccount) throw new AuthError('需要重新登录', 'needs-login')
      const p = await ensure()
      try {
        const res = await p.acquireTokenSilent({ scopes: SCOPES, account: msalAccount })
        return res.accessToken
      } catch {
        throw new AuthError('需要重新登录', 'needs-login')
      }
    },
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}