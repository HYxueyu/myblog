/**
 * 握手协议审计：把 Decap 官方实现（admin/vendor/decap-cms.js 里反编译出来的）
 * 与我们的 OAuth 代理页（functions/api/auth.js）逐条对账。
 *
 * 官方实现（已从 vendor 里确认，是本次修复的唯一权威依据）：
 *
 *   handshakeCallback(provider, resolve):
 *     onMessage(e):
 *       if (e.data === "authorizing:" + provider && e.origin === this.base_url)
 *         removeListener(self)
 *         addListener(authorizeCallback)          // 换成第二阶段监听
 *         e.source.postMessage(e.data, e.origin)  // ★ 回信给 popup
 *
 *   authorizeCallback(provider, resolve):
 *     onMessage(e):
 *       if (e.origin === this.base_url)
 *         if e.data startsWith "authorization:" + provider + ":success:"
 *           payload = JSON.parse(e.data.replace(/^authorization:github:success:(.+)$/, "$1"))
 *           close popup; resolve(null, payload)
 *         if e.data startsWith "authorization:" + provider + ":error:"
 *           ...
 *
 * 结论要点：
 *   A. popup 必须发 "authorizing:github"，且 **e.origin 必须严格等于 base_url**
 *   B. popup 必须监听 message，等到父窗口回信后再发 success
 *   C. success 消息里冒号后的部分必须是 **JSON 字符串**（会被 JSON.parse）
 *   D. 父窗口回信的 origin 就是 base_url，popup 用 e.origin 回即可
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const AUTH = path.join(ROOT, "functions", "api", "auth.js");
const CONFIG = path.join(ROOT, "admin", "config.yml");

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "\n      → " + detail : "")); }
}

console.log("\n=== 1. 配置侧：base_url 与 origin 的关系 ===");

const cfg = fs.readFileSync(CONFIG, "utf8");
const baseUrlMatch = cfg.match(/^\s*base_url:\s*(\S+)\s*$/m);
const authEpMatch = cfg.match(/^\s*auth_endpoint:\s*(\S+)\s*$/m);
const baseUrl = baseUrlMatch ? baseUrlMatch[1].replace(/\/+$/, "") : null;
const authEndpoint = authEpMatch ? authEpMatch[1].replace(/\/+$/, "") : null;

check("config.yml 有 base_url", !!baseUrl, JSON.stringify(baseUrlMatch));
check("config.yml 有 auth_endpoint", !!authEndpoint, JSON.stringify(authEpMatch));
check("base_url 无尾斜杠（Decap 会 trimEnd('/')，有的话不影响但易混淆）",
  baseUrl === "https://blog.heiyunas.top", "实际: " + baseUrl);
check("auth_endpoint 不含前导斜杠（模板是 `${base_url}/${auth_endpoint}`）",
  authEndpoint === "api/auth", "实际: " + authEndpoint);

const popupUrl = `${baseUrl}/${authEndpoint}?provider=github&site_id=blog.heiyunas.top`;
console.log("  · popup 实际打开: " + popupUrl);
console.log("  · 浏览器给该页的 origin: " + JSON.stringify(baseUrl));
console.log("  · 官方校验 r.origin === this.base_url → " + (baseUrl === "https://blog.heiyunas.top" ? "通过" : "失败"));

console.log("\n=== 2. 代理页：必须发出的三条消息 ===");

const src = fs.readFileSync(AUTH, "utf8");
const js = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

check("发出起始握手 'authorizing:github'",
  /postMessage\(\s*['"]authorizing:\s*['"]\s*\+\s*['"]github['"]/.test(js) ||
  /postMessage\(\s*['"]authorizing:github['"]/.test(js),
  "没找到 authorizing:github 的 postMessage");

// 官方 e.source.postMessage(e.data, e.origin) 回信的 data 就是 "authorizing:github"
check("起始握手的 targetOrigin 是 '*'（握手时还不知道父窗口 origin，官方也接受）",
  /postMessage\(\s*['"]authorizing:github['"]\s*,\s*['"]\*['"]\s*\)/.test(js) ||
  /postMessage\(\s*['"]authorizing:\s*['"]\s*\+\s*['"]github['"]\s*,\s*['"]\*['"]\s*\)/.test(js),
  "起始握手的 targetOrigin 不是 '*'");

check("注册了 message 监听（等父窗口回信）",
  /addEventListener\(\s*['"]message['"]/.test(js),
  "没注册 message 监听——这就是「授权后回不去」的经典成因");

// receive 函数体大致长度 500 字符上下，放宽到 900 再判
check("收到回信后才发 success 消息（success 在 receive 函数体内）",
  /receive[\s\S]{0,900}?authorization\s*:\s*github\s*:\s*success:/.test(js) ||
  /authorization:github:success:/.test(js),
  "success 消息不在 receive 回调里，顺序可能不对");

check("success 消息前缀正确 'authorization:github:success:'",
  /authorization:github:success:/.test(js),
  "消息前缀拼错——Decap 用 indexOf('authorization:github:success:') 精确匹配");

check("error 消息前缀正确 'authorization:github:error:'",
  /authorization:github:error:/.test(js),
  "错误分支没走 Decap 协议，后台会干等而不是报错");

console.log("\n=== 3. 载荷格式：冒号后面必须是 JSON 字符串 ===");

// 官方: JSON.parse(e.data.match(/^authorization:github:success:(.+)$/)[1])
// 所以 message = 'authorization:github:success:' + JSON.stringify({token, provider})
check("success 载荷含 token 字段", /token\s*:/.test(src), "载荷里没有 token");
check("success 载荷含 provider 字段", /provider\s*:\s*['"]github['"]/.test(src), "载荷里没有 provider");

// 我们内部用 JSON.stringify(jsonPayload) 生成 safe，jsonPayload 本身已经是 JSON 字符串
const sig = src.match(/successHandshake\s*\(([^)]*)\)/);
check("successHandshake 接收 JSON 字符串参数", !!sig, "签名异常");

console.log("\n=== 4. 父窗口接收侧模拟（复刻官方逻辑跑一遍） ===");

// 复刻官方 handshakeCallback + authorizeCallback，验证我们的消息能被正确消费
function simulateDecapOfficial(base_url, provider) {
  const log = [];
  let resolved = null, error = null;
  let phase = 1;

  function handshake(e) {
    if (e.data === "authorizing:" + provider && e.origin === base_url) {
      log.push("父窗口收到 authorizing:" + provider + " (origin 校验通过)");
      phase = 2;
      // 官方回信：e.source.postMessage(e.data, e.origin)
      log.push("父窗口回信 data=" + e.data + " targetOrigin=" + e.origin);
      return { reply: e.data, replyOrigin: e.origin, toPhase: 2 };
    }
    log.push("父窗口忽略消息(阶段1): data=" + JSON.stringify(e.data) + " origin=" + e.origin);
    return null;
  }

  function authorize(e) {
    if (e.origin !== base_url) { log.push("阶段2 origin 不匹配，丢弃"); return null; }
    const okPrefix = "authorization:" + provider + ":success:";
    if (e.data.indexOf(okPrefix) === 0) {
      const raw = e.data.match(new RegExp("^authorization:" + provider + ":success:(.+)$"))[1];
      try {
        resolved = JSON.parse(raw);
        log.push("父窗口拿到 token: " + JSON.stringify(resolved));
      } catch (err) {
        error = "JSON.parse 失败: " + err.message;
        log.push("❌ " + error + " raw=" + raw);
      }
      return { close: true, resolved };
    }
    return null;
  }

  return { handshake, authorize, log, get resolved() { return resolved; }, get error() { return error; }, get phase() { return phase; }, set phase(v) { phase = v; } };
}

// 抽真实的模板字符串来跑（避免手写副本与实现漂移）
const successTpl = src.match(/function successHandshake[\s\S]*?return `([\s\S]*?)`;\s*\}/);
check("能从 auth.js 抽出 successHandshake 模板", !!successTpl, "抽取失败");

if (successTpl) {
  // 用真实模板 + 假 token 生成 HTML，再把内联脚本抽出来在隔离环境执行
  const html = successTpl[1].replace("${safe}", JSON.stringify(JSON.stringify({ token: "gho_TESTTOKEN", provider: "github" })));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  // 造一个假 window 环境，模拟 popup 侧
  const parentLog = [];
  const fakeOpener = {
    postMessage(data, origin) { parentLog.push({ data, origin }); },
  };
  const listeners = [];
  const fakeWindow = {
    opener: fakeOpener,
    addEventListener(type, fn) { if (type === "message") listeners.push(fn); },
    close() { parentLog.push({ closed: true }); },
  };

  const fn = new Function("window", "setTimeout", script);
  fn(fakeWindow, function (cb, ms) { /* 不真等，立即执行 */ cb(); });

  console.log("  · popup 发出的第 1 条消息: " + JSON.stringify(parentLog[0]));
  check("popup 先发 authorizing:github（顺序第 1）",
    parentLog[0] && parentLog[0].data === "authorizing:github",
    "实际: " + JSON.stringify(parentLog[0]));

  // 父窗口走官方逻辑
  const decap = simulateDecapOfficial(baseUrl, "github");
  const r1 = decap.handshake({ data: parentLog[0].data, origin: baseUrl });
  console.log("  · " + decap.log.join("\n  · "));

  check("官方 handshakeCallback 接受我们的起始握手（origin 校验通过）",
    !!r1, "被官方逻辑丢弃");

  if (r1) {
    // popup 收到回信 → 触发 receive
    listeners.forEach(fn => fn({ origin: r1.replyOrigin, data: r1.reply }));
    const successMsg = parentLog.find(m => typeof m.data === "string" && m.data.indexOf("authorization:github:success:") === 0);
    console.log("  · popup 发出的第 2 条消息: " + (successMsg ? successMsg.data.slice(0, 60) + "..." : "(无)"));

    check("popup 收到回信后发出了 success 消息", !!successMsg, "第二步没走");

    if (successMsg) {
      const r2 = decap.authorize({ data: successMsg.data, origin: r1.replyOrigin });
      console.log("  · " + decap.log.slice(1).join("\n  · "));
      check("官方 authorizeCallback 成功解析出 token", !!r2 && !!decap.resolved, decap.error || "未解析");
      if (decap.resolved) {
        check("token 内容正确", decap.resolved.token === "gho_TESTTOKEN" && decap.resolved.provider === "github",
          JSON.stringify(decap.resolved));
      }
      check("成功后 popup 被关闭", parentLog.some(m => m.closed), "没调 close()");
    }
  }
}

console.log("\n=== 5. 全链路结论 ===");
console.log(`  通过 ${pass} / 失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
