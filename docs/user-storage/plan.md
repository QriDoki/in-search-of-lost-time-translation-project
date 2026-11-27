# 《追忆似水年华》阅读器 · 云存储与摘录系统设计

## 1. 设计目标

为阅读器提供摘录、批注、书签及阅读进度的持久化与跨设备同步能力，同时保持纯前端架构，不引入自建后端或中心化用户数据库。

核心原则：

- **Local-first**：无需登录即可使用全部阅读功能，支持离线操作。
- **BYOS**：用户数据存储于自己的 OneDrive，归用户所有。
- **最小权限**：云存储凭证泄露不得影响应用目录之外的文件。
- **长期可用**：摘录不因译文更新而丢失，支持数据迁移与恢复。

## 2. 技术选型

| 模块 | 技术方案 |
|---|---|
| 前端部署 | GitHub Pages，独立域名 |
| OAuth 认证 | `@azure/msal-browser` |
| 授权协议 | OAuth 2.0 Authorization Code + PKCE |
| 云存储 | OneDrive / Microsoft Graph API |
| 本地存储 | Dexie.js / IndexedDB |
| 同步机制 | 自行实现轻量同步层 |
| 文本定位 | 永久段落 ID + Fuzzy Anchoring |
| 数据格式 | JSON |
| 可读摘录导出 | DOCX / Markdown |

仅接入 OneDrive，暂不考虑其他云存储平台，不引入 remoteStorage.js。

## 3. 存储架构

阅读器始终优先读写 IndexedDB。用户连接 OneDrive 后，由同步模块负责本地与云端的数据交换。

OneDrive 目录结构：

```text
Apps/
└── Proust Reader/
    ├── highlights/
    │   └── {uuid}.json
    ├── bookmarks/
    │   └── {uuid}.json
    ├── progress.json
    ├── settings.json
    └── exports/
        └── 我的摘录.docx
```

每条摘录独立存储为 JSON 文件，减少多设备并发修改产生的冲突。

JSON 为权威数据源，DOCX、Markdown 等文件为单向生成的可读摘录集。

## 4. 摘录数据模型

完整数据建模（实体结构、本地库表、同步元数据、合并规则与迁移路径）见 [data-model.md](./data-model.md)。

参考 W3C Web Annotation Data Model：

```typescript
interface Highlight {
  id: string;
  schemaVersion: number;
  chapterId: string;
  paragraphId: string;
  revision: string;
  selector: {
    exact: string;
    prefix: string;
    suffix: string;
    start: number;
    end: number;
  };
  note: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

其中：

- `paragraphId` 为永久段落标识，以法文底本为基准。
- `revision` 为摘录创建时的译本 Git Commit SHA。
- `selector` 保存摘录原文、上下文及文本位置。
- 原始摘录内容不得因译文更新而被自动覆盖。
- 跨段落摘录需保存起止段落 ID 及对应位置。

## 5. 文本定位与永久链接

### 5.1 稳定段落 ID

为法文底本段落分配并持久化永久 ID，由中文译文及 HTML 渲染结果继承。

段落 ID 不依赖中文正文哈希或当前段落序号。段落拆分、合并时维护映射关系。

### 5.2 译文更新后的定位策略

依次尝试：

1. 永久段落 ID 与字符偏移量校验。
2. 摘录原文及上下文精确匹配。
3. Git 历史版本 Diff 位置映射。
4. Fuzzy Anchoring 模糊匹配。
5. 降级为段落定位，允许用户手动重新关联。

宁可无法精确定位，也不错误关联摘录。

### 5.3 永久链接

提供包含章节 ID、段落 ID、摘录文字及必要上下文的自包含 URL。

链接无需登录、无需访问 OneDrive，即可定位对应正文，并尝试恢复高亮。

导出的 DOCX、Markdown 摘录集均包含该链接，以支持从外部平台直接跳转至阅读器。

分享链接不得包含私人批注或认证凭证。

## 6. 同步机制

同步触发时机：

- 打开阅读器。
- 创建、修改或删除阅读数据。
- 网络恢复。
- 用户手动触发同步。

同步采用增量读写，并结合 OneDrive eTag 或其他受支持的版本校验机制检测并发冲突。

不同摘录独立合并；同一摘录发生冲突时保留冲突版本，避免静默覆盖。

删除操作采用软删除，并同步删除标记，防止已删除摘录在其他设备上重新出现。

同步失败不得阻塞阅读或导致未同步数据丢失。

## 7. 安全设计

OneDrive 文件访问仅申请：

```text
Files.ReadWrite.AppFolder
```

通过 Microsoft Graph 获取应用专属目录：

```http
GET /v1.0/me/drive/special/approot
```

安全约束：

- 禁止申请 `Files.ReadWrite.All` 等全盘读写权限。
- 不创建或在前端部署 Client Secret。
- 优先使用内存保存认证凭证。
- 使用独立 Origin，隔离其他 GitHub Pages 项目。
- 配置严格的 CSP，减少第三方脚本依赖。
- 支持完整 JSON 导入、导出及独立备份。
- 不同 OneDrive 账号的本地同步数据必须隔离。

即使 Access Token 泄露，受损范围也应限制于应用专属目录。但目录内的数据仍可能被恶意删改，因此独立备份不可省略。

## 8. 实施优先级

| 优先级 | 功能 |
|---|---|
| P0 | 永久段落 ID 与永久链接 |
| P0 | 本地摘录、批注、书签及阅读进度 |
| P0 | JSON 导入、导出 |
| P1 | OneDrive OAuth 与权限隔离 |
| P1 | 增量同步及冲突处理 |
| P2 | 译文更新后的模糊重定位 |
| P2 | 可读摘录集自动生成 |

## 9. 验收标准

- 不登录、断网时仍可正常阅读及摘录。
- 不同设备能够同步阅读数据。
- OneDrive Token 无法访问应用目录之外的文件。
- 多设备并发操作不会造成摘录静默丢失。
- 译文修改后能够重新定位或安全降级。
- 外部摘录链接无需授权即可定位正文。
- 用户能够随时导出全部数据，脱离 OneDrive 使用。

本设计不依赖任何由项目方维护的业务后端。正式上线前，须实际验证个人 Microsoft 账号授权、目录权限边界、浏览器 API 兼容性及并发同步行为。