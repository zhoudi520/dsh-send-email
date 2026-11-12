# dsh-email-send

DeepSeek Harness 插件：在对话里用 **`send_email`** 工具发送纯文本邮件。

## 能力

| 项目 | 说明 |
| --- | --- |
| 助手工具 | `send_email`（参数：`to`、`subject`、`body`） |
| 配置 | **设置 → 邮件发送**（SMTP 账号、授权码等） |
| 不含 | 离开模式、任务完成通知、模板占位符等旧版通知功能 |

配置好后可在 harness 中说：**「把下面内容发给 xxx@qq.com」**，模型应调用 `send_email`。

## 安装

```bash
dsh plugin --profile web add link:/绝对路径/dsh-email-send
```

重启 DSH 桌面端，在 **设置 → 邮件发送** 填写 QQ/163 等 SMTP 与授权码，点「发送测试邮件」验证。

卸载旧版 `dsh-email-notify` 后改用本包；首次启动会尝试从旧 `config.json` **仅迁移 SMTP 字段**。

## 工具说明

- **to**：收件人，多个用逗号或分号分隔  
- **subject**：主题  
- **body**：纯文本正文  

发件人、服务器等来自设置页，不在工具参数里重复填写。

## 自检

```bash
npm test
node scripts/send-test.mjs
```

## License

MIT
