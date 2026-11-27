/**
 * 配置注入点（protocol §5.1）。clientId='' → 同步整体禁用。
 * 测试用 configureUserStorage 注入，afterEach 复位（resetUserStorageConfig）。
 */
import type { UserStorageConfig } from './types'

function envClientId(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  return env?.VITE_ONEDRIVE_CLIENT_ID ?? ''
}

function defaults(): UserStorageConfig {
  return {
    clientId: envClientId(),
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: typeof location !== 'undefined' ? location.origin : '',
    appFolder: 'Proust Reader',
  }
}

let config: UserStorageConfig = defaults()

export function configureUserStorage(patch: Partial<UserStorageConfig>): void {
  config = { ...config, ...patch }
}

export function getUserStorageConfig(): UserStorageConfig {
  return { ...config }
}

/** 测试复位钩子。 */
export function resetUserStorageConfig(): void {
  config = defaults()
}