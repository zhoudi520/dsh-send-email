/**
 * 插件配置：~/.dsh/dsh-email-send/config.json
 *
 * 走本地 JSON + 宿主 HTTP，避免第三方插件无法使用 DSH settings 白名单的问题。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LEGACY_CONFIG_DIR = 'dsh-email-notify'

/** 取 DSH 用户目录：优先环境变量，回落到 ~/.dsh。 */
export function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim()
  return join(homedir(), '.dsh')
}

/** @returns {string} 本插件配置目录的绝对路径。 */
export function configDir() {
  return join(resolveDshHome(), 'dsh-email-send')
}

/** @returns {string} config.json 的绝对路径。 */
export function configPath() {
  return join(configDir(), 'config.json')
}

/** @returns {string|undefined} 旧版通知插件的配置路径（仅迁移 smtp 用）。 */
function legacyConfigPath() {
  return join(resolveDshHome(), LEGACY_CONFIG_DIR, 'config.json')
}

export const DEFAULTS = {
  enabled: true,
  /** 设置页「发送测试邮件」的收件人；留空则发到发件地址。 */
  testTo: '',
  smtp: {
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    rejectUnauthorized: true,
    allowInsecure: false,
    user: '',
    pass: '',
    from: '',
    fromName: 'DeepSeek Harness',
  },
}

/** 深拷贝 JSON 值。 */
function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

/** 合并已知字段，忽略未知键。 */
function merge(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return base
  const out = Array.isArray(base) ? base.slice() : { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in out)) continue
    if (key.startsWith('_')) continue
    const current = out[key]
    if (current !== null && typeof current === 'object' && !Array.isArray(current)) {
      out[key] = merge(current, value)
    } else if (Array.isArray(current)) {
      out[key] = Array.isArray(value) ? value.slice() : current
    } else if (typeof current === typeof value || current === '' || current === null) {
      out[key] = value
    }
  }
  return out
}

/** 首次写入空模板。 */
function writeTemplate(path) {
  const template = {
    _说明: '由 dsh-email-send 读写。请在 DSH「设置 → 邮件发送」里填写，一般无需手改。',
    enabled: true,
    testTo: '',
    smtp: clone(DEFAULTS.smtp),
  }
  writeFileSync(path, `${JSON.stringify(template, null, 2)}\n`, 'utf8')
}

/**
 * 从旧版 dsh-email-notify 配置迁移 SMTP（仅当新文件不存在时）。
 * @param {string} targetPath - 新 config.json 路径。
 */
function migrateLegacyConfig(targetPath) {
  const legacy = legacyConfigPath()
  if (!existsSync(legacy)) return
  try {
    const raw = JSON.parse(readFileSync(legacy, 'utf8').replace(/^\uFEFF/, ''))
    const smtp = raw?.smtp
    if (!smtp || typeof smtp !== 'object') return
    mkdirSync(configDir(), { recursive: true })
    const migrated = {
      _说明: '已从 dsh-email-notify 迁移 SMTP；通知相关项已丢弃。',
      enabled: raw.enabled !== false,
      testTo: '',
      smtp: merge(clone(DEFAULTS.smtp), smtp),
    }
    writeFileSync(targetPath, `${JSON.stringify(migrated, null, 2)}\n`, 'utf8')
  } catch {
    // 迁移失败则走默认模板。
  }
}

let cache = null

/**
 * 读取配置（带 mtime 缓存）。
 * @param {boolean} [force] - 忽略缓存强制重读。
 * @returns {{value: object, path: string, created: boolean, error: string|null}}
 */
export function loadConfig(force = false) {
  const path = configPath()
  let created = false
  try {
    if (!existsSync(path)) {
      mkdirSync(configDir(), { recursive: true })
      migrateLegacyConfig(path)
      if (!existsSync(path)) {
        writeTemplate(path)
        created = true
      } else {
        created = true
      }
    }
  } catch (error) {
    return { value: clone(DEFAULTS), path, created: false, error: `无法创建配置文件：${error.message}` }
  }

  let mtimeMs = 0
  try {
    mtimeMs = statSync(path).mtimeMs
  } catch (error) {
    return { value: clone(DEFAULTS), path, created, error: `无法读取配置文件：${error.message}` }
  }
  if (!force && cache && cache.mtimeMs === mtimeMs) {
    return { value: cache.value, path, created: false, error: cache.error }
  }

  let parsed = {}
  let error = null
  try {
    const raw = readFileSync(path, 'utf8')
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
  } catch (parseError) {
    error = `config.json 解析失败，已按默认值运行：${parseError.message}`
    parsed = {}
  }

  const value = merge(clone(DEFAULTS), parsed)
  if (!value.smtp.pass && process.env.DSH_EMAIL_SEND_PASS) {
    value.smtp.pass = process.env.DSH_EMAIL_SEND_PASS
  }
  if (!value.smtp.user && process.env.DSH_EMAIL_SEND_USER) {
    value.smtp.user = process.env.DSH_EMAIL_SEND_USER
  }
  if (!value.smtp.pass && process.env.DSH_EMAIL_NOTIFY_PASS) {
    value.smtp.pass = process.env.DSH_EMAIL_NOTIFY_PASS
  }
  if (!value.smtp.user && process.env.DSH_EMAIL_NOTIFY_USER) {
    value.smtp.user = process.env.DSH_EMAIL_NOTIFY_USER
  }
  cache = { mtimeMs, value, error }
  return { value, path, created, error }
}

/**
 * SMTP 发信通道是否就绪（不要求预设收件人；send_email 工具自行指定 to）。
 * @param {object} config - 解析后的配置。
 * @returns {{ready: boolean, missing: string[], from: string}}
 */
export function describeSmtpReadiness(config) {
  const smtp = config.smtp ?? {}
  const missing = []
  if (!smtp.host) missing.push('smtp.host')
  if (!smtp.user) missing.push('smtp.user')
  if (!smtp.pass) missing.push('smtp.pass')
  const from = String(smtp.from || smtp.user || '').trim()
  if (!from.includes('@')) missing.push('smtp.from')
  return { ready: missing.length === 0, missing, from }
}

/**
 * 设置界面用的安全视图（口令不回显）。
 * @param {object} config - 解析后的配置。
 * @returns {object}
 */
export function publicConfig(config) {
  const smtp = config.smtp ?? {}
  const passFromEnv = Boolean(process.env.DSH_EMAIL_SEND_PASS || process.env.DSH_EMAIL_NOTIFY_PASS)
  return {
    ...clone(config),
    smtp: {
      ...clone(smtp),
      pass: '',
      passSet: Boolean(smtp.pass),
      passFromEnv: !smtp.pass && passFromEnv,
    },
  }
}

const WRITABLE = {
  enabled: 'boolean',
  testTo: 'string',
}
const WRITABLE_SMTP = {
  host: 'string',
  port: 'number',
  secure: 'boolean',
  rejectUnauthorized: 'boolean',
  allowInsecure: 'boolean',
  user: 'string',
  pass: 'string',
  from: 'string',
  fromName: 'string',
}

/** @param {string} kind - 期望类型名。 @param {*} value - 输入。 @returns {*|undefined} */
function coerce(kind, value) {
  if (kind === 'boolean') {
    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
    return undefined
  }
  if (kind === 'number') {
    const num = typeof value === 'number' ? value : Number(String(value ?? '').trim())
    return Number.isFinite(num) && num >= 0 ? num : undefined
  }
  if (kind === 'string') return typeof value === 'string' ? value.trim() : undefined
  return undefined
}

/** @param {object} patch - 前端提交的对象。 @returns {object} 白名单字段。 */
function pickWritable(patch) {
  const out = {}
  if (patch === null || typeof patch !== 'object') return out
  for (const [key, kind] of Object.entries(WRITABLE)) {
    if (!(key in patch)) continue
    const value = coerce(kind, patch[key])
    if (value !== undefined) out[key] = value
  }
  if (patch.smtp && typeof patch.smtp === 'object') {
    const smtp = {}
    for (const [key, kind] of Object.entries(WRITABLE_SMTP)) {
      if (!(key in patch.smtp)) continue
      const value = coerce(kind, patch.smtp[key])
      if (key === 'pass' && value === '') continue
      if (value !== undefined) smtp[key] = value
    }
    if (Object.keys(smtp).length > 0) out.smtp = smtp
  }
  return out
}

/** @param {object} target - 写入目标。 @param {object} patch - 增量。 */
function deepAssign(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    const current = target[key]
    if (current !== null && typeof current === 'object' && !Array.isArray(current)
      && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      deepAssign(current, value)
    } else {
      target[key] = value
    }
  }
  return target
}

/**
 * 保存配置（只覆盖白名单字段）。
 * @param {object} patch - 设置界面提交的字段。
 * @returns {{ok: boolean, error?: string, value?: object}}
 */
export function saveConfig(patch) {
  const path = configPath()
  const picked = pickWritable(patch)

  let raw = {}
  try {
    if (existsSync(path)) raw = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    raw = {}
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) raw = {}

  deepAssign(raw, picked)
  try {
    mkdirSync(configDir(), { recursive: true })
    const temp = `${path}.tmp`
    writeFileSync(temp, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
    renameSync(temp, path)
  } catch (error) {
    return { ok: false, error: `写入失败：${error.message}` }
  }

  cache = null
  const loaded = loadConfig(true)
  return { ok: true, value: loaded.value }
}

/**
 * 解析 send_email 的收件人参数。
 * @param {string|string[]|undefined} input - 模型传入的 to。
 * @returns {string[]}
 */
export function parseRecipients(input) {
  if (Array.isArray(input)) {
    return input.map((v) => String(v ?? '').trim()).filter((v) => v.includes('@'))
  }
  const text = String(input ?? '').trim()
  if (!text) return []
  return text.split(/[,，;\s]+/).map((v) => v.trim()).filter((v) => v.includes('@'))
}

/**
 * 测试邮件的收件地址。
 * @param {object} config - 配置。
 * @returns {string[]}
 */
export function testRecipients(config) {
  const readiness = describeSmtpReadiness(config)
  const explicit = String(config.testTo ?? '').trim()
  if (explicit.includes('@')) return [explicit]
  if (readiness.from.includes('@')) return [readiness.from]
  return []
}
