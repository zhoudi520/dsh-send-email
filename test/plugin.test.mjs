/**
 * 宿主半侧自检：send_email 工具 + HTTP 配置接口。
 *
 *   node test/plugin.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeHeader, parseMessage, startMockSmtp } from './mock-smtp.mjs'

const home = mkdtempSync(join(tmpdir(), 'dsh-email-send-test-'))
process.env.DSH_HOME = home
mkdirSync(join(home, 'dsh-email-send'), { recursive: true })

const smtp = await startMockSmtp({ user: 'me@qq.com', pass: 'authcode' })
const configPath = join(home, 'dsh-email-send', 'config.json')

writeFileSync(configPath, JSON.stringify({
  enabled: true,
  smtp: {
    host: '127.0.0.1',
    port: smtp.port,
    secure: false,
    allowInsecure: true,
    user: 'me@qq.com',
    pass: 'authcode',
    from: 'me@qq.com',
    fromName: 'DSH',
  },
}, null, 2), 'utf8')

const routes = new Map()
let sendEmailTool

const ctx = {
  logger: { info() {}, warn() {} },
  tools: {
    register(def) {
      sendEmailTool = def
      return () => { sendEmailTool = undefined }
    },
  },
  effect(fn) {
    const dispose = fn()
    return dispose
  },
  inject(_deps, callback) {
    callback({
      effect(fn) {
        return fn()
      },
      webServer: {
        register(route) {
          if (routes.has(route.path)) throw new Error(`duplicate ${route.path}`)
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    })
  },
}

const { apply } = await import('../lib/index.js')
apply(ctx)

assert.equal(sendEmailTool?.name, 'send_email')

async function callRoute(path, { method = 'GET', body = null } = {}) {
  const route = routes.get(path)
  assert.ok(route, path)
  const chunks = []
  const req = {
    method,
    url: path,
    on(event, handler) {
      if (event === 'data' && body) handler(Buffer.from(JSON.stringify(body)))
      if (event === 'end') handler()
    },
  }
  const res = {
    statusCode: 0,
    body: '',
    writeHead(status) { this.statusCode = status },
    end(payload) { this.body = payload ?? '' },
  }
  await route.handler(req, res)
  return { status: res.statusCode, data: JSON.parse(res.body || '{}') }
}

const result = await sendEmailTool.execute(
  { to: 'friend@example.com', subject: '你好', body: '正文内容' },
  { signal: AbortSignal.timeout(5000) },
)
assert.ok(result.messageId)
assert.deepEqual(result.to, ['friend@example.com'])

const raw = smtp.messages.at(-1)
assert.ok(raw)
const mail = parseMessage(raw)
assert.match(decodeHeader(mail.headers.get('subject')), /你好/)
assert.match(mail.body, /正文内容/)
assert.match(mail.headers.get('to') ?? '', /friend@example.com/)

const configGet = await callRoute('/dsh-email-send/config')
assert.equal(configGet.data.ready, true)
assert.equal(configGet.data.config.smtp.pass, '')

const testPost = await callRoute('/dsh-email-send/test', { method: 'POST', body: {} })
assert.equal(testPost.data.ok, true)

await smtp.close()

console.log('✓ plugin.test.mjs 全部通过')
