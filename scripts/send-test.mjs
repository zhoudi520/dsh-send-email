#!/usr/bin/env node
/**
 * 独立发信自检（不依赖 DSH 进程）。
 *
 *   node scripts/send-test.mjs
 *   node scripts/send-test.mjs --check
 */
import { configPath, describeSmtpReadiness, loadConfig, testRecipients } from '../lib/config.js'
import { sendMail } from '../lib/smtp.js'

const checkOnly = process.argv.includes('--check')
const loaded = loadConfig(true)
const ready = describeSmtpReadiness(loaded.value)
const recipients = testRecipients(loaded.value)

console.log(`配置文件：${loaded.path}`)
if (!ready.ready || recipients.length === 0) {
  console.log(`✗ 未完成：${ready.missing.join(', ')}${recipients.length === 0 ? '；请填写 testTo 或发件地址' : ''}`)
  process.exit(1)
}

const { smtp } = loaded.value
console.log(`✓ SMTP 就绪：${ready.from}（测试 → ${recipients.join(', ')}）`)
if (checkOnly) process.exit(0)

try {
  const result = await sendMail({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    rejectUnauthorized: smtp.rejectUnauthorized !== false,
    allowInsecure: smtp.allowInsecure === true,
    user: smtp.user,
    pass: smtp.pass,
    from: ready.from,
    fromName: smtp.fromName,
    to: recipients,
    subject: '[DSH] dsh-email-send 自检',
    text: `send_email 插件 SMTP 自检\n${new Date().toISOString()}\n${configPath()}`,
  })
  console.log(`✓ 已投递 messageId=${result.messageId}`)
} catch (error) {
  console.log(`✗ ${error.message}`)
  process.exit(1)
}
