/**
 * dsh-email-send — 浏览器半侧：设置 → 邮件发送。
 */
window.__ModuleLoader__.load({
  id: "dsh-email-send",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = null;
    try { React = require("react"); } catch (e) { React = null; }

    var ENDPOINT = "/dsh-email-send";

    var CSS = [
      ".dsh-email-send-settings{font-size:13px;line-height:1.7;padding:4px 0 32px;max-width:720px;color:inherit;}",
      ".dsh-email-send-settings .status{border:1px solid rgba(127,127,127,.28);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;}",
      ".dsh-email-send-settings .ok{color:#12a150;}",
      ".dsh-email-send-settings .warn{color:#d97706;}",
      ".dsh-email-send-settings .err{color:#dc2626;}",
      ".dsh-email-send-settings .group{border:1px solid rgba(127,127,127,.28);border-radius:10px;padding:14px 16px;margin-bottom:14px;}",
      ".dsh-email-send-settings .group-title{font-weight:600;font-size:14px;margin-bottom:10px;}",
      ".dsh-email-send-settings .row{display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:center;margin:8px 0;}",
      ".dsh-email-send-settings label{font-size:12px;opacity:.85;}",
      ".dsh-email-send-settings input[type='text'],.dsh-email-send-settings input[type='password'],.dsh-email-send-settings input[type='number']{width:100%;max-width:360px;padding:6px 9px;border:1px solid rgba(127,127,127,.4);border-radius:7px;background:transparent;color:inherit;font-size:13px;}",
      ".dsh-email-send-settings .hint{opacity:.6;font-size:12px;margin-top:4px;}",
      ".dsh-email-send-settings .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;}",
      ".dsh-email-send-settings button{padding:7px 14px;border:1px solid rgba(127,127,127,.45);border-radius:8px;background:transparent;color:inherit;font-size:13px;cursor:pointer;}",
      ".dsh-email-send-settings button:disabled{opacity:.5;cursor:default;}",
      ".dsh-email-send-settings .msg{margin-top:10px;font-size:12px;white-space:pre-wrap;}",
    ].join("");

    function ensureCss(text) {
      var id = "dsh-email-send-panel";
      var sel = "style[data-" + id + "]";
      var node = document.querySelector(sel);
      if (node) {
        if (node.textContent !== text) node.textContent = text;
        return;
      }
      var style = document.createElement("style");
      style.setAttribute("data-" + id, "");
      style.textContent = text;
      (document.head || document.documentElement).appendChild(style);
    }

    function el(tag, props, children) {
      var node = document.createElement(tag);
      if (props) {
        Object.keys(props).forEach(function (key) {
          var value = props[key];
          if (value === undefined || value === null || value === false) return;
          if (key === "class") node.className = value;
          else if (key === "text") node.textContent = value;
          else if (key === "on") Object.keys(value).forEach(function (name) { node.addEventListener(name, value[name]); });
          else if (key === "type" || key === "value" || key === "disabled" || key === "placeholder" || key === "autocomplete") node[key] = value;
          else node.setAttribute(key, value);
        });
      }
      (children || []).forEach(function (child) { if (child) node.appendChild(child); });
      return node;
    }

    function request(path, init) {
      return fetch(ENDPOINT + path, init || {}).then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
      });
    }

    function EmailSendSettings() {
      var ref = React.useRef(null);
      React.useEffect(function () {
        if (!ref.current) return;
        ref.current.innerHTML = "";
        ensureCss(CSS);
        var root = el("div", { class: "dsh-email-send-settings" });
        ref.current.appendChild(root);
        buildPanel(root);
      }, []);
      return React.createElement("div", { ref: ref });
    }

  function buildPanel(root) {
      var draft = { enabled: true, testTo: "", smtp: { host: "smtp.qq.com", port: 465, secure: true, user: "", pass: "", from: "", fromName: "DeepSeek Harness" } };
      var status = { ready: false, missing: [], configPath: "" };
      var msgNode = el("div", { class: "msg" });
      var statusNode = el("div", { class: "status" });

      function setMsg(kind, text) {
        msgNode.className = "msg" + (kind ? " " + kind : "");
        msgNode.textContent = text || "";
      }

      function renderStatus() {
        statusNode.innerHTML = "";
        var lines = [
          status.ready ? "SMTP 已就绪，助手可使用 send_email 工具。" : "未完成：" + (status.missing || []).join(", "),
          "配置文件：" + (status.configPath || ""),
        ];
        lines.forEach(function (line) {
          statusNode.appendChild(el("div", { class: status.ready ? "ok" : "warn", text: line }));
        });
      }

      function field(label, input) {
        return el("div", { class: "row" }, [el("label", { text: label }), input]);
      }

      var saveBtn = el("button", { text: "保存设置" });
      var testBtn = el("button", { text: "发送测试邮件" });
      var reloadBtn = el("button", { text: "重新读取" });

      var inputs = {};

      function rebuildForm() {
        while (root.firstChild) root.removeChild(root.firstChild);
        root.appendChild(statusNode);
        renderStatus();

        var basic = el("div", { class: "group" }, [
          el("div", { class: "group-title", text: "发信账号（QQ 邮箱已预置服务器）" }),
          field("邮箱账号", inputs.user = el("input", { type: "text", value: draft.smtp.user, autocomplete: "username", on: { input: function (e) { draft.smtp.user = e.target.value; } } })),
          field("授权码", inputs.pass = el("input", { type: "password", placeholder: "留空表示不修改", autocomplete: "new-password", on: { input: function (e) { draft.smtp.pass = e.target.value; } } })),
          field("发件地址", inputs.from = el("input", { type: "text", placeholder: "默认同邮箱账号", value: draft.smtp.from, on: { input: function (e) { draft.smtp.from = e.target.value; } } })),
          field("显示名称", inputs.fromName = el("input", { type: "text", value: draft.smtp.fromName, on: { input: function (e) { draft.smtp.fromName = e.target.value; } } })),
          field("测试收件人", inputs.testTo = el("input", { type: "text", placeholder: "留空则发到发件地址", value: draft.testTo, on: { input: function (e) { draft.testTo = e.target.value; } } })),
        ]);
        root.appendChild(basic);

        var advanced = el("div", { class: "group" }, [
          el("div", { class: "group-title", text: "高级 SMTP" }),
          field("服务器", inputs.host = el("input", { type: "text", value: draft.smtp.host, on: { input: function (e) { draft.smtp.host = e.target.value; } } })),
          field("端口", inputs.port = el("input", { type: "number", value: String(draft.smtp.port), on: { input: function (e) { draft.smtp.port = Number(e.target.value) || 465; } } })),
          el("div", { class: "hint", text: "助手发信使用 send_email(to, subject, body)。收件人由对话指定，无需在此填写默认收件人。" }),
        ]);
        root.appendChild(advanced);

        root.appendChild(el("div", { class: "actions" }, [saveBtn, testBtn, reloadBtn]));
        root.appendChild(msgNode);
      }

      function adopt(cfg) {
        draft.enabled = cfg.enabled !== false;
        draft.testTo = cfg.testTo || "";
        var s = cfg.smtp || {};
        draft.smtp.host = s.host || "smtp.qq.com";
        draft.smtp.port = s.port || 465;
        draft.smtp.secure = s.secure !== false;
        draft.smtp.user = s.user || "";
        draft.smtp.pass = "";
        draft.smtp.from = s.from || "";
        draft.smtp.fromName = s.fromName || "DeepSeek Harness";
      }

      function load() {
        request("/config").then(function (res) {
          if (res.ok) {
            adopt(res.data.config);
            status.ready = res.data.ready;
            status.missing = res.data.missing || [];
            status.configPath = res.data.configPath || "";
          } else setMsg("err", "读取配置失败");
          rebuildForm();
        }).catch(function (err) { setMsg("err", err.message); rebuildForm(); });
      }

      saveBtn.addEventListener("click", function () {
        saveBtn.disabled = true;
        var patch = {
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
        };
        if (draft.smtp.pass) patch.smtp.pass = draft.smtp.pass;
        request("/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ config: patch }),
        }).then(function (res) {
          if (!res.ok) setMsg("err", res.data.error || "保存失败");
          else {
            adopt(res.data.config);
            status.ready = res.data.ready;
            status.missing = res.data.missing || [];
            setMsg(res.data.ready ? "ok" : "warn", res.data.ready ? "已保存。" : "已保存，仍缺：" + res.data.missing.join(", "));
          }
          rebuildForm();
        }).catch(function (err) { setMsg("err", err.message); }).then(function () { saveBtn.disabled = false; });
      });

      testBtn.addEventListener("click", function () {
        testBtn.disabled = true;
        setMsg(null, "正在发送…");
        var body = {
          config: {
            testTo: draft.testTo,
            smtp: {
              host: draft.smtp.host,
              port: draft.smtp.port,
              secure: draft.smtp.secure,
              user: draft.smtp.user,
              from: draft.smtp.from,
              fromName: draft.smtp.fromName,
            },
          },
        };
        if (draft.smtp.pass) body.config.smtp.pass = draft.smtp.pass;
        request("/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }).then(function (res) {
          if (res.ok) setMsg("ok", "测试邮件已发送 → " + (res.data.to || []).join(", "));
          else setMsg("err", res.data.error || "发送失败");
        }).catch(function (err) { setMsg("err", err.message); }).then(function () { testBtn.disabled = false; });
      });

      reloadBtn.addEventListener("click", function () { load(); setMsg(null, ""); });

      load();
    }

    function apply(ctx) {
      var slots = ctx && ctx.slots ? ctx.slots : (ctx && typeof ctx.get === "function" ? ctx.get("slots") : null);
      if (!React || !slots || typeof slots.inject !== "function" || typeof slots.register !== "function") return;
      try {
        slots.inject("settings.section", function () {
          return slots.register({
            name: "settings.section",
            id: "email-send",
            order: 65,
            label: function () { return "邮件发送"; },
          }, function () { return React.createElement(EmailSendSettings); });
        });
      } catch (e) { /* 槽位不存在 */ }
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    exports.name = "dsh-email-send";
    return module.exports;
  }
});
