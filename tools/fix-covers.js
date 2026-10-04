/* ============================================================
   小筑 · 封面体检 & 重抓
   ------------------------------------------------------------
   功能：① 检查 posters/ 下所有图片是否为合法 JPEG（<2KB 的是错误页）
        ② 剔除错误文件，按给定豆瓣/ bangumi 直链重新下载

   用法：node tools/fix-covers.js
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
      headers: { "User-Agent": UA, Referer: "https://book.douban.com/" },
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

async function requestRetry(url, tries) {
  tries = tries || 5;
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

function isJpeg(buf) {
  return buf.length > 2000 && buf[0] === 0xff && buf[1] === 0xd8;
}

async function download(url, dest) {
  const urls = [url.replace("/m/", "/l/").replace("/view/subject/m/", "/view/subject/l/"), url];
  for (const u of urls) {
    try {
      const r = await requestRetry(u);
      if (r.status === 200 && isJpeg(r.buf)) {
        fs.writeFileSync(dest, r.buf);
        return true;
      }
    } catch (e) {
      /* try next */
    }
    await nap(600);
  }
  return false;
}

/* ---------------- 主流程 ---------------- */
(async () => {
/* ---------------- ① 体检 ---------------- */
console.log("=== 体检：检查 posters/ 下所有图片 ===");
const all = fs.readdirSync(POSTER_DIR).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
const bad = [];
for (const f of all) {
  const buf = fs.readFileSync(path.join(POSTER_DIR, f));
  const ok = isJpeg(buf);
  if (!ok) bad.push({ f, size: buf.length });
}
if (!bad.length) {
  console.log("全部合法（" + all.length + " 张）");
} else {
  bad.forEach((b) => console.log("  ✗ " + b.f + "  (" + b.size + " 字节，非有效 JPEG)"));
}

/* ---------------- ② 重抓坏图（豆瓣直链，人工核对） ---------------- */
// 豆瓣 cover_url 已核实过的映射
const REDO = [
  {
    dest: "posters/db-26877752.jpg",
    key: "恶意",
    urls: [
      "https://img9.doubanio.com/view/subject/l/public/s29635755.jpg",
      "https://img1.doubanio.com/view/subject/l/public/s29635755.jpg",
    ],
  },
  {
    dest: "posters/db-3211779.jpg",
    key: "嫌疑人 X 的献身",
    urls: [
      "https://img9.doubanio.com/view/subject/l/public/s4618046.jpg",
      "https://img1.doubanio.com/view/subject/l/public/s4618046.jpg",
    ],
  },
];

console.log("\n=== 重抓坏图 ===");
for (const r of REDO) {
  const dest = path.join(ROOT, r.dest);
  if (fs.existsSync(dest) && isJpeg(fs.readFileSync(dest))) {
    console.log("  跳过（已合法） " + r.key);
    continue;
  }
  let done = false;
  for (const u of r.urls) {
    done = await download(u, dest);
    if (done) break;
  }
  console.log((done ? "  ✓ " : "  ✗ ") + r.key + "  " + r.dest);
  await nap(800);
}

/* ---------------- ③ 清理错配残留 ---------------- */
const STALE = [
  "bgm-1608.jpg",    // 灌篮高手旧匹配
  "bgm-2750.jpg",    // 杀戮都市旧匹配
  "bgm-321885.jpg",  // 电锯人旧匹配
  "bgm-384280.jpg",  // 伊藤润二狂热集（错）
  "bgm-395378.jpg",  // 迷宫饭旧匹配（新图已换 395378 保留）
  "bgm-496276.jpg",  // 攻壳机动队（错）
  "bgm-9588.jpg",    // 金田一共用旧图
  "db-6746289.jpg",  // 新参者（加贺系列错配）
];
console.log("\n=== 清理错配残留 ===");
let removed = 0;
for (const f of STALE) {
  const p = path.join(POSTER_DIR, f);
  if (f === "bgm-395378.jpg") continue; // 迷宫饭这张其实是对的，保留
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log("  已删 " + f);
    removed++;
  } else {
    console.log("  （不存在） " + f);
  }
}
console.log("清理 " + removed + " 个文件");

/* ---------------- ④ 输出最终清单 ---------------- */
const result = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, "utf8")) : {};
console.log("\n=== 当前 cover-result.json 条目 ===");
console.log("共 " + Object.keys(result).length + " 条");
Object.keys(result).forEach((k) => console.log("  " + k + "  →  " + result[k].cover));
})();
