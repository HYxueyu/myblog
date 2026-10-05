/**
 * 小筑 · GitHub OAuth 代理（Cloudflare Worker）
 * ------------------------------------------------------------
 * 用途：给 Decap CMS 提供 GitHub 登录中转。
 *   浏览器 → /api/auth?provider=github → 本 Worker → GitHub → 回跳带 token
 *
 * 环境变量（在 Cloudflare Worker 的 Variables and Secrets 里配）：
 *   GITHUB_CLIENT_ID      GitHub OAuth App 的 Client ID
 *   GITHUB_CLIENT_SECRET  GitHub OAuth App 的 Client Secret（填成 Secret 类型）
 *   ALLOWED_DOMAINS       允许的来源域名，逗号分隔，如 blog.heiyunas.top,localhost:8899
 *
 * 无第三方依赖，单文件。
 */

const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";

const cors = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
});

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors(origin)),
  });
}

/** 从 ALLOWED_DOMAINS 判断来源是否合法，返回允许的 origin */
function resolveOrigin(request, env) {
  const reqOrigin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_DOMAINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!allowed.length) return reqOrigin || "*";

  for (const d of allowed) {
    // 支持 "blog.heiyunas.top" 与 "http://localhost:8899" 两种写法
    const host = d.replace(/^https?:\/\//, "");
    if (reqOrigin.includes(host)) return reqOrigin;
  }
  return allowed[0].startsWith("http") ? allowed[0] : "https://" + allowed[0];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = resolveOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const provider = url.searchParams.get("provider") || "github";
    if (provider !== "github") {
      return json({ error: "unsupported_provider", provider }, 400, origin);
    }

    // ---- 阶段一：没有 code，跳去 GitHub 授权页 ----
    const code = url.searchParams.get("code");
    if (!code) {
      if (!env.GITHUB_CLIENT_ID) {
        return json({ error: "server_misconfigured", message: "GITHUB_CLIENT_ID 未配置" }, 500, origin);
      }
      // 回调地址固定为本 Worker 自身（GitHub OAuth App 里要填成一模一样）
      const redirectUri = url.origin + url.pathname;

      // 把前端传来的 site_id / scope 等透传给 GitHub 的 state
      const state = url.searchParams.get("site_id") || "";
      const scope = url.searchParams.get("scope") || "repo,user";

      const auth = new URL(GITHUB_AUTHORIZE);
      auth.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      auth.searchParams.set("redirect_uri", redirectUri);
      auth.searchParams.set("scope", scope);
      if (state) auth.searchParams.set("state", state);
      auth.searchParams.set("allow_signup", "false");

      return Response.redirect(auth.toString(), 302);
    }

    // ---- 阶段二：拿 code 换 access_token ----
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return json({ error: "server_misconfigured", message: "缺少 CLIENT_ID / CLIENT_SECRET" }, 500, origin);
    }

    const body = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: code,
      redirect_uri: url.origin + url.pathname,
    });

    let tokRes;
    try {
      tokRes = await fetch(GITHUB_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: body.toString(),
      });
    } catch (e) {
      return json({ error: "token_exchange_failed", message: String(e) }, 502, origin);
    }

    const text = await tokRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // GitHub 默认可能返回 form-encoded，兜底解析
      const p = new URLSearchParams(text);
      data = Object.fromEntries(p.entries());
    }

    if (data.error || !data.access_token) {
      return json({ error: "token_exchange_failed", detail: data }, 400, origin);
    }

    // Decap 期望收到 { token, provider }
    const payload = JSON.stringify({
      token: data.access_token,
      provider: "github",
    });

    // 用 postMessage 把 token 递回打开后台的窗口（Decap 的标准握手方式）
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>登录中…</title></head>
<body>
<script>
  (function () {
    var message = 'authorization:github:success:${payload.replace(/'/g, "\\'")}';
    function receive(e) {
      // 首次握手：对方发来 "authorizing:github"，我们回递 token
      window.opener && window.opener.postMessage(message, e.origin);
    }
    window.addEventListener('message', receive, false);
    // 主动触发一次握手
    window.opener && window.opener.postMessage('authorizing:github', '*');
  })();
</script>
<p style="font-family:sans-serif;color:#666">登录成功，正在返回后台…</p>
</body></html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};
