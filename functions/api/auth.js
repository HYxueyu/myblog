/**
 * 小筑 · GitHub OAuth 代理（Cloudflare Pages Functions）
 * ------------------------------------------------------------
 * 路径：/api/auth
 * 作用：给 Decap CMS 提供 GitHub 登录中转（GitHub 不允许浏览器直接 OAuth）
 *
 * 流程：
 *   GET /api/auth?provider=github              → 302 跳 GitHub 授权页
 *   GET /api/auth?provider=github&code=xxx     → 用 code 换 access_token
 *                                               → 返回 HTML，postMessage 递回 token
 *
 * 环境变量（在 Cloudflare Pages 项目的 Settings → Environment variables 里配）：
 *   GITHUB_CLIENT_ID      GitHub OAuth App 的 Client ID
 *   GITHUB_CLIENT_SECRET  GitHub OAuth App 的 Client Secret（务必加密）
 *
 * 注意：本项目 _redirects 里有一条 SPA 兜底 `/* → /index.html`，
 *       它必须排在 /api/* 放行规则之后，否则会截胡本函数（见 _redirects）。
 */

const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";

/** 允许的来源域名（写死，避免环境变量漏配导致开放重定向） */
const ALLOWED_HOSTS = ["blog.heiyunas.top", "localhost:8899", "127.0.0.1:8899"];

const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
});

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, corsHeaders(origin)),
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 判断请求来源是否可信，回填允许的 origin
  const reqOrigin = request.headers.get("Origin") || "";
  let origin = "https://blog.heiyunas.top";
  for (const h of ALLOWED_HOSTS) {
    if (reqOrigin.includes(h)) { origin = reqOrigin; break; }
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const provider = url.searchParams.get("provider") || "github";
  if (provider !== "github") {
    return json({ error: "unsupported_provider", provider }, 400, origin);
  }

  // ---- 阶段一：无 code，跳 GitHub 授权页 ----
  const code = url.searchParams.get("code");
  if (!code) {
    if (!env.GITHUB_CLIENT_ID) {
      return json(
        { error: "server_misconfigured", message: "GITHUB_CLIENT_ID 未配置（Pages 环境变量）" },
        500, origin
      );
    }
    // 回调地址必须是本函数的公开地址，且与 GitHub OAuth App 里填的一字不差
    const redirectUri = "https://blog.heiyunas.top/api/auth";

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

  // ---- 阶段二：用 code 换 access_token ----
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return json(
      { error: "server_misconfigured", message: "缺少 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET" },
      500, origin
    );
  }

  const body = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code: code,
    redirect_uri: "https://blog.heiyunas.top/api/auth",
  });

  let tokRes;
  try {
    // 加超时保护：GitHub 无响应时不要一直挂着（CF 边缘默认有 waitUntil 限制）
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15000);
    try {
      tokRes = await fetch(GITHUB_TOKEN, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "xiaozhu-cms-auth",
        },
        body: body.toString(),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const aborted = e && (e.name === "AbortError" || /abort/i.test(String(e)));
    return json(
      {
        error: "token_exchange_failed",
        message: aborted ? "连接 GitHub 超时（15 秒）" : String(e),
      },
      502, origin
    );
  }

  const text = await tokRes.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    // GitHub 有时返回 form-encoded，兜底解析
    data = Object.fromEntries(new URLSearchParams(text).entries());
  }

  if (data.error || !data.access_token) {
    return json({ error: "token_exchange_failed", detail: data }, 400, origin);
  }

  // Decap 期望的载荷：{ token, provider }
  const payload = JSON.stringify({ token: data.access_token, provider: "github" })
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");

  // 用 postMessage 把 token 递回打开后台的窗口（Decap 标准握手）
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>登录中…</title></head>
<body>
<p style="font-family:-apple-system,'PingFang SC',sans-serif;color:#666;text-align:center;margin-top:80px">
  登录成功，正在返回后台…
</p>
<script>
  (function () {
    var payload = '${payload}';
    function send(targetOrigin) {
      if (!window.opener) return;
      window.opener.postMessage('authorization:github:success:' + payload, targetOrigin);
    }
    // Decap 会先发来握手消息，收到后回递 token
    window.addEventListener('message', function (e) {
      send(e.origin || '*');
    }, false);
    // 主动触发一次握手（防止握手消息早于本页面加载）
    send('*');
    setTimeout(function () { window.close(); }, 1200);
  })();
</script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
