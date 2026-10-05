/**
 * 本地模拟 Cloudflare Pages Functions 运行环境，用于测试 functions/api/auth.js
 *
 * 为啥要这个：本机装不了 wrangler（dash.cloudflare.com 不可达），
 * 但 Node 22 原生有 Request/Response/URL，可以自己搭个最小模拟器。
 *
 * 用法：
 *   set GH_CLIENT_ID=test_id
 *   set GH_CLIENT_SECRET=test_secret
 *   node tools/test-function.js
 */

const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");

const FN = path.join(__dirname, "..", "functions", "api", "auth.js");
const PORT = 8901;

// 模拟的 Pages 环境变量
const env = {
  GITHUB_CLIENT_ID: process.env.GH_CLIENT_ID || "",
  GITHUB_CLIENT_SECRET: process.env.GH_CLIENT_SECRET || "",
};

/** 把 Node 的 IncomingMessage 转成标准 Request */
function toRequest(req) {
  const url = "http://127.0.0.1:" + PORT + req.url;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
  }
  return new Request(url, { method: req.method, headers });
}

/** 把标准 Response 写回 Node 的 ServerResponse */
async function writeResponse(res, response) {
  res.statusCode = response.status;
  for (const [k, v] of response.headers.entries()) {
    // 避开 Node 会自己处理的头
    if (k.toLowerCase() === "content-encoding") continue;
    res.setHeader(k, v);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra });
  console.log((cond ? "  ✅ " : "  ❌ ") + name + (extra ? "  → " + extra : ""));
}

(async () => {
  const mod = await import(pathToFileURL(FN).href);
  console.log("已加载 functions/api/auth.js，导出：", Object.keys(mod).join(", "));

  if (typeof mod.onRequest !== "function") {
    console.log("❌ 未导出 onRequest 函数");
    process.exit(1);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + PORT);
    console.log("\n[请求] " + req.method + " " + req.url);

    try {
      const context = {
        request: toRequest(req),
        env,
        params: {},
        data: {},
        functionPath: "/api/auth",
        waitUntil: () => {},
        next: () => new Response("next", { status: 404 }),
      };
      const response = await mod.onRequest(context);
      await writeResponse(res, response);
    } catch (e) {
      console.log("  ⚠️ 函数抛错: " + e.message);
      res.statusCode = 500;
      res.end("Function error: " + e.message);
    }
  });

  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  console.log("模拟服务器已启动 http://127.0.0.1:" + PORT);

  /** 发一个请求，返回 {code, headers, body} */
  function hit(p) {
    return new Promise((resolve) => {
      const q = http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
        let b = "";
        r.on("data", (d) => (b += d));
        r.on("end", () => resolve({ code: r.statusCode, headers: r.headers, body: b }));
      });
      q.on("error", (e) => resolve({ code: 0, body: "ERR " + e.message }));
      q.setTimeout(25000, () => { q.destroy(); resolve({ code: 0, body: "TIMEOUT" }); });
    });
  }

  console.log("\n========== 测试 1：未配环境变量时点登录 ==========");
  {
    const r = await hit("/api/auth?provider=github");
    check("返回 500 且提示未配置", r.code === 500 && /GITHUB_CLIENT_ID/.test(r.body), "code=" + r.code);
  }

  // 补上环境变量
  env.GITHUB_CLIENT_ID = "Iv1.testclientid123";
  env.GITHUB_CLIENT_SECRET = "testsecret456";

  console.log("\n========== 测试 2：正常点登录 → 302 跳 GitHub ==========");
  {
    const r = await hit("/api/auth?provider=github&site_id=xyz");
    check("返回 302", r.code === 302, "code=" + r.code);
    const loc = r.headers.location || "";
    check("跳到 github.com/login/oauth/authorize", loc.startsWith("https://github.com/login/oauth/authorize"), "");
    check("带 client_id", loc.includes("client_id=Iv1.testclientid123"));
    check("带 redirect_uri=https://blog.heiyunas.top/api/auth", loc.includes("redirect_uri=https%3A%2F%2Fblog.heiyunas.top%2Fapi%2Fauth"));
    check("带 scope", /scope=repo/.test(decodeURIComponent(loc)));
    check("带 state", loc.includes("state=xyz"));
    check("allow_signup=false", loc.includes("allow_signup=false"));
    console.log("    完整跳转地址:\n      " + loc);
  }

  console.log("\n========== 测试 3：不支持的 provider ==========");
  {
    const r = await hit("/api/auth?provider=gitlab");
    check("返回 400", r.code === 400, "code=" + r.code);
    check("提示 unsupported_provider", /unsupported_provider/.test(r.body));
  }

  console.log("\n========== 测试 4：OPTIONS 预检 ==========");
  {
    const r = await new Promise((resolve) => {
      const q = http.request({ host: "127.0.0.1", port: PORT, path: "/api/auth", method: "OPTIONS" }, (res) => {
        let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => resolve({ code: res.statusCode, headers: res.headers, body: b }));
      });
      q.on("error", (e) => resolve({ code: 0, body: e.message }));
      q.end();
    });
    check("返回 204", r.code === 204, "code=" + r.code);
    check("含 CORS 头", !!r.headers["access-control-allow-origin"], r.headers["access-control-allow-origin"]);
  }

  console.log("\n========== 测试 5：带 code 换 token（模拟 GitHub 返回错误） ==========");
  {
    const r = await hit("/api/auth?provider=github&code=fakecode");
    // 真实 GitHub 会拒绝假 code，我们会收到 error；函数应返回 400
    check("不是 500 崩溃", r.code !== 500, "code=" + r.code);
    console.log("    返回体前 200 字: " + r.body.slice(0, 200).replace(/\n/g, " "));
  }

  console.log("\n========== 汇总 ==========");
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(pass + " 通过 / " + fail + " 失败");
  results.filter((r) => !r.ok).forEach((r) => console.log("  失败: " + r.name));

  server.close();
  process.exit(fail ? 1 : 0);
})();
