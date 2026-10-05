/**
 * 线上真实响应 → 官方握手逻辑 的端到端验收
 * ------------------------------------------------------------
 * 与浏览器模拟的区别：这里抓的是 **线上 blog.heiyunas.top/api/auth
 * 返回的真实 HTML**（即你服务器上正在跑的那份 auth.js 的产物），
 * 再把其中的内联脚本放进一个受控的 window 沙箱里执行，
 * 用从 admin/vendor/decap-cms.js 反编译出来的官方逻辑去消费它。
 *
 * 这样能覆盖：模板拼接、转义、postMessage 顺序、origin 校验、JSON.parse。
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const BASE_URL = "https://blog.heiyunas.top";

function get(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d, headers: res.headers }));
    }).on("error", reject);
  });
}

// ---------- 官方逻辑（照抄 vendor 反编译结果） ----------
function makeDecapOfficial(base_url, provider) {
  const log = [];
  let resolved = null, err = null;
  let mode = "handshake";

  function onMessage(e) {
    // handshakeCallback
    if (mode === "handshake") {
      if (e.data === "authorizing:" + provider && e.origin === base_url) {
        log.push("阶段1 ✓ 收到 authorizing:" + provider + "，origin=" + e.origin + " 通过校验");
        mode = "authorize";
        // 官方回信：e.source.postMessage(e.data, e.origin)
        log.push("父窗口回信 " + JSON.stringify(e.data) + " → " + e.origin);
        return { kind: "reply", data: e.data, origin: e.origin };
      }
      log.push("阶段1 ✗ 丢弃: data=" + JSON.stringify(String(e.data).slice(0, 40)) + " origin=" + e.origin);
      return null;
    }
    // authorizeCallback
    if (e.origin !== base_url) { log.push("阶段2 ✗ origin 不匹配，丢弃"); return null; }
    const okP = "authorization:" + provider + ":success:";
    const errP = "authorization:" + provider + ":error:";
    if (e.data.indexOf(okP) === 0) {
      const raw = e.data.match(new RegExp("^authorization:" + provider + ":success:(.+)$"))[1];
      try { resolved = JSON.parse(raw); log.push("阶段2 ✓ success 解析成功: " + JSON.stringify(resolved)); }
      catch (x) { err = "JSON.parse 失败: " + x.message + " raw=" + raw; log.push("阶段2 ✗ " + err); }
      return { kind: "close" };
    }
    if (e.data.indexOf(errP) === 0) {
      const raw = e.data.match(new RegExp("^authorization:" + provider + ":error:(.+)$"))[1];
      try { err = JSON.parse(raw); log.push("阶段2 ✓ error 握手解析成功（协议正确）: " + JSON.stringify(err)); }
      catch (x) { err = "JSON.parse 失败: " + x.message; }
      return { kind: "close" };
    }
    log.push("阶段2 ✗ 未知消息前缀: " + String(e.data).slice(0, 50));
    return null;
  }

  return {
    onMessage, log,
    get resolved() { return resolved; },
    get error() { return err; },
    get mode() { return mode; },
  };
}

// ---------- 受控 window 沙箱：跑线上 HTML 里的内联脚本 ----------
function runPopupHtml(html, decap, base_url) {
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) return { ok: false, why: "响应里没有 <script> 块——不是握手页" };
  const script = scriptMatch[1];

  const sent = [];             // popup → 父窗口 的消息
  const listeners = [];        // popup 注册的 message 监听
  let closed = false;

  const fakeWindow = {
    // window.opener 是父窗口
    opener: {
      postMessage(data, origin) {
        sent.push({ data, origin });
        // 立刻把消息喂给"父窗口"的官方逻辑
        const r = decap.onMessage({ data, origin: base_url, source: null });
        if (r && r.kind === "reply") {
          // 父窗口回信 → 触发 popup 的 message 监听
          // 注意：事件对象里 origin 是父窗口的 origin
          listeners.slice().forEach((fn) => fn({ data: r.data, origin: r.origin }));
        }
        if (r && r.kind === "close") { /* 父窗口会 close，popup 自己也 close */ }
      },
    },
    addEventListener(type, fn) { if (type === "message") listeners.push(fn); },
    removeEventListener(type, fn) { const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); },
    close() { closed = true; },
  };

  // setTimeout 立即执行（不等 400ms）
  const fakeSetTimeout = (fn) => { try { fn(); } catch (e) {} };

  try {
    const fn = new Function("window", "setTimeout", script);
    fn(fakeWindow, fakeSetTimeout);
  } catch (e) {
    return { ok: false, why: "内联脚本执行异常: " + e.message };
  }

  return { ok: true, sent, closed, listeners };
}

// ============================================================
(async function main() {
  console.log("=".repeat(64));
  console.log("  线上真实响应 × 官方握手逻辑 端到端验收");
  console.log("=".repeat(64));

  let pass = 0, fail = 0;
  const chk = (n, c, d) => {
    if (c) { pass++; console.log("  ✓ " + n); }
    else { fail++; console.log("  ✗ " + n + (d ? "\n      → " + d : "")); }
  };

  // ---- 用例 A：假 code（线上会返回 error 握手页）----
  console.log("\n【用例 A】线上 ?code=FAKE  → 应返回 error 握手页并走完协议");
  const urlA = BASE_URL + "/api/auth?provider=github&code=FAKE_CODE_E2E&site_id=blog.heiyunas.top";
  const rA = await get(urlA);
  console.log("  · HTTP " + rA.status + "  content-type=" + rA.headers["content-type"]);
  chk("响应为 HTML 握手页（不是裸 JSON）",
    rA.status === 200 && /text\/html/.test(rA.headers["content-type"] || ""),
    "status=" + rA.status + " ct=" + rA.headers["content-type"]);
  chk("页面含 authorizing:github 起始握手", rA.body.indexOf("authorizing:github") > -1);

  const decapA = makeDecapOfficial(BASE_URL, "github");
  const popupA = runPopupHtml(rA.body, decapA, BASE_URL);
  chk("内联脚本可执行", popupA.ok, popupA.why);
  if (popupA.ok) {
    console.log("  · popup 实际发出的消息序列：");
    popupA.sent.forEach((m, i) => console.log("      [" + i + "] " + JSON.stringify(String(m.data).slice(0, 70)) + "  origin=" + m.origin));
    chk("第 1 条是 authorizing:github（顺序正确）",
      popupA.sent[0] && popupA.sent[0].data === "authorizing:github",
      JSON.stringify(popupA.sent[0]));
    const gotSuccessMsg = popupA.sent.some((m) => typeof m.data === "string" && m.data.indexOf("authorization:github:error:") === 0);
    chk("第 2 条是 error 握手（假 code 场景应走 error 分支）", gotSuccessMsg,
      "实际序列: " + JSON.stringify(popupA.sent.map((m) => String(m.data).slice(0, 40))));
    chk("官方逻辑走到了阶段2（说明阶段1 的 origin 校验通过）", decapA.mode === "authorize",
      "mode=" + decapA.mode + "\n      " + decapA.log.join("\n      "));
    chk("error 载荷被官方逻辑解析（error=bad_verification_code）",
      decapA.error && decapA.error.error === "bad_verification_code",
      JSON.stringify(decapA.error));
  }

  // ---- 用例 B：直接验 success 分支（把线上模板 + 假 token 拼出来）----
  console.log("\n【用例 B】同一份线上模板 + 假 token → 应走 success 分支并解析出 token");
  // 从线上 error 页里取出真实模板结构，替换 title/消息前缀/载荷，模拟 GitHub 换 token 成功的分支
  const authSrc = fs.readFileSync(path.join(ROOT, "functions", "api", "auth.js"), "utf8");
  const tplM = authSrc.match(/function successHandshake[\s\S]*?return `([\s\S]*?)`;\s*\}/);
  chk("能从 auth.js 取出 successHandshake 模板", !!tplM);
  if (tplM) {
    const fakePayload = JSON.stringify(JSON.stringify({ token: "gho_FAKE_E2E_TOKEN_123", provider: "github" }));
    const html = tplM[1].replace("${safe}", fakePayload.replace(/\$/g, "$$$$"));
    const decapB = makeDecapOfficial(BASE_URL, "github");
    const popupB = runPopupHtml(html, decapB, BASE_URL);
    chk("success 模板可执行", popupB.ok, popupB.why);
    if (popupB.ok) {
      console.log("  · popup 实际发出的消息序列：");
      popupB.sent.forEach((m, i) => console.log("      [" + i + "] " + JSON.stringify(String(m.data).slice(0, 80))));
      chk("先发 authorizing:github", popupB.sent[0] && popupB.sent[0].data === "authorizing:github");
      chk("再发 authorization:github:success:",
        popupB.sent.some((m) => typeof m.data === "string" && m.data.indexOf("authorization:github:success:") === 0));
      chk("官方逻辑解析出 token",
        decapB.resolved && decapB.resolved.token === "gho_FAKE_E2E_TOKEN_123",
        JSON.stringify(decapB.resolved) + " | log: " + decapB.log.join(" / "));
      chk("popup 被关闭", popupB.closed);
    }
  }

  console.log("\n" + "=".repeat(64));
  console.log("  通过 " + pass + " / 失败 " + fail);
  console.log("=".repeat(64));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("执行异常:", e); process.exit(2); });
