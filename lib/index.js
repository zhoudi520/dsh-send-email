/**
 * dsh-email-send — 为 harness 助手提供 send_email 工具。
 */
import {
  configPath,
  describeSmtpReadiness,
  loadConfig,
  parseRecipients,
  publicConfig,
  saveConfig,
  testRecipients,
} from './config.js'
import { sendMail } from './smtp.js'

const HTTP_PREFIX = '/dsh-email-send'
const BODY_LIMIT = 256 * 1024

export const name = 'dsh-email-send'
export const inject = ['tools']

/** @param {import('node:http').IncomingMessage} request */
function readJsonBody(request) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        request.destroy()
        resolve(null)
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve(null)
      }
    })
    request.on('error', () => resolve(null))
  })
}

/** @param {import('node:http').ServerResponse} response @param {number} status @param {object} payload */
function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}

/**
 * 读取当前配置。
 * @returns {object}
 */
function getConfig() {
  const loaded = loadConfig()
  return loaded.value
}

/**
 * 用配置里的 SMTP 发信。
 * @param {object} cfg - 配置。
 * @param {{to: string[], subject: string, text: string}} mail
 * @returns {Promise<{messageId: string, accepted: string[]}>}
 */
async function deliver(cfg, mail) {
  const readiness = describeSmtpReadiness(cfg)
  if (!readiness.ready) {
    throw new Error(`邮件未配置完成（缺 ${readiness.missing.join(', ')}），请在「设置 → 邮件发送」填写`)
  }
  const smtp = cfg.smtp ?? {}
  return sendMail({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    rejectUnauthorized: smtp.rejectUnauthorized !== false,
    allowInsecure: smtp.allowInsecure === true,
    user: smtp.user,
    pass: smtp.pass,
    from: readiness.from,
    fromName: smtp.fromName,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  })
}

/**
 * 挂载插件：register send_email + 设置页 HTTP。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const log = (level, message) => {
    try {
      const logger = ctx.logger
      if (logger && typeof logger[level] === 'function') logger[level](`[dsh-email-send] ${message}`)
    } catch { /* 日志失败不影响发信 */ }
  }

  let lastResult = null

  ctx.effect(() => {
    return ctx.tools.register({
    name: 'send_email',
    description: '通过已配置的 SMTP 发送纯文本邮件。收件人、主题、正文由调用方指定；发件账号在「设置 → 邮件发送」里配置。',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: '收件人邮箱。多个地址用英文逗号或分号分隔。',
        },
        subject: { type: 'string', description: '邮件主题。' },
        body: { type: 'string', description: '邮件正文（纯文本）。' },
      },
      required: ['to', 'subject', 'body'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          messageId: { type: 'string' },
          to: { type: 'array', items: { type: 'string' } },
          subject: { type: 'string' },
        },
        required: ['messageId', 'to', 'subject'],
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: `已向 ${value.to.join(', ')} 发送「${value.subject}」（messageId: ${value.messageId}）`,
      }],
    },
    async execute(args, exec) {
      const cfg = getConfig()
      if (cfg.enabled === false) {
        throw new Error('邮件发送已在设置中关闭（enabled=false）')
      }
      const to = parseRecipients(args?.to)
      const subject = String(args?.subject ?? '').trim()
      const body = String(args?.body ?? '')
      if (to.length === 0) throw new Error('to 无效：需要至少一个含 @ 的邮箱地址')
      if (!subject) throw new Error('subject 不能为空')
      if (!body.trim()) throw new Error('body 不能为空')

      const result = await deliver(cfg, { to, subject, text: body })
      lastResult = { at: Date.now(), ok: true, subject, to, messageId: result.messageId }
      log('info', `send_email → ${to.join(', ')}：${subject}`)
      return { messageId: result.messageId, to: result.accepted, subject }
    },
    })
  })

  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => {
      const disposeStatus = hostCtx.webServer.register({
        kind: 'exact',
        path: `${HTTP_PREFIX}/status`,
        handler: async (_request, response) => {
          const cfg = getConfig()
          const readiness = describeSmtpReadiness(cfg)
          sendJson(response, 200, {
            enabled: cfg.enabled !== false,
            ready: readiness.ready,
            missing: readiness.missing,
            configPath: configPath(),
            lastSend: lastResult,
          })
        },
      })

      const disposeConfig = hostCtx.webServer.register({
        kind: 'exact',
        path: `${HTTP_PREFIX}/config`,
        handler: async (request, response) => {
          if (request.method === 'GET') {
            const cfg = getConfig()
            const readiness = describeSmtpReadiness(cfg)
            return sendJson(response, 200, {
              config: publicConfig(cfg),
              ready: readiness.ready,
              missing: readiness.missing,
              configPath: configPath(),
            })
          }
          if (request.method !== 'POST' && request.method !== 'PUT') {
            return sendJson(response, 405, { error: 'use GET or POST' })
          }
          const body = await readJsonBody(request)
          if (!body || typeof body !== 'object') return sendJson(response, 400, { ok: false, error: '请求体不是合法 JSON' })
          const saved = saveConfig(body.config ?? body)
          if (!saved.ok) return sendJson(response, 500, { ok: false, error: saved.error })
          const readiness = describeSmtpReadiness(saved.value)
          log('info', `设置已更新（${configPath()}）`)
          sendJson(response, 200, {
            ok: true,
            config: publicConfig(saved.value),
            ready: readiness.ready,
            missing: readiness.missing,
            configPath: configPath(),
          })
        },
      })

      const disposeTest = hostCtx.webServer.register({
        kind: 'exact',
        path: `${HTTP_PREFIX}/test`,
        handler: async (request, response) => {
          if (request.method !== 'POST') return sendJson(response, 405, { error: 'use POST' })
          const body = await readJsonBody(request)
          const cfg = getConfig()
          const draft = body && typeof body === 'object' && body.config ? body.config : null
          const merged = draft ? { ...cfg, ...draft, smtp: { ...cfg.smtp, ...(draft.smtp ?? {}) } } : cfg
          const readiness = describeSmtpReadiness(merged)
          const pass = String(draft?.smtp?.pass ?? '').trim() || merged.smtp.pass
          const smtp = { ...merged.smtp, pass }
          const recipients = testRecipients(merged)
          if (!readiness.ready || recipients.length === 0 || !pass) {
            return sendJson(response, 400, {
              ok: false,
              error: '配置不完整：请填写 SMTP、授权码，并设置测试收件人或发件地址',
              missing: readiness.missing,
            })
          }
          try {
            const result = await sendMail({
              host: smtp.host,
              port: smtp.port,
              secure: smtp.secure,
              rejectUnauthorized: smtp.rejectUnauthorized !== false,
              allowInsecure: smtp.allowInsecure === true,
              user: smtp.user,
              pass,
              from: readiness.from,
              fromName: smtp.fromName,
              to: recipients,
              subject: '[DSH] send_email 测试',
              text: [
                '这是一封 dsh-email-send 的测试邮件。',
                '收到说明 SMTP 配置可用，助手可调 send_email 工具发信。',
                '',
                `时间：${new Date().toISOString()}`,
                `配置：${configPath()}`,
              ].join('\n'),
            })
            lastResult = { at: Date.now(), ok: true, to: recipients, messageId: result.messageId }
            sendJson(response, 200, { ok: true, to: recipients, messageId: result.messageId })
          } catch (error) {
            lastResult = { at: Date.now(), ok: false, error: error.message }
            sendJson(response, 500, { ok: false, error: error.message })
          }
        },
      })

      return () => {
        disposeStatus()
        disposeConfig()
        disposeTest()
      }
    })
  })
}
