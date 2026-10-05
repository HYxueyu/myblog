/**
 * 用 Cloudflare API 给 Pages 项目配置环境变量（绕开打不开的控制台）
 * ------------------------------------------------------------
 * 用法（在 my-blog 目录）：
 *   set CF_API_TOKEN=你的token
 *   set GH_CLIENT_ID=xxx
 *   set GH_CLIENT_SECRET=yyy
 *   node tools/set-pages-env.js
 *
 * 需要的 API Token 权限：
 *   Account → Cloudflare Pages → Edit
 *   User    → User Details      → Read
 *
 * 如果没给项目名，脚本会先列出账号下的所有 Pages 项目让你确认。
 */

const https = require("https");

const TOKEN = process.env.CF_API_TOKEN;
const GH_ID = process.env.GH_CLIENT_ID;
const GH_SECRET = process.env.GH_CLIENT_SECRET;
let ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
let PROJECT = process.env.CF_PAGES_PROJECT || "";

if (!TOKEN) {
  console.log("❌ 缺少 CF_API_TOKEN");
  process.exit(1);
}

function api(method, apiPath, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { Authorization: "Bearer " + TOKEN, "User-Agent": "xiaozhu-setup" };
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(data);
    }
    const req = https.request({ host: "api.cloudflare.com", path: apiPath, method, headers }, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => {
        let j = null;
        try { j = JSON.parse(b); } catch (e) {}
        resolve({ code: res.statusCode, json: j, raw: b });
      });
    });
    req.on("error", (e) => resolve({ code: 0, raw: "ERR " + e.message }));
    req.setTimeout(45000, () => { req.destroy(); resolve({ code: 0, raw: "TIMEOUT" }); });
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log("=== 1) 获取账号 ===");
  if (!ACCOUNT_ID) {
    const r = await api("GET", "/client/v4/accounts?per_page=20");
    if (r.code !== 200 || !r.json || !r.json.result || !r.json.result.length) {
      console.log("❌ 获取账号失败:", r.raw.slice(0, 400));
      process.exit(1);
    }
    ACCOUNT_ID = r.json.result[0].id;
    console.log("  ✅ account_id =", ACCOUNT_ID, "(" + (r.json.result[0].name || "") + ")");
  } else {
    console.log("  ✅ 用环境变量 account_id =", ACCOUNT_ID);
  }

  console.log("\n=== 2) 列出 Pages 项目 ===");
  const pr = await api("GET", `/client/v4/accounts/${ACCOUNT_ID}/pages/projects`);
  if (pr.code !== 200 || !pr.json || !pr.json.result) {
    console.log("❌ 列项目失败:", pr.raw.slice(0, 400));
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
    const domains = (p.domains || []).join(", ");
    console.log("    [" + i + "] " + p.name + "   → " + domains);
  });

  if (!PROJECT) {
    // 自动挑一个 domains 里含 blog.heiyunas.top 的
    const match = projects.find((p) => (p.domains || []).some((d) => d.includes("heiyunas")));
    if (match) {
      PROJECT = match.name;
      console.log("\n  自动匹配到含 heiyunas 域名的项目: " + PROJECT);
    } else {
      console.log("\n⚠️ 没找到含 heiyunas 域名的项目。请用 CF_PAGES_PROJECT 环境变量指定项目名后重跑。");
      process.exit(1);
    }
  }

  console.log("\n=== 3) 读取当前环境变量 ===");
  const detail = await api("GET", `/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`);
  if (detail.code !== 200) {
    console.log("❌ 读取项目详情失败:", detail.raw.slice(0, 300));
    process.exit(1);
  }
  const cfg = (detail.json.result && detail.json.result.deployment_configs) || {};
  const prod = (cfg.production && cfg.production.env_vars) || {};
  const prev = Object.keys(prod);
  console.log("  当前 production 环境变量: " + (prev.length ? prev.join(", ") : "(无)"));

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
    `/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`,
    { deployment_configs: { production: { env_vars: nextEnv }, preview: { env_vars: nextEnv } } }
  );

  if (patch.code !== 200) {
    console.log("❌ 写入失败:", patch.raw.slice(0, 500));
    process.exit(1);
  }
  console.log("  ✅ 已写入 GITHUB_CLIENT_ID 与 GITHUB_CLIENT_SECRET");
  console.log("     项目: " + PROJECT);
  console.log("     GITHUB_CLIENT_ID = " + GH_ID.slice(0, 8) + "…");
  console.log("     GITHUB_CLIENT_SECRET = (已设置，" + GH_SECRET.length + " 字符)");

  console.log("\n" + "=".repeat(52));
  console.log("🎉 完成");
  console.log("=".repeat(52));
  console.log("注意：环境变量改动需要**重新部署**才生效。");
  console.log("在 Cloudflare 控制台重新部署，或者随便推一次代码即可。");
  console.log("=".repeat(52));
})();
