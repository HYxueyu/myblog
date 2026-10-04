/* ============================================================
   小筑 · 补全游戏封面
   ------------------------------------------------------------
   策略（按优先级）：
     ① Steam 官方 storesearch 反查 appid → 拿竖版 600x900 封面
        （直连可用，不用代理）
     ② PS 独占游戏：用 PlayStation Store 搜索页的封面图
     ③ 兜底：Bangumi 游戏条目（type=4）

   用法：
     node tools/fetch-game-covers.js              # 全部补
     node tools/fetch-game-covers.js --limit 3    # 试跑
     node tools/fetch-game-covers.js --only steam # 只跑 Steam 源
   ============================================================ */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const POSTER_DIR = path.join(ROOT, "posters");
const OUT_JSON = path.join(__dirname, "game-covers.json");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const argOf = (k, d) => {
  const i = argv.indexOf("--" + k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const LIMIT = parseInt(argOf("limit", "0"), 10);
const ONLY = argOf("only", "");
const PROXY_PORT = 7897;
const USE_PROXY = !has("--direct");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0 Safari/537.36";

function request(url, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const useProxy = opts.proxy !== undefined ? opts.proxy : USE_PROXY;
    const o = {
      host: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      method: "GET",
      path: u.pathname + u.search,
      headers: Object.assign(
        { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
        opts.headers || {}
      ),
    };
    let lib = u.protocol === "https:" ? https : http;
    if (useProxy) {
      lib = http;
      o.host = "127.0.0.1";
      o.port = PROXY_PORT;
      o.path = url;
      o.headers.Host = u.hostname;
    }
    const req = lib.request(o, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return request(new URL(res.headers.location, url).href, opts).then(resolve, reject);
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

async function requestRetry(url, opts, tries) {
  tries = tries || 4;
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await request(url, opts);
      if (r.status === 200) return r;
      last = new Error("HTTP " + r.status);
      if (r.status !== 502 && r.status !== 503 && r.status !== 429) return r;
    } catch (e) {
      last = e;
    }
    await nap(800 + i * 800);
  }
  throw last || new Error("failed");
}

function isJpeg(buf) {
  return buf.length > 2000 && buf[0] === 0xff && buf[1] === 0xd8;
}
function isPng(buf) {
  return buf.length > 2000 && buf[0] === 0x89 && buf[1] === 0x50;
}

async function download(url, dest) {
  try {
    const r = await requestRetry(url, { proxy: false });
    if (r.status === 200 && (isJpeg(r.buf) || isPng(r.buf))) {
      fs.writeFileSync(dest, r.buf);
      return true;
    }
  } catch (e) {}
  // 直连失败再走代理
  try {
    const r = await requestRetry(url, { proxy: true });
    if (r.status === 200 && (isJpeg(r.buf) || isPng(r.buf))) {
      fs.writeFileSync(dest, r.buf);
      return true;
    }
  } catch (e) {}
  return false;
}

/* ---------- 源 ①：Steam storesearch 反查 appid ---------- */
async function steamSearch(term) {
  const url =
    "https://store.steampowered.com/api/storesearch/?term=" +
    encodeURIComponent(term) +
    "&l=schinese&cc=CN";
  const r = await requestRetry(url, { proxy: false });
  if (r.status !== 200) return [];
  let j;
  try {
    j = JSON.parse(r.buf.toString("utf8"));
  } catch (e) {
    return [];
  }
  return (j.items || []).map((i) => ({ id: i.id, name: i.name }));
}

/* ---------- 源 ②：PlayStation Store 搜索 ---------- */
async function psSearch(term) {
  // PS Store 网页版搜索页会返回内联 JSON
  const url =
    "https://store.playstation.com/zh-hans-cn/search/" + encodeURIComponent(term);
  try {
    const r = await requestRetry(url, { proxy: true }, 3);
    if (r.status !== 200) return [];
    const html = r.buf.toString("utf8");
    const out = [];
    // 从 APOLLO_STATE 或 __NEXT_DATA__ 抓封面
    const re = /"(https:\/\/image\.api\.playstation\.net\/[^"]+?\.(?:jpg|png)[^"]*)"/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(html))) {
      const u = m[1].replace(/\\u002F/g, "/");
      const key = u.split("?")[0];
      if (!seen.has(key) && !/icon|logo|avatar/i.test(key)) {
        seen.add(key);
        out.push(key);
      }
      if (out.length >= 8) break;
    }
    return out;
  } catch (e) {
    return [];
  }
}

/* ---------- 源 ③：Bangumi 游戏条目（type=4） ---------- */
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[（(【\[].*?[）)】\]]/g, "")
    .replace(/[™®:：'"“”‘’\-—–_.,!?！？]/g, "")
    .replace(/\s+/g, "");
}
function score(q, c) {
  const a = norm(q), b = norm(c);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) {
    return 0.6 + 0.35 * (Math.min(a.length, b.length) / Math.max(a.length, b.length));
  }
  let hit = 0;
  const set = new Set(a.split(""));
  for (const ch of b) if (set.has(ch)) hit++;
  return (hit / Math.max(a.length, b.length)) * 0.55;
}
async function bgmSearch(term) {
  const url =
    "https://api.bgm.tv/search/subject/" +
    encodeURIComponent(term) +
    "?type=4&responseGroup=large&max_results=6";
  try {
    const r = await requestRetry(url, { proxy: true }, 3);
    if (r.status !== 200) return [];
    const j = JSON.parse(r.buf.toString("utf8"));
    return (j.list || []).map((it) => ({
      title: it.name_cn || it.name,
      alt: it.name,
      cover: it.images && (it.images.large || it.images.common),
    }));
  } catch (e) {
    return [];
  }
}

/* ---------- 待补清单（人工核对过搜索词） ---------- */
const TARGETS = [
  // ---- Steam（用官方 storesearch 反查 appid）----
  { key: "Red Dead Redemption 2", q: "Red Dead Redemption 2", src: "steam" },
  { key: "Football Manager 26 Demo", q: "Football Manager 26", src: "steam" },
  { key: "星露谷物语", q: "Stardew Valley", src: "steam" },
  { key: "Horizon Zero Dawn Remastered", q: "Horizon Zero Dawn Remastered", src: "steam" },
  { key: "Monster Hunter: World", q: "Monster Hunter World", src: "steam" },
  { key: "DAVE THE DIVER", q: "DAVE THE DIVER", src: "steam" },
  { key: "Sultan's Game", q: "Sultan's Game", src: "steam" },
  // ---- PS 独占 / 主机优先（Steam 可能没有，需要 PS 源或 Bangumi）----
  { key: "God of War", q: "God of War", src: "steam" },           // 有 PC 版
  { key: "DEATH STRANDING DIRECTOR'S CUT", q: "Death Stranding Director's Cut", src: "steam" },
  { key: "黑神话：悟空", q: "Black Myth Wukong", src: "steam" },
  { key: "It Takes Two", q: "It Takes Two", src: "steam" },
  { key: "Cyberpunk 2077", q: "Cyberpunk 2077", src: "steam" },
  { key: "FINAL FANTASY VII REBIRTH", q: "FINAL FANTASY VII REBIRTH", src: "steam" },
  { key: "FINAL FANTASY XVI", q: "FINAL FANTASY XVI", src: "steam" },
  { key: "The Witcher 3: Wild Hunt", q: "The Witcher 3 Wild Hunt", src: "steam" },
  { key: "Metro Exodus", q: "Metro Exodus", src: "steam" },
  { key: "Borderlands 3", q: "Borderlands 3", src: "steam" },
  { key: "The Last of Us Part I", q: "The Last of Us Part I", src: "steam" },
  { key: "Uncharted 4: A Thief’s End", q: "UNCHARTED Legacy of Thieves Collection", src: "steam" },
  { key: "Call of Duty Modern Warfare", q: "Call of Duty Modern Warfare", src: "steam" },
  { key: "Call of Duty", q: "Call of Duty", src: "steam" },
  { key: "eFootball", q: "eFootball", src: "steam" },
  // ---- 国产 / 手游系（Steam 或 Bangumi）----
  { key: "Where Winds Meet", q: "Where Winds Meet", src: "steam" },
  { key: "Arknights: Endfield", q: "Arknights Endfield", src: "steam" },
  { key: "Neverness to Everness", q: "Neverness to Everness", src: "steam" },
  { key: "Zenless Zone Zero", q: "Zenless Zone Zero", src: "steam" },
  { key: "Wuthering Waves", q: "Wuthering Waves", src: "steam" },
  { key: "Delta Force", q: "Delta Force", src: "steam" },
  // ---- 兜底：走 Bangumi ----
  { key: "Spacewar", q: "Spacewar", src: "bgm" },
  { key: "空の軌跡 the 1st Demo", q: "空の軌跡", src: "bgm" },
  { key: "The Last of Us Remastered", q: "The Last of Us", src: "bgm" },
  { key: "艾尔登法环：黄金树幽影", q: "艾尔登法环", src: "bgm" },
];

(async () => {
  fs.mkdirSync(POSTER_DIR, { recursive: true });
  let list = TARGETS;
  if (ONLY) list = list.filter((t) => t.src === ONLY);
  if (LIMIT > 0) list = list.slice(0, LIMIT);

  let result = {};
  if (fs.existsSync(OUT_JSON)) {
    try {
      result = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
    } catch (e) {}
  }

  let ok = 0, fail = 0;
  const failed = [];

  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const tag = "[" + (i + 1) + "/" + list.length + "] " + t.key;
    try {
      let coverUrl = null, dest = null, via = "", matched = "";

      if (t.src === "steam") {
        const cands = await steamSearch(t.q);
        if (cands.length) {
          const ranked = cands.map((c) => ({ ...c, s: score(t.q, c.name) })).sort((a, b) => b.s - a.s);
          const best = ranked[0];
          matched = best.name;
          const appid = best.id;
          dest = path.join(POSTER_DIR, "steam-" + appid + ".jpg");
          coverUrl =
            "https://cdn.cloudflare.steamstatic.com/steam/apps/" + appid + "/library_600x900.jpg";
          via = "Steam#" + appid + " (" + best.s.toFixed(2) + ")";
        }
      } else if (t.src === "bgm") {
        const cands = await bgmSearch(t.q);
        if (cands.length) {
          const ranked = cands.map((c) => ({ ...c, s: score(t.q, c.title) })).sort((a, b) => b.s - a.s);
          const best = ranked[0];
          matched = best.title;
          const id = best.cover.match(/\/(\d+)_/);
          dest = path.join(POSTER_DIR, "bgm-game-" + (id ? id[1] : Date.now()) + ".jpg");
          coverUrl = best.cover;
          via = "Bangumi (" + best.s.toFixed(2) + ")";
        }
      }

      if (!coverUrl || !dest) {
        console.log(tag + "  → 搜不到");
        fail++; failed.push(t.key);
        await nap(600);
        continue;
      }

      const rel = "posters/" + path.basename(dest);
      const done = fs.existsSync(dest) && fs.statSync(dest).size > 2000 ? true : await download(coverUrl, dest);
      if (!done) {
        console.log(tag + "  → " + via + " 但图片下载失败");
        fail++; failed.push(t.key);
        await nap(600);
        continue;
      }
      result[t.key] = { cover: rel, match: matched, source: t.src, via: via };
      ok++;
      console.log(tag + "  → " + matched + "  " + via + "  " + rel);
    } catch (e) {
      console.log(tag + "  → 出错：" + e.message);
      fail++; failed.push(t.key);
    }
    await nap(500);
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), "utf8");
  console.log("\n补全完成：成功 " + ok + " / 失败 " + fail);
  if (failed.length) console.log("失败清单：" + failed.join(" / "));
})();
