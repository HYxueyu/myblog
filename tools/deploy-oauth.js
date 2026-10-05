/**
 * 一键部署 OAuth Worker 到 Cloudflare（走 REST API，无需 wrangler）
 * ------------------------------------------------------------
 * 用法（在 my-blog 目录）：
 *   set CF_API_TOKEN=你的token
 *   set GH_CLIENT_ID=xxx
 *   set GH_CLIENT_SECRET=yyy
 *   node tools/deploy-oauth.js
 *
 * 需要的 API Token 权限：
 *   Account → Workers Scripts → Edit
 *   Account → Workers KV Storage → Edit（可选）
 *   User → User Details → Read（用于自动取 account_id）
 *
 * 脚本会：
 *   1. 自动获取 account_id
 *   2. 上传 Worker（含环境变量）
 *   3. 输出可访问的 workers.dev 地址
 *   4. 给出"挂到 blog.heiyunas.top/api/auth"的操作提示
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.CF_API_TOKEN;
const GH_ID = process.env.GH_CLIENT_ID;
const GH_SECRET = process.env.GH_CLIENT_SECRET;
let ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const WORKER_NAME = process.env.WORKER_NAME || "xiaozhu-oauth";

if (!TOKEN || !GH_ID || !GH_SECRET) {
  console.log("❌ 缺少环境变量。请设置：CF_API_TOKEN / GH_CLIENT_ID / GH_CLIENT_SECRET");
  process.exit(1);
}

function api(method, apiPath, body, isRaw) {
  return new Promise((resolve) => {
    const data = isRaw ? body : body ? JSON.stringify(body) : null;
    const headers = {
      Authorization: "Bearer " + TOKEN,
      "User-Agent": "xiaozhu-deploy",
    };
    if (data) {
      headers["Content-Type"] = isRaw ? "application/javascript" : "application/json";
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
    req.setTimeout(60000, () => { req.destroy(); resolve({ code: 0, raw: "TIMEOUT" }); });
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log("=== 1) 获取 account_id ===");
  if (!ACCOUNT_ID) {
    const r = await api("GET", "/client/v4/accounts?per_page=20");
    if (r.code !== 200 || !r.json || !r.json.result || !r.json.result.length) {
      console.log("❌ 无法获取账号列表:", r.raw.slice(0, 400));
      process.exit(1);
    }
    ACCOUNT_ID = r.json.result[0].id;
    console.log("  ✅ account_id =", ACCOUNT_ID, "(" + (r.json.result[0].name || "") + ")");
  } else {
    console.log("  ✅ 用环境变量 account_id =", ACCOUNT_ID);
  }

  console.log("\n=== 2) 读取 Worker 源码 ===");
  const src = path.join(__dirname, "..", "oauth-worker", "index.js");
  if (!fs.existsSync(src)) {
    console.log("❌ 找不到", src);
    process.exit(1);
  }
  const code = fs.readFileSync(src, "utf8");
  console.log("  ✅ 已读取", code.length, "字节");

  console.log("\n=== 3) 上传 Worker ===");
  const metadata = {
    main_module: "index.js",
    compatibility_date: "2024-11-01",
    bindings: [
      { type: "plain_text", name: "ALLOWED_DOMAINS", text: "blog.heiyunas.top,localhost:8899,127.0.0.1:8899" },
      { type: "secret_text", name: "GITHUB_CLIENT_ID", text: GH_ID },
      { type: "secret_text", name: "GITHUB_CLIENT_SECRET", text: GH_SECRET },
    ],
  };

  // 用 multipart/form-data 上传（CF Workers Script Upload API）
  const boundary = "----xiaozhu" + Date.now();
  const parts = [];
  parts.push(Buffer.from(
    "--" + boundary + "\r\n" +
    'Content-Disposition: form-data; name="metadata"\r\n' +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(metadata) + "\r\n"
  ));
  parts.push(Buffer.from(
    "--" + boundary + "\r\n" +
    'Content-Disposition: form-data; name="index.js"; filename="index.js"\r\n' +
    "Content-Type: application/javascript+module\r\n\r\n"
  ));
  parts.push(Buffer.from(code));
  parts.push(Buffer.from("\r\n--" + boundary + "--\r\n"));
  const payload = Buffer.concat(parts);

  const up = await new Promise((resolve) => {
    const req = https.request(
      {
        host: "api.cloudflare.com",
        path: `/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`,
        method: "PUT",
        headers: {
          Authorization: "Bearer " + TOKEN,
          "Content-Type": "multipart/form-data; boundary=" + boundary,
          "Content-Length": payload.length,
          "User-Agent": "xiaozhu-deploy",
        },
      },
      (res) => {
        let b = "";
        res.on("data", (d) => (b += d));
        res.on("end", () => resolve({ code: res.statusCode, raw: b }));
      }
    );
    req.on("error", (e) => resolve({ code: 0, raw: "ERR " + e.message }));
    req.setTimeout(90000, () => { req.destroy(); resolve({ code: 0, raw: "TIMEOUT" }); });
    req.write(payload);
    req.end();
  });

  console.log("  HTTP", up.code);
  if (up.code !== 200) {
    console.log("❌ 上传失败:", up.raw.slice(0, 600));
    process.exit(1);
  }
  console.log("  ✅ Worker 已部署");

  console.log("\n=== 4) 开启 workers.dev 子域访问 ===");
  const sub = await api("POST", `/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/subdomain`, { enabled: true, previews_enabled: false });
  console.log("  HTTP", sub.code, sub.code === 200 ? "✅ 已开启" : "（" + String(sub.raw).slice(0, 200) + "）");

  console.log("\n=== 5) 查询访问地址 ===");
  const info = await api("GET", `/client/v4/accounts/${ACCOUNT_ID}/workers/subdomain`);
  const subdomain = info.json && info.json.result && info.json.result.subdomain;
  const workerUrl = subdomain ? `https://${WORKER_NAME}.${subdomain}.workers.dev` : "(未知，去控制台看)";

  console.log("\n" + "=".repeat(56));
  console.log("🎉 部署完成");
  console.log("=".repeat(56));
  console.log("Worker 名称 :", WORKER_NAME);
  console.log("访问地址    :", workerUrl);
  console.log("");
  console.log("接下来（重要）——把 Worker 挂到 blog.heiyunas.top/api/auth：");
  console.log("");
  console.log("  方式 A（推荐，纯命令行）：");
  console.log("    在 Cloudflare 控制台 → 你的域名 heiyunas.top → Workers Routes");
  console.log("    Add route:");
  console.log("      Route      : blog.heiyunas.top/api/auth*");
  console.log("      Worker     : " + WORKER_NAME);
  console.log("");
  console.log("  方式 B：如果 blog.heiyunas.top 是 Cloudflare Pages 项目，");
  console.log("    告诉我，我改成 Pages Functions 版，随网站一起部署。");
  console.log("");
  console.log("  最后去 GitHub OAuth App 确认回调地址填的是：");
  console.log("    https://blog.heiyunas.top/api/auth");
  console.log("=".repeat(56));
})();
