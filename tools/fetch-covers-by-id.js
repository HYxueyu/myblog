/* ============================================================
   小筑 · 封面补齐器（按 Bangumi ID 精确抓取）
   ------------------------------------------------------------
   用途：第一批自动搜索有几条匹配错了，这个脚本按人工核对过的
         Bangumi 条目 ID 精确抓封面，覆盖对应文件。
   用法：node tools/fetch-covers-by-id.js [--proxy 7897] [--direct]
   ============================================================ */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const POSTER_DIR = path.join(ROOT, "posters");
const OUT_JSON = path.join(__dirname, "cover-result.json");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const argOf = (k, d) => {
  const i = argv.indexOf("--" + k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const USE_PROXY = !has("--direct");
const PROXY_PORT = parseInt(argOf("proxy", "7897"), 10);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36";

function request(url, depth) {
  depth = depth || 0;
  return new Promise((resolve, reject) => {
    if (depth > 6) return reject(new Error("too many redirects"));
    const u = new URL(url);
    const opts = {
      host: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      method: "GET",
      path: u.pathname + u.search,
      headers: { "User-Agent": UA },
    };
    let lib = u.protocol === "https:" ? https : http;
    if (USE_PROXY) {
      lib = http;
      opts.host = "127.0.0.1";
      opts.port = PROXY_PORT;
      opts.path = url;
      opts.headers.Host = u.hostname;
    }
    const req = lib.request(opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return request(new URL(res.headers.location, url).href, depth + 1).then(resolve, reject);
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.setTimeout(25000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

// 带重试的请求（clash 节点有抖动，502/超时都重试）
async function requestRetry(url, tries) {
  tries = tries || 4;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await request(url);
      if (r.status === 200) return r;
      lastErr = new Error("HTTP " + r.status);
      if (r.status !== 502 && r.status !== 503 && r.status !== 429) return r;
    } catch (e) {
      lastErr = e;
    }
    await nap(900 + i * 900);
  }
  throw lastErr || new Error("request failed");
}

async function download(url, dest) {
  const t = url.replace(/^http:/, "https:");
  let r;
  try {
    r = await requestRetry(t);
    if (r.status !== 200) r = await requestRetry(url);
  } catch (e) {
    try {
      r = await requestRetry(url);
    } catch (e2) {
      return false;
    }
  }
  if (r.status !== 200 || r.buf.length < 800) return false;
  fs.writeFileSync(dest, r.buf);
  return true;
}

// ★ 人工核对过的精确映射：library.js 的 key → Bangumi 条目 ID
const FIX = [
  { key: "電鋸人（全彩版）", id: 268279, note: "链锯人" },
  { key: "人间失格", id: 39199, note: "人间失格（伊藤润二 绘）" },
  { key: "伊藤润二爱藏版", id: 316522, note: "伊藤润二杰作集" },
  { key: "伊藤润二恐怖漫画精选", id: 4317, note: "伊藤润二恐怖漫画精选" },
  { key: "杀戮都市", id: 35906, note: "GANTZ" },
  { key: "灌篮高手（完全版）", id: 18462, note: "SLAM DUNK 完全版" },
  { key: "端脑", id: 112978, note: "端脑" },
  { key: "金田一少年事件簿 第一部 File 系列（爱藏版）", id: 506306, note: "极厚爱藏版 金田一少年之事件簿" },
  { key: "金田一少年事件簿 第二部 新系列", id: 48108, note: "金田一少年事件簿 新系列" },
  { key: "金田一少年事件簿 第二部 20 周年系列", id: 17200, note: "金田一少年事件簿（原作系列）" },
  { key: "金田一少年事件簿 R（第二部 R 系列）", id: 96861, note: "金田一少年事件簿R" },
  { key: "金田一少年之事件簿 30th", id: 365622, note: "金田一少年之事件簿 30周年纪念系列" },
];

(async () => {
  fs.mkdirSync(POSTER_DIR, { recursive: true });
  let result = {};
  if (fs.existsSync(OUT_JSON)) {
    try {
      result = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
    } catch (e) {}
  }

  let ok = 0,
    fail = 0;
  for (let i = 0; i < FIX.length; i++) {
    const t = FIX[i];
    const tag = "[" + (i + 1) + "/" + FIX.length + "] " + t.key;
    try {
      const api =
        "https://api.bgm.tv/subject/" + t.id + "?responseGroup=large";
      const { status, buf } = await requestRetry(api);
      if (status !== 200) {
        console.log(tag + "  → 取条目信息失败 HTTP " + status);
        fail++;
        await nap(400);
        continue;
      }
      const j = JSON.parse(buf.toString("utf8"));
      const url = j.images && (j.images.large || j.images.common);
      if (!url) {
        console.log(tag + "  → 条目无封面");
        fail++;
        await nap(400);
        continue;
      }
      const dest = path.join(POSTER_DIR, "bgm-" + t.id + ".jpg");
      const rel = "posters/bgm-" + t.id + ".jpg";
      const done = fs.existsSync(dest) && fs.statSync(dest).size > 800 ? true : await download(url, dest);
      if (!done) {
        console.log(tag + "  → 图片下载失败");
        fail++;
        await nap(400);
        continue;
      }
      result[t.key] = {
        cover: rel,
        match: j.name_cn || j.name,
        score: 1,
        source: "bangumi",
        id: t.id,
        note: t.note,
      };
      ok++;
      console.log(tag + "  → " + (j.name_cn || j.name) + "  (" + t.note + ")  " + rel);
    } catch (e) {
      console.log(tag + "  → 出错：" + e.message);
      fail++;
    }
    await nap(500);
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), "utf8");
  console.log("\n补齐完成：成功 " + ok + " / 失败 " + fail);
})();
