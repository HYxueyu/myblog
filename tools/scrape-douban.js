/* ============================================================
   小筑 · 封面抓取器（书 / 漫画）
   ------------------------------------------------------------
   数据源：
     · 漫画 → Bangumi (api.bgm.tv)  —— 免费公开 API，不限流
     · 书   → 豆瓣              —— 有频率限制，失败会重试
   用法：
     node tools/scrape-douban.js              # 抓全部
     node tools/scrape-douban.js --limit 3    # 只抓前 3 条（试跑）
     node tools/scrape-douban.js --only 漫画  # 只抓漫画
     node tools/scrape-douban.js --proxy 7897 # 指定代理端口（默认 7897）
     node tools/scrape-douban.js --direct     # 不走代理

   产物：
     1. 封面图 → posters/bgm-<id>.jpg（漫画）/ posters/db-<id>.jpg（书）
     2. 结果清单 → tools/cover-result.json
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
const LIMIT = parseInt(argOf("limit", "0"), 10);
const ONLY = argOf("only", "");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0 Safari/537.36";

/* ---------------- 网络层 ---------------- */
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
      opts.path = url; // 走代理要传完整地址
      opts.headers.Host = u.hostname;
    }
    const req = lib.request(opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return request(new URL(res.headers.location, url).href, depth + 1).then(
          resolve,
          reject
        );
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () =>
        resolve({ status: res.statusCode, buf: Buffer.concat(chunks) })
      );
    });
    req.on("error", reject);
    req.setTimeout(25000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

const nap = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 相似度打分 ---------------- */
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[（(【\[].*?[）)】\]]/g, "")
    .replace(/[\s·:：,，.。!！?？'"“”‘’\-—–_/\\|]/g, "")
    .replace(/第[一二三四五六七八九十\d]+部/g, "");
}
function score(query, cand) {
  const q = norm(query);
  const c = norm(cand);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) {
    const ratio = Math.min(q.length, c.length) / Math.max(q.length, c.length);
    return 0.6 + 0.35 * ratio;
  }
  let hit = 0;
  const set = new Set(q.split(""));
  for (const ch of c) if (set.has(ch)) hit++;
  return (hit / Math.max(q.length, c.length)) * 0.55;
}

/* ---------------- 图片下载 ---------------- */
async function download(url, dest) {
  const t = url.replace(/^http:/, "https:");
  let r;
  try {
    r = await request(t);
    if (r.status !== 200) r = await request(url);
  } catch (e) {
    r = await request(url);
  }
  if (r.status !== 200 || r.buf.length < 800) return false;
  fs.writeFileSync(dest, r.buf);
  return true;
}

/* ---------------- 数据源 A：Bangumi（漫画） ---------------- */
async function searchBangumi(keyword) {
  const url =
    "https://api.bgm.tv/search/subject/" +
    encodeURIComponent(keyword) +
    "?type=2&responseGroup=large&max_results=5";
  const { status, buf } = await request(url);
  if (status !== 200) return [];
  let j;
  try {
    j = JSON.parse(buf.toString("utf8"));
  } catch (e) {
    return [];
  }
  if (!j || !Array.isArray(j.list)) return [];
  return j.list.map((it) => ({
    id: it.id,
    title: it.name_cn || it.name,
    alt: it.name,
    cover: it.images && it.images.large,
    source: "bangumi",
  }));
}

/* ---------------- 数据源 B：豆瓣（书） ---------------- */
async function searchDouban(keyword) {
  const url =
    "https://search.douban.com/book/subject_search?search_text=" +
    encodeURIComponent(keyword) +
    "&cat=1001";
  const { status, buf } = await request(url);
  if (status !== 200) return { list: [], blocked: false };
  const html = buf.toString("utf8");
  const m = html.match(/window\.__DATA__\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return { list: [], blocked: false };
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch (e) {
    return { list: [], blocked: false };
  }
  if (data.error_info && String(data.error_info).includes("频繁")) {
    return { list: [], blocked: true };
  }
  const list = (data.items || []).map((it) => ({
    id: it.id,
    title: String(it.title || "").replace(/<[^>]+>/g, ""),
    cover: it.cover_url,
    source: "douban",
  }));
  return { list, blocked: false };
}

/* ---------------- 待抓清单 ---------------- */
const TARGETS = [
  // ---- 漫画（Bangumi）----
  { key: "葬送的芙莉莲", q: "葬送的芙莉莲", kind: "bgm" },
  { key: "電鋸人（全彩版）", q: "电锯人", kind: "bgm" },
  { key: "坂本日常", q: "坂本日常", kind: "bgm" },
  { key: "灌篮高手（完全版）", q: "灌篮高手", kind: "bgm" },
  { key: "迷宫饭", q: "迷宫饭", kind: "bgm" },
  { key: "杀戮都市", q: "杀戮都市", kind: "bgm" },
  { key: "人间失格", q: "人间失格 伊藤润二", kind: "bgm" },
  { key: "伊藤润二爱藏版", q: "伊藤润二", kind: "bgm" },
  { key: "伊藤润二恐怖漫画精选", q: "伊藤润二 恐怖", kind: "bgm" },
  { key: "端脑", q: "端脑 壁水羽", kind: "bgm" },
  { key: "金田一少年事件簿 第一部 File 系列（爱藏版）", q: "金田一少年事件簿", kind: "bgm" },
  { key: "金田一少年事件簿 第二部 新系列", q: "金田一少年事件簿", kind: "bgm" },
  { key: "金田一少年事件簿 第二部 20 周年系列", q: "金田一少年事件簿", kind: "bgm" },
  { key: "金田一少年事件簿 R（第二部 R 系列）", q: "金田一少年事件簿 R", kind: "bgm" },
  { key: "金田一少年之事件簿 30th", q: "金田一少年事件簿", kind: "bgm" },
  // ---- 书（豆瓣）----
  { key: "谁杀了她", q: "谁杀了她 东野圭吾", kind: "db" },
  { key: "东野圭吾「加贺恭一郎」系列", q: "加贺恭一郎 东野圭吾", kind: "db" },
  { key: "人间椅子", q: "人间椅子 江户川乱步", kind: "db" },
  { key: "克苏鲁神话 I：克苏鲁的呼唤", q: "克苏鲁神话 洛夫克拉夫特", kind: "db" },
  { key: "怪画谜案", q: "怪画谜案 雨穴", kind: "db" },
  { key: "罗生门（读客三个圈经典文库）", q: "罗生门 芥川龙之介", kind: "db" },
  { key: "嫌疑人 X 的献身", q: "嫌疑人X的献身 东野圭吾", kind: "db" },
  { key: "恶意", q: "恶意 东野圭吾", kind: "db" },
  { key: "从前我死去的家", q: "从前我死去的家 东野圭吾", kind: "db" },
];

/* ---------------- 主流程 ---------------- */
(async () => {
  fs.mkdirSync(POSTER_DIR, { recursive: true });
  let list = TARGETS;
  if (ONLY) list = list.filter((t) => t.key.includes(ONLY) || t.kind === (ONLY === "漫画" ? "bgm" : "db"));
  if (LIMIT > 0) list = list.slice(0, LIMIT);

  let result = {};
  if (fs.existsSync(OUT_JSON)) {
    try {
      result = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
    } catch (e) {}
  }

  let ok = 0,
    fail = 0,
    blocked = 0;

  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const tag = "[" + (i + 1) + "/" + list.length + "] " + t.key;
    try {
      let cands = [];
      if (t.kind === "bgm") {
        cands = await searchBangumi(t.q);
      } else {
        const r = await searchDouban(t.q);
        if (r.blocked) {
          console.log(tag + "  → 豆瓣限流，稍后重跑 --only 书");
          blocked++;
          await nap(4000);
          continue;
        }
        // 豆瓣列表里没有封面直链，得进详情页
        cands = r.list;
      }

      if (!cands.length) {
        console.log(tag + "  → 无结果");
        fail++;
        await nap(t.kind === "bgm" ? 400 : 2500);
        continue;
      }

      const ranked = cands
        .map((c) => ({ ...c, s: score(t.q, c.title) }))
        .sort((a, b) => b.s - a.s);
      const best = ranked[0];
      const prefix = best.source === "bangumi" ? "bgm-" : "db-";
      const dest = path.join(POSTER_DIR, prefix + best.id + ".jpg");
      const rel = "posters/" + prefix + best.id + ".jpg";

      let coverUrl = best.cover;
      // 豆瓣：进详情页拿 nbg 大图
      if (best.source === "douban" && !coverUrl) {
        const { status, buf } = await request(
          "https://book.douban.com/subject/" + best.id + "/"
        );
        if (status === 200) {
          const h = buf.toString("utf8");
          const mm =
            h.match(/<a class="nbg"[^>]*href="([^"]+)"/) ||
            h.match(/(https:\/\/img\d*\.doubanio\.com\/view\/subject\/[sml]\/public\/s\d+\.jpg)/);
          if (mm) coverUrl = mm[1].replace("/s/public/s", "/l/public/s").replace(/\/view\/subject\/s\//, "/view/subject/l/");
        }
        await nap(1500);
      }

      if (!coverUrl) {
        console.log(tag + "  → 最佳匹配「" + best.title + "」但拿不到封面");
        fail++;
        await nap(1500);
        continue;
      }

      const done = fs.existsSync(dest) ? true : await download(coverUrl, dest);
      if (!done) {
        console.log(tag + "  → 图片下载失败");
        fail++;
        await nap(800);
        continue;
      }
      result[t.key] = {
        cover: rel,
        match: best.title,
        score: Number(best.s.toFixed(2)),
        source: best.source,
      };
      ok++;
      console.log(tag + "  → " + best.title + "  (" + best.s.toFixed(2) + ")  " + rel);
    } catch (e) {
      console.log(tag + "  → 出错：" + e.message);
      fail++;
    }
    await nap(t.kind === "bgm" ? 500 : 2500);
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), "utf8");
  console.log("\n抓取完成：成功 " + ok + " / 失败 " + fail + " / 限流跳过 " + blocked);
  console.log("清单已写入 tools/cover-result.json");
})();
