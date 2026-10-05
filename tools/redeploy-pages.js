/**
 * 触发 Cloudflare Pages 重新部署
 * ------------------------------------------------------------
 * 环境变量改动后必须重新部署才生效。控制台打不开时用这个。
 *
 * 用法（PowerShell，在 my-blog 目录）：
 *   $env:CF_API_TOKEN="..."
 *   $env:CF_ACCOUNT_ID="..."
 *   node tools/redeploy-pages.js
 *
 * 可选：
 *   $env:CF_PAGES_PROJECT="myblog"    # 默认 myblog
 *
 * 日志同时写 tools/redeploy-pages.log
 */

const https = require("https");
const dns = require("dns");
const fs = require("fs");
const path = require("path");

// 清死代理（本机 HTTP_PROXY 端口开但上游不通，Node 会自动读导致 TIMEOUT）
["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"].forEach((k) => delete process.env[k]);

const LOGF = path.join(__dirname, "redeploy-pages.log");
try { fs.writeFileSync(LOGF, ""); } catch (e) {}
const _log = console.log;
console.log = (...a) => {
  const s = a.map((x) => (typeof x === "string" ? x : String(x))).join(" ");
  _log(s);
  try { fs.appendFileSync(LOGF, s + "\n"); } catch (e) {}
};

const TOKEN = process.env.CF_API_TOKEN;
const ACCT = process.env.CF_ACCOUNT_ID;
const PROJECT = process.env.CF_PAGES_PROJECT || "myblog";
const HOST = "api.cloudflare.com";
const DNS_SERVERS = ["223.5.5.5", "119.29.29.29", "1.1.1.1", "8.8.8.8"];

if (!TOKEN || !ACCT) {
  console.log("❌ 需要 CF_API_TOKEN 和 CF_ACCOUNT_ID");
  console.log('   $env:CF_API_TOKEN="..."; $env:CF_ACCOUNT_ID="..."; node tools/redeploy-pages.js');
  process.exit(1);
}

// 系统 DNS 不稳定 → 自选公共 DNS
function resolveHost(host) {
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (i >= DNS_SERVERS.length) return resolve(null);
      const r = new dns.Resolver();
      r.setServers([DNS_SERVERS[i++]]);
      r.resolve4(host, (e, list) => (e || !list || !list.length ? next() : resolve(list[0])));
    };
    next();
  });
}

function api(ip, method, p, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      Host: HOST, // IP 直连必须显式带 Host，否则 CF 边缘返回 403 HTML
      Authorization: "Bearer " + TOKEN,
      "User-Agent": "xiaozhu-redeploy",
    };
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(data);
    }
    const q = https.request(
      { host: ip, servername: HOST, path: p, method, headers, agent: false },
      (res) => {
        let b = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (b += d));
        res.on("end", () => {
          let j = null;
          try { j = JSON.parse(b); } catch (e) {
            // gzip 未声明时可能拿到二进制 → 直接报原始片段的字节长度
            console.log("  [warn] JSON 解析失败 (len=" + b.length + ")");
          }
          resolve({ code: res.statusCode, j, raw: b });
        });
      }
    );
    q.on("error", (e) => resolve({ code: 0, raw: "ERR " + e.message }));
    q.setTimeout(45000, () => { q.destroy(); resolve({ code: 0, raw: "TIMEOUT" }); });
    if (data) q.write(data);
    q.end();
  });
}

(async () => {
  const ip = await resolveHost(HOST);
  console.log("[DNS] " + HOST + " → " + (ip || "解析失败"));
  if (!ip) process.exit(1);

  const base = "/client/v4/accounts/" + ACCT + "/pages/projects/" + PROJECT;

  console.log("\n=== 1) 确认环境变量 ===");
  const d = await api(ip, "GET", base);
  console.log("  HTTP " + d.code);
  if (d.code !== 200 || !d.j) {
    console.log("  ❌ " + (d.raw || "").slice(0, 400));
    process.exit(1);
  }
  const cfg = (d.j.result && d.j.result.deployment_configs) || {};
  const prodEnv = (cfg.production && cfg.production.env_vars) || {};
  const keys = Object.keys(prodEnv);
  console.log("  production env: " + (keys.length ? keys.join(", ") : "(无)"));
  if (!keys.some((k) => k === "GITHUB_CLIENT_ID") || !keys.some((k) => k === "GITHUB_CLIENT_SECRET")) {
    console.log("  ⚠️ 缺 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET，先跑 set-pages-env.js");
  }

  console.log("\n=== 2) 触发重新部署 ===");
  const r = await api(ip, "POST", base + "/deployments", {});
  console.log("  HTTP " + r.code);
  if (r.code !== 200 && r.code !== 201) {
    console.log("  ❌ " + (r.raw || "").slice(0, 500));
    console.log("  （也可改用推送空提交触发：git commit --allow-empty -m redeploy）");
    process.exit(1);
  }
  const dep = (r.j && r.j.result) || {};
  console.log("  ✅ 已触发部署");
  console.log("     id:  " + (dep.id || "?"));
  console.log("     url: " + (dep.url || "?"));
  console.log("     状态: " + ((dep.latest_stage && dep.latest_stage.name) || "?"));

  console.log("\n" + "=".repeat(52));
  console.log("构建通常 1-2 分钟。之后验证：");
  console.log("  curl -sI https://你的域名/api/auth   → 期望 302");
  console.log("=".repeat(52));
})();
