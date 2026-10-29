import fs from 'node:fs'
import path from 'node:path'

/** 排除 dev，仅按正式版本文件夹名降序排列，忽略文件时间。 */
export function listContentVersions(root) {
  const polishRoot = path.join(root, 'polish')
  if (!fs.existsSync(polishRoot)) {
    throw new Error(`找不到润色稿目录：${polishRoot}`)
  }
  return fs.readdirSync(polishRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'dev')
    .filter((entry) => fs.statSync(path.join(polishRoot, entry.name, 'chapters'), { throwIfNoEntry: false })?.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
}

/** 文件夹名即发布版本；dev 仅允许本地显式选择，用于预览贡献。 */
export function resolveContentVersion(root, requested) {
  const versions = listContentVersions(root)
  const version = requested || process.env.POLISH_VERSION || versions[0]
  if (version === 'dev') {
    if (process.env.GITHUB_ACTIONS === 'true') {
      throw new Error('CI/CD 禁止构建或发布 polish/dev，请选择正式版本。')
    }
    if (!fs.statSync(path.join(root, 'polish/dev/chapters'), { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error('找不到开发稿 polish/dev/chapters。')
    }
  } else if (!versions.length) {
    throw new Error('polish/*/chapters 下没有可打包的润色稿。')
  } else if (!versions.includes(version)) {
    throw new Error(`找不到润色版本 polish/${version}/chapters（现有：${versions.join('、')}）。`)
  }
  return {
    version,
    versions,
    chaptersDir: path.join(root, 'polish', version, 'chapters'),
    sourceLabel: `polish/${version}/chapters`,
  }
}
