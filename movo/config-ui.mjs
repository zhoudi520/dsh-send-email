const CSS = [
  '.dsh-email-send-settings{font-size:13px;line-height:1.7;padding:4px 0 32px;max-width:720px;color:inherit;}',
  '.dsh-email-send-settings .status{border:1px solid rgba(127,127,127,.28);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;}',
  '.dsh-email-send-settings .ok{color:#12a150;}',
  '.dsh-email-send-settings .warn{color:#d97706;}',
  '.dsh-email-send-settings .err{color:#dc2626;}',
  '.dsh-email-send-settings .group{border:1px solid rgba(127,127,127,.28);border-radius:10px;padding:14px 16px;margin-bottom:14px;}',
  '.dsh-email-send-settings .group-title{font-weight:600;font-size:14px;margin-bottom:10px;}',
  '.dsh-email-send-settings .row{display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:center;margin:8px 0;}',
  '.dsh-email-send-settings label{font-size:12px;opacity:.85;}',
  '.dsh-email-send-settings input[type="text"],.dsh-email-send-settings input[type="password"],.dsh-email-send-settings input[type="number"]{width:100%;max-width:360px;padding:6px 9px;border:1px solid rgba(127,127,127,.4);border-radius:7px;background:transparent;color:inherit;font-size:13px;}',
  '.dsh-email-send-settings .hint{opacity:.6;font-size:12px;margin-top:4px;}',
  '.dsh-email-send-settings .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;}',
  '.dsh-email-send-settings button{padding:7px 14px;border:1px solid rgba(127,127,127,.45);border-radius:8px;background:transparent;color:inherit;font-size:13px;cursor:pointer;}',
  '.dsh-email-send-settings button:disabled{opacity:.5;cursor:default;}',
  '.dsh-email-send-settings .msg{margin-top:10px;font-size:12px;white-space:pre-wrap;}',
].join('')

/**
 * Mount the MOVO configuration panel for dsh-email-send.
 *
 * @param {HTMLElement} host
 * @param {import('@movo/dsh-plugin-config-sdk').PluginConfigSdk} sdk
 */
export async function mount(host, sdk) {
  const root = document.createElement('div')
  root.className = 'dsh-email-send-settings'
  host.appendChild(root)

  const styleId = 'dsh-email-send-movo-css'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = CSS
    document.head.appendChild(style)
  }

  const draft = {
    enabled: true,
    testTo: '',
    smtp: { host: 'smtp.qq.com', port: 465, secure: true, user: '', pass: '', from: '', fromName: 'BackMan AI' },
  }
  let ready = false
  let missing = []

  const statusNode = document.createElement('div')
  statusNode.className = 'status'
  const msgNode = document.createElement('div')
  msgNode.className = 'msg'

  /** @param {'ok'|'warn'|'err'|null} kind */
  function setMsg(kind, text) {
    msgNode.className = kind ? `msg ${kind}` : 'msg'
    msgNode.textContent = text || ''
  }

  function renderStatus() {
    statusNode.replaceChildren()
    const block = document.createElement('div')
    block.className = ready ? 'ok' : 'warn'
    block.textContent = ready ? 'SMTP 已就绪，助手可使用 send_email 工具。' : `未完成：${missing.join(', ')}`
    statusNode.appendChild(block)
  }

  /**
   * @param {string} label
   * @param {HTMLInputElement} input
   */
  function field(label, input) {
    const row = document.createElement('div')
    row.className = 'row'
    const labelNode = document.createElement('label')
    labelNode.textContent = label
    row.append(labelNode, input)
    return row
  }

  const saveBtn = document.createElement('button')
  saveBtn.textContent = '保存设置'
  const testBtn = document.createElement('button')
  testBtn.textContent = '发送测试邮件'
  const reloadBtn = document.createElement('button')
  reloadBtn.textContent = '重新读取'

  function rebuildForm() {
    root.replaceChildren(statusNode)
    renderStatus()

    const basic = document.createElement('div')
    basic.className = 'group'
    const basicTitle = document.createElement('div')
    basicTitle.className = 'group-title'
    basicTitle.textContent = '发信账号（QQ 邮箱已预置服务器）'
    basic.appendChild(basicTitle)

    const userInput = document.createElement('input')
    userInput.type = 'text'
    userInput.autocomplete = 'username'
    userInput.value = draft.smtp.user
    userInput.addEventListener('input', (event) => { draft.smtp.user = event.target.value })
    basic.appendChild(field('邮箱账号', userInput))

    const passInput = document.createElement('input')
    passInput.type = 'password'
    passInput.placeholder = '留空表示不修改'
    passInput.autocomplete = 'new-password'
    passInput.addEventListener('input', (event) => { draft.smtp.pass = event.target.value })
    basic.appendChild(field('授权码', passInput))

    const fromInput = document.createElement('input')
    fromInput.type = 'text'
    fromInput.placeholder = '默认同邮箱账号'
    fromInput.value = draft.smtp.from
    fromInput.addEventListener('input', (event) => { draft.smtp.from = event.target.value })
    basic.appendChild(field('发件地址', fromInput))

    const fromNameInput = document.createElement('input')
    fromNameInput.type = 'text'
    fromNameInput.value = draft.smtp.fromName
    fromNameInput.addEventListener('input', (event) => { draft.smtp.fromName = event.target.value })
    basic.appendChild(field('显示名称', fromNameInput))

    const testToInput = document.createElement('input')
    testToInput.type = 'text'
    testToInput.placeholder = '留空则发到发件地址'
    testToInput.value = draft.testTo
    testToInput.addEventListener('input', (event) => { draft.testTo = event.target.value })
    basic.appendChild(field('测试收件人', testToInput))
    root.appendChild(basic)

    const advanced = document.createElement('div')
    advanced.className = 'group'
    const advancedTitle = document.createElement('div')
    advancedTitle.className = 'group-title'
    advancedTitle.textContent = '高级 SMTP'
    advanced.appendChild(advancedTitle)

    const hostInput = document.createElement('input')
    hostInput.type = 'text'
    hostInput.value = draft.smtp.host
    hostInput.addEventListener('input', (event) => { draft.smtp.host = event.target.value })
    advanced.appendChild(field('服务器', hostInput))

    const portInput = document.createElement('input')
    portInput.type = 'number'
    portInput.value = String(draft.smtp.port)
    portInput.addEventListener('input', (event) => { draft.smtp.port = Number(event.target.value) || 465 })
    advanced.appendChild(field('端口', portInput))

    const hint = document.createElement('div')
    hint.className = 'hint'
    hint.textContent = '助手发信使用 send_email(to, subject, body)。收件人由对话指定。'
    advanced.appendChild(hint)
    root.appendChild(advanced)

    const actions = document.createElement('div')
    actions.className = 'actions'
    actions.append(saveBtn, testBtn, reloadBtn)
    root.appendChild(actions)
    root.appendChild(msgNode)
  }

  function adopt(cfg) {
    draft.enabled = cfg.enabled !== false
    draft.testTo = String(cfg.testTo || '')
    const smtp = cfg.smtp && typeof cfg.smtp === 'object' ? cfg.smtp : {}
    draft.smtp.host = smtp.host || 'smtp.qq.com'
    draft.smtp.port = Number(smtp.port) || 465
    draft.smtp.secure = smtp.secure !== false
    draft.smtp.user = String(smtp.user || '')
    draft.smtp.pass = ''
    draft.smtp.from = String(smtp.from || '')
    draft.smtp.fromName = String(smtp.fromName || 'BackMan AI')
  }

  async function load() {
    try {
      const view = await sdk.getConfig()
      adopt(view.config)
      const meta = await sdk.getMeta()
      ready = meta.ready
      missing = meta.missing || []
      rebuildForm()
    } catch (error) {
      setMsg('err', error instanceof Error ? error.message : '读取配置失败')
      rebuildForm()
    }
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true
    const patch = {
      enabled: draft.enabled,
      testTo: draft.testTo,
      smtp: {
        host: draft.smtp.host,
        port: draft.smtp.port,
        secure: draft.smtp.secure,
        user: draft.smtp.user,
        from: draft.smtp.from,
        fromName: draft.smtp.fromName,
      },
    }
    if (draft.smtp.pass) patch.smtp.pass = draft.smtp.pass
    try {
      await sdk.saveConfig(patch)
      const meta = await sdk.getMeta()
      ready = meta.ready
      missing = meta.missing || []
      const view = await sdk.getConfig()
      adopt(view.config)
      setMsg(meta.ready ? 'ok' : 'warn', meta.ready ? '已保存。' : `已保存，仍缺：${missing.join(', ')}`)
    } catch (error) {
      setMsg('err', error instanceof Error ? error.message : '保存失败')
    } finally {
      saveBtn.disabled = false
      rebuildForm()
    }
  })

  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true
    setMsg(null, '正在发送…')
    const draftPatch = {
      testTo: draft.testTo,
      smtp: {
        host: draft.smtp.host,
        port: draft.smtp.port,
        secure: draft.smtp.secure,
        user: draft.smtp.user,
        from: draft.smtp.from,
        fromName: draft.smtp.fromName,
      },
    }
    if (draft.smtp.pass) draftPatch.smtp.pass = draft.smtp.pass
    try {
      const result = await sdk.testConfig({ draft: draftPatch })
      if (result.ok) setMsg('ok', `测试邮件已发送 → ${(result.to || []).join(', ')}`)
      else setMsg('err', result.error || '发送失败')
    } catch (error) {
      setMsg('err', error instanceof Error ? error.message : '发送失败')
    } finally {
      testBtn.disabled = false
    }
  })

  reloadBtn.addEventListener('click', () => { load(); setMsg(null, '') })

  await load()
}
