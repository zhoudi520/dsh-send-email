# dsh-email-send — Movo 适配指南

本插件在 **DeepSeek Harness（DSH）** 与 **BackMan AI / Movo** 两种部署形态下均可使用，但配置入口不同。本文档面向插件维护者与第三方作者，说明如何在 Movo 上声明契约、提供配置 UI，并使 Host 侧 `send_email` 读到正确配置。

| 文档 | 说明 |
|------|------|
| Movo 平台规范（契约、API、物化、SDK） | [dsh-plugin-config.md](d:\CodeSpace\afe-ai\ai-backman-movo\docs\design\dsh-plugin-config.md) |
| 本插件 README | [../README.md](../README.md) |

---

## 1. 插件类型与 Movo 关系

| 维度 | 本插件 |
|------|--------|
| 类型 | **工具型**（`ctx.tools.register('send_email')`） |
| DSH 配置方式 | Client 设置 + Host `webServer` `/dsh-email-send/*` |
| Movo 配置方式 | **Config Shell 动态加载** `movo/config-ui.mjs` + **Movo Config API** 存储 + **Runtime 物化** `config.json` |
| 与 dsh-email-notify | notify 为 **事件 Hook**，无 `send_email`；Movo V1 不要求 notify 配置页 |

---

## 2. 双模式架构

```text
┌─────────────────────────────────────────────────────────────┐
│                    dsh-email-send 单包                       │
├────────────────────────────┬────────────────────────────────┤
│ DSH Web / Desktop          │ Movo (Headless Host)            │
│ client/client.js           │ movo/config-ui.mjs              │
│ fetch(/dsh-email-send/...) │ PluginConfigSdk → chat-api      │
│ webServer 路由             │ 无 webServer；物化 dsh-home     │
│ ~/.dsh/.../config.json     │ 同路径形状，经 Movo 物化写入     │
│ lib/index.js send_email    │ 相同 Host 代码                   │
└────────────────────────────┴────────────────────────────────┘
```

**原则**：Host 执行逻辑（`lib/index.js`、`lib/config.js`、`lib/smtp.js`）尽量不改语义；差异集中在 **配置 UI 入口** 与 **`package.json#movo` 声明**。

---

## 3. `package.json#movo` 完整样例（V1）

在发布到 Movo 前，在 `package.json` 增加：

```json
{
  "movo": {
    "configContract": "1",
    "configurable": true,
    "configEntry": "./movo/config-ui.mjs",
    "configAssets": [],
    "secretFields": ["smtp.pass"],
    "configMount": {
      "kind": "dsh_home_subdir",
      "subdir": "dsh-email-send",
      "file": "config.json"
    },
    "configTest": "smtp_test",
    "configDefaults": {
      "enabled": true,
      "testTo": "",
      "smtp": {
        "host": "smtp.qq.com",
        "port": 465,
        "secure": true,
        "rejectUnauthorized": true,
        "allowInsecure": false,
        "user": "",
        "pass": "",
        "from": "",
        "fromName": "DeepSeek Harness"
      }
    }
  }
}
```

说明：

- `configDefaults`：Movo 平台规范中的 **可选** 字段，供 `GET config` 在无保存记录时合并默认值（与 `lib/config.js` 中 `DEFAULTS` 保持一致）。
- `configTest: "smtp_test"`：对应 Movo `POST .../config/test` 行为，与 Host `/dsh-email-send/test` 等价。

同时将 `movo/` 目录加入 `files` 数组：

```json
"files": [
  "lib",
  "client",
  "movo",
  "scripts",
  "cordis.patch.yml",
  "README.md",
  "LICENSE"
]
```

---

## 4. 实现 `movo/config-ui.mjs`

### 4.1 职责

- 从 **`client/client.js`** 抽离 DOM / 表单逻辑（可复用 CSS 字符串与 `buildPanel` 结构）。
- **禁止** `fetch('/dsh-email-send/...')`。
- 使用注入的 **`sdk`**：

```javascript
/**
 * @param {HTMLElement} host
 * @param {import('@movo/dsh-plugin-config-sdk').PluginConfigSdk} sdk
 */
export async function mount(host, sdk) {
  const root = document.createElement('div')
  host.appendChild(root)
  const cfg = await sdk.getConfig()
  const meta = await sdk.getMeta()
  // 渲染表单：smtp.host, smtp.user, smtp.pass（空表示已保存不修改）, ...
  // 保存：await sdk.saveConfig({ smtp: { user, pass, ... } })
  // 测试：await sdk.testConfig({ draft: collectDraft() })
  mount._root = root
}

export function unmount() {
  mount._root?.remove()
}
```

### 4.2 与 DSH Client 的差异

| 操作 | DSH Client | Movo config-ui |
|------|------------|----------------|
| 读配置 | `GET /dsh-email-send/config` | `sdk.getConfig()` |
| 写配置 | `POST /dsh-email-send/config` | `sdk.saveConfig(patch)` |
| 测信 | `POST /dsh-email-send/test` | `sdk.testConfig({ draft })` |
| 就绪状态 | `GET /dsh-email-send/status` | `sdk.getMeta()` → `ready`, `missing` |

### 4.3 主题与文案

- 使用 `sdk.locale` 切换中英文（与 admin-web i18n 对齐）。
- 样式优先使用插件自带 class（如 `.dsh-email-send-settings`）；容器宽度由 Shell 提供，避免撑破 Drawer。

---

## 5. Host 侧（`lib/config.js`）

### 5.1 当前行为

- `resolveDshHome()`：`process.env.DSH_HOME` 或 `~/.dsh`
- `configPath()`：`{DSH_HOME}/dsh-email-send/config.json`

### 5.2 Movo 要求

Movo overlay 将 Runtime 的 `dsh-home` 设为 `{storageRoot}/dsh-home`，物化写入：

```text
{storageRoot}/dsh-home/dsh-email-send/config.json
```

**适配检查清单**：

- [ ] 确保 Movo materialize 后，插件进程的 `DSH_HOME` 指向 `{storageRoot}/dsh-home`（由 Host 设置环境变量或在 `settings` 插件配置中已等价）
- [ ] 无需改动 `config.json` 结构；Movo 存储合并结果应与 `saveConfig` / `publicConfig` 形状一致
- [ ] `loadConfig()` 缓存：物化后新 Runtime 为新进程，无热更新问题

### 5.3 保留 DSH Web 路径

- **保留** `ctx.inject(['webServer'])` 与 `client/client.js`，供 `dsh plugin add` 用户使
- Movo 下 `webServer` 可能不存在：`inject` 不执行不影响 `send_email` 注册（工具在 `ctx.effect` 中 `register`）

---

## 6. 在 Movo 中安装与验收

### 6.1 安装

1. `npm pack` 生成 `dsh-email-send-1.0.0.tgz`
2. 管理后台 → DSH 插件 → 组织 → 上传 tgz → 安装并检查
3. 确认列表项 `configurable: true`（实现后字段）
4. 启用插件

### 6.2 配置

1. 插件卡片 → **配置**
2. 填写 SMTP、授权码 → 保存
3. **发送测试邮件**（`sdk.testConfig`）

### 6.3 运行

1. **新开**用户对话（配置 revision 生效）
2. 让助手调用 `send_email`
3. 管理台可用性：`send_email` 可为 `session_exposed`；与配置 readiness 独立

### 6.4 环境依赖

- `dsh-runtime-host` 容器 **出站 SMTP**
- 租户模型支持 **工具调用**

---

## 7. 自检与测试

| 项 | 命令 / 方法 |
|----|-------------|
| 包 manifest | `node test/manifest.test.mjs`（扩展：断言 `movo.configEntry` 存在） |
| SMTP 单元 | `node test/smtp.test.mjs` |
| Host 插件 | `node test/plugin.test.mjs` |
| Movo UI（建议新增） | `node test/movo-config-ui.test.mjs`（mock `sdk`） |
| DSH 集成 | 现有 `test/client.test.mjs`、`test/host-integration.test.mjs` 保持通过 |

---

## 8. 作者 Checklist（发布前）

- [ ] `package.json#movo` 字段完整，`configContract` 为 `"1"`
- [ ] `movo/config-ui.mjs` 实现 `mount` / `unmount`，仅使用 `sdk`
- [ ] `secretFields` 包含 `smtp.pass`
- [ ] `configMount.subdir` 与 `configDir()` 目录名一致（`dsh-email-send`）
- [ ] `files` 包含 `movo/`
- [ ] README 增加「Movo 部署」小节并链接平台设计文档
- [ ] 不在 Movo 路径依赖 React / DSH `ModuleLoader`（config-ui 可用纯 DOM，与现 client 一致）

---

## 9. Decisions（与平台文档同步）

实现 Movo 侧功能前，以下项见平台 [Decisions](d:\CodeSpace\afe-ai\ai-backman-movo\docs\design\dsh-plugin-config.md#11-decisions待评审拍板)：

1. 密文密钥选型（`MODEL_CONFIG_SECRET` vs `PLUGIN_CONFIG_SECRET`）
2. config-ui 静态资源缓存策略
3. materialize API vs runtime body 内联
4. 保存后是否必须新会话

插件侧 **无需单独拍板**，跟随 Movo 实现即可。

---

## 10. 代码索引（本仓库）

| 文件 | 说明 |
|------|------|
| `lib/index.js` | `send_email` + webServer 路由 |
| `lib/config.js` | 读写 `config.json`、`publicConfig`、`saveConfig` |
| `client/client.js` | DSH Web 设置 UI |
| `movo/config-ui.mjs` | **待增** Movo 配置 UI |
| `cordis.patch.yml` | bundle 插入 `dsh-email-send` |

---

## 11. 相关 Movo 代码索引

| 模块 | 路径 |
|------|------|
| 平台设计 | `ai-backman-movo/docs/design/dsh-plugin-config.md` |
| 插件 API | `ai-backman-movo/services/chat-api/app/api/endpoints/dsh_plugins.py` |
| 安装器 | `ai-backman-movo/services/chat-api/app/dsh_runtime/plugin_management/installer.py` |
| 管理台卡片 | `ai-backman-movo/apps/admin-web/src/views/dsh-plugins/DshPluginCatalog.vue` |
| 前端 API 类型 | `ai-backman-movo/apps/admin-web/src/api/dsh-plugins.ts` |
