/**
 * 用 Cloudflare API 给 Pages 项目配置环境变量（绕开打不开的控制台）
 * ------------------------------------------------------------
 * 用法（在 my-blog 目录，PowerShell）：
 *   $env:CF_API_TOKEN="你的token"
 *   $env:GH_CLIENT_ID="GitHub OAuth App 的 Client ID"
 *   $env:GH_CLIENT_SECRET="GitHub OAuth App 的 Client Secret"
 *   node tools/set-pages-env.js
 *
 * 可选：
 *   $env:CF_ACCOUNT_ID="..."      # 自动定位失败时手动指定
 *   $env:CF_PAGES_PROJECT="xiaozhu"  # 默认自动匹配含 heiyunas 域名的项目
 *
 * 需要的 API Token 权限：
 *   Account → Cloudflare Pages → Edit
 *   User    → User Details      → Read
 *   （并确保「账户资源」里真的选中了账号，否则 /accounts 会返回空）
 *
 * 网络注意：
 *   本机存在指向死代理的 HTTP_PROXY（端口开着但上游不通），
 *   Node https 会自动读取导致全部 TIMEOUT → 这里显式清掉。
 *   系统 DNS 也不稳定 → 自建 Resolver + IP 直连 + 显式 Host 头。
 */

const https = require("https");
const dns = require("dns");
const fs = require("fs");
const path = require("path");

/* ---------- 网络层修复 ---------- */

// 1) 清掉死代理
["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"].forEach((k) => delete process.env[k]);

// 2) 自选 DNS：系统解析器时好时坏，用公共 DNS 兜底
const DNS_SERVERS = ["223.5.5.5", "119.29.29.29", "1.1.1.1", "8.8.8.8"];
const HOST = "api.cloudflare.com";
const ipCache = {};

function resolveHost(host) {
  if (ipCache[host]) return Promise.resolve(ipCache[host]);
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (i >= DNS_SERVERS.length) return resolve(null);
      const r = new dns.Resolver();
      r.setServers([DNS_SERVERS[i++]]);
      r.resolve4(host, (e, list) => {
        if (e || !list || !list.length) return next();
        ipCache[host] = list[0];
        resolve(list[0]);
      });
    };
    next();
  });
}

/* ---------- 配置 ---------- */

const TOKEN = process.env.CF_API_TOKEN;
const GH_ID = process.env.GH_CLIENT_ID;
const GH_SECRET = process.env.GH_CLIENT_SECRET;
let ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
let PROJECT = process.env.CF_PAGES_PROJECT || "";

// PowerShell 工具不回收 stdout：同时落盘一份日志
const LOGF = path.join(__dirname, "set-pages-env.log");
try { fs.writeFileSync(LOGF, ""); } catch (e) {}
const _log = console.log;
console.log = (...a) => {
  const s = a.map((x) => (typeof x === "string" ? x : String(x))).join(" ");
  _log(s);
  try { fs.appendFileSync(LOGF, s + "\n"); } catch (e) {}
};

if (!TOKEN) {
  console.log("❌ 缺少 CF_API_TOKEN");
  console.log("   用法（PowerShell）：");
  console.log('   $env:CF_API_TOKEN="..."; $env:GH_CLIENT_ID="..."; $env:GH_CLIENT_SECRET="..."; node tools/set-pages-env.js');
  process.exit(1);
}

/* ---------- API 客户端 ---------- */

function api(method, apiPath, body) {
  return new Promise(async (resolve) => {
    const ip = await resolveHost(HOST);
    if (!ip) return resolve({ code: 0, raw: "DNS 解析失败" });

    const data = body ? JSON.stringify(body) : null;
    const headers = {
      Host: HOST, // IP 直连时必须显式带 Host，否则 CF 边缘返回 403 HTML
      Authorization: "Bearer " + TOKEN,
      "User-Agent": "xiaozhu-setup",
    };
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(data);
    }

    const req = https.request(
      {
        host: ip,
        servername: HOST, // SNI
        path: apiPath,
        method,
        headers,
        agent: false, // 不走任何全局 agent（含代理）
      },
      (res) => {
        let b = "";
        res.on("data", (d) => (b += d));
        res.on("end", () => {
          let j = null;
          try { j = JSON.parse(b); } catch (e) {}
          resolve({ code: res.statusCode, json: j, raw: b });
        });
      }
    );
    req.on("error", (e) => resolve({ code: 0, raw: "ERR " + e.message }));
    req.setTimeout(45000, () => { req.destroy(); resolve({ code: 0, raw: "TIMEOUT" }); });
    if (data) req.write(data);
    req.end();
  });
}

/* ---------- 主流程 ---------- */

(async () => {
  console.log("=== 1) 定位账号 account_id ===");

  if (ACCOUNT_ID) {
    console.log("  ✅ 用环境变量 CF_ACCOUNT_ID = " + ACCOUNT_ID);
  } else {
    // 路线 A：/accounts 列表
    const r = await api("GET", "/client/v4/accounts?per_page=20");
    const list = (r.json && r.json.result) || [];
    if (r.code === 200 && list.length) {
      ACCOUNT_ID = list[0].id;
      console.log("  ✅ 从 /accounts 取到 = " + ACCOUNT_ID + " (" + (list[0].name || "") + ")");
    } else {
      // 路线 B：借 zones 反查（域名托管在 CF，zone.account.id 即所需）
      console.log("  ⚠️ /accounts 返回空（HTTP " + r.code + "），改用 /zones 反查…");
      const z = await api("GET", "/client/v4/zones?per_page=50");
      const zs = (z.json && z.json.result) || [];
      const ids = {};
      zs.forEach((x) => { if (x.account && x.account.id) ids[x.account.id] = x.account.name || ""; });
      const found = Object.keys(ids);
      if (found.length) {
        ACCOUNT_ID = found[0];
        console.log("  ✅ 从 /zones 反查到 = " + ACCOUNT_ID + " (" + ids[found[0]] + ")");
      } else {
        console.log("  ❌ 两条路都没拿到 account_id（/zones HTTP " + z.code + "，zone 数 " + zs.length + "）");
        console.log("");
        console.log("  这通常意味着 API Token 的「账户资源」没有真正选中账号。");
        console.log("  请二选一：");
        console.log("    (a) 重新创建 Token，创建时在「账户资源」里明确勾选账号；");
        console.log("    (b) 从 Cloudflare 控制台右侧栏复制 Account ID，用 CF_ACCOUNT_ID 传入：");
        console.log('        $env:CF_ACCOUNT_ID="粘贴32位ID"; node tools/set-pages-env.js');
        process.exit(1);
      }
    }
  }

  console.log("\n=== 2) 列出 Pages 项目 ===");
  const pr = await api("GET", "/client/v4/accounts/" + ACCOUNT_ID + "/pages/projects");
  if (pr.code !== 200 || !pr.json || !pr.json.result) {
    console.log("❌ 列项目失败:", (pr.raw || "").slice(0, 400));
    console.log("   提示：token 需要 Account → Cloudflare Pages → Edit 权限");
    process.exit(1);
  }
  const projects = pr.json.result;
  if (!projects.length) {
    console.log("❌ 账号下没有 Pages 项目");
    process.exit(1);
  }
  console.log("  找到 " + projects.length + " 个项目：");
  projects.forEach((p, i) => {
    console.log("    [" + i + "] " + p.name + "   → " + ((p.domains || []).join(", ") || "(无自定义域名)"));
  });

  if (!PROJECT) {
    const match = projects.find((p) => (p.domains || []).some((d) => d.includes("heiyunas")));
    if (match) {
      PROJECT = match.name;
      console.log("\n  ✅ 自动匹配到含 heiyunas 域名的项目: " + PROJECT);
    } else {
      console.log("\n⚠️ 没找到含 heiyunas 域名的项目。请用 CF_PAGES_PROJECT 指定项目名后重跑。");
      process.exit(1);
    }
  }

  console.log("\n=== 3) 读取当前环境变量 ===");
  const detail = await api("GET", "/client/v4/accounts/" + ACCOUNT_ID + "/pages/projects/" + PROJECT);
  if (detail.code !== 200) {
    console.log("❌ 读取项目详情失败:", (detail.raw || "").slice(0, 300));
    process.exit(1);
  }
  const cfg = (detail.json.result && detail.json.result.deployment_configs) || {};
  const prod = (cfg.production && cfg.production.env_vars) || {};
  const keys = Object.keys(prod);
  console.log("  项目: " + PROJECT);
  console.log("  当前 production 环境变量: " + (keys.length ? keys.join(", ") : "(无)"));

  if (!GH_ID || !GH_SECRET) {
    console.log("\n⚠️ 未提供 GH_CLIENT_ID / GH_CLIENT_SECRET，仅完成探测，不写入。");
    console.log("   要写入请带上这两个环境变量重跑。");
    process.exit(0);
  }

  console.log("\n=== 4) 写入环境变量 ===");
  const nextEnv = Object.assign({}, prod, {
    GITHUB_CLIENT_ID: { value: GH_ID },
    GITHUB_CLIENT_SECRET: { value: GH_SECRET },
  });

  const patch = await api(
    "PATCH",
    "/client/v4/accounts/" + ACCOUNT_ID + "/pages/projects/" + PROJECT,
    { deployment_configs: { production: { env_vars: nextEnv }, preview: { env_vars: nextEnv } } }
  );

  if (patch.code !== 200) {
    console.log("❌ 写入失败:", (patch.raw || "").slice(0, 500));
    process.exit(1);
  }
  console.log("  ✅ 已写入 GITHUB_CLIENT_ID 与 GITHUB_CLIENT_SECRET");
  console.log("     项目: " + PROJECT);
  console.log("     GITHUB_CLIENT_ID = " + GH_ID.slice(0, 8) + "…");
  console.log("     GITHUB_CLIENT_SECRET = (已设置，" + GH_SECRET.length + " 字符)");

  console.log("\n" + "=".repeat(52));
  console.log("🎉 完成");
  console.log("=".repeat(52));
  console.log("注意：环境变量改动需要【重新部署】才生效。");
  console.log("在 Cloudflare 控制台点 Retry deployment，或者随便推一次代码即可。");
  console.log("=".repeat(52));
})();
