/**
 * 客户端半侧：包装格式、导出与 settings 槽位。
 *
 *   node test/client.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'client/client.js'), 'utf8')

assert.match(source, /id:\s*["']dsh-email-send["']/)
assert.doesNotMatch(source, /离开模式/)

const registered = []
const reactStub = {
  useRef: () => ({ current: { innerHTML: '', appendChild() {} } }),
  useEffect(fn) { fn() },
  createElement: () => ({}),
}

let clientExports = null

const sandbox = {
  window: {
    __ModuleLoader__: {
      load({ factory }) {
        const module = { exports: {} }
        const require = (name) => {
          if (name === 'react') return reactStub
          throw new Error(name)
        }
        clientExports = factory(require)
      },
    },
  },
  document: {
    querySelector: () => null,
    createElement: () => ({
      className: '',
      textContent: '',
      children: [],
      appendChild(c) { this.children.push(c) },
      addEventListener() {},
      setAttribute() {},
    }),
    head: { appendChild() {} },
  },
  fetch: async () => ({
    ok: true,
    json: async () => ({
      config: { enabled: true, testTo: '', smtp: { host: 'smtp.qq.com', port: 465, user: '', from: '' } },
      ready: false,
      missing: ['smtp.pass'],
      configPath: 'C:\\tmp\\config.json',
    }),
  }),
}

vm.runInNewContext(source, sandbox)

assert.equal(clientExports?.name, 'dsh-email-send')
assert.equal(JSON.stringify(clientExports?.inject), '["slots"]')

const slots = {
  inject(_name, produce) { return produce() },
  register(spec, factory) {
    registered.push(spec)
    return () => {}
  },
}

clientExports.apply({ slots })
assert.ok(registered.some((s) => s.id === 'email-send'))

console.log('✓ client.test.mjs 全部通过')
