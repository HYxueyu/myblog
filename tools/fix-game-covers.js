/* ============================================================
   小筑 · 游戏封面修正（按人工核对的 Steam appid）
   ------------------------------------------------------------
   用途：storesearch 自动匹配有错配 + 部分下载被网络抖动中断，
         这里用核对过的 appid 精确重下。
   用法：node tools/fix-game-covers.js
   ============================================================ */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const POSTER_DIR = path.join(ROOT, "posters");
const OUT_JSON = path.join(__dirname, "game-covers.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36";

function req(url, useProxy, depth) {
  depth = depth || 0;
  return new Promise((resolve, reject) => {
    if (depth > 6) return reject(new Error("too many redirects"));
    const u = new URL(url);
    const o = {
      host: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      method: "GET",
      path: u.pathname + u.search,
      headers: { "User-Agent": UA },
    };
    let lib = u.protocol === "https:" ? https : http;
    if (useProxy) {
      lib = http;
      o.host = "127.0.0.1";
      o.port = 7897;
      o.path = url;
      o.headers.Host = u.hostname;
    }
    const r = lib.request(o, (res) => {
      // 跟随重定向（Bangumi 图床 http → https 会 301）
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        return req(next, useProxy, depth + 1).then(resolve, reject);
      }
      const c = [];
      res.on("data", (d) => c.push(d));
      res.on("end", () => resolve({ status: res.statusCode, buf: Buffer.concat(c) }));
    });
    r.on("error", reject);
    r.setTimeout(25000, () => r.destroy(new Error("timeout")));
    r.end();
  });
}
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
function isImg(b) {
  return b.length > 2000 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50));
}

async function download(url, dest) {
  // ⚠️ Bangumi 图床给的是 http://lain.bgm.tv/...，走代理会 301；先转 https 再试
  const candidates = Array.from(
    new Set([url.replace(/^http:/, "https:"), url])
  );
  for (const u of candidates) {
    // 先直连（国内图床直连通），再走代理
    for (const proxy of [false, true]) {
      for (let i = 0; i < 3; i++) {
        try {
          const r = await req(u, proxy);
          if (r.status === 200 && isImg(r.buf)) {
            fs.writeFileSync(dest, r.buf);
            return true;
          }
          if (r.status === 404 || r.status === 403) break;
        } catch (e) {}
        await nap(600 + i * 600);
      }
    }
  }
  return false;
}

/* ★ 人工核对过的正确 appid（游戏名 → appid）
      —— 每个都用 store.steampowered.com/api/appdetails 验过名字 */
const BY_ID = [
  // —— 前一轮下载失败的（appid 本身对的，只是网络抖动）——
  { key: "Cyberpunk 2077", appid: 1091500 },              // 赛博朋克 2077
  { key: "The Witcher 3: Wild Hunt", appid: 292030 },     // 巫师 3
  { key: "Metro Exodus", appid: 412020 },                 // 地铁：离去
  { key: "Borderlands 3", appid: 397540 },                // 无主之地 3
  // —— 前一轮匹配错的，改为正确的 ——
  { key: "It Takes Two", appid: 1426210, old: "steam-2995920.jpg" },      // 原匹配 Friend's Pass
  { key: "Delta Force", appid: 2507950, old: "steam-32620.jpg" },         // 原匹配 1998 年 Delta Force 1
  { key: "Call of Duty", appid: 2000950, old: "steam-2620.jpg" },         // 原匹配 CoD 2003 → 改用 MW2019
];

/* 这几条在 Steam 国区搜不到（未上架 / 主机独占），用 Bangumi 游戏条目兜底 */
const BY_BGM = [
  { key: "eFootball", q: "eFootball" },
  { key: "Where Winds Meet", q: "燕云十六声" },
  { key: "Arknights: Endfield", q: "明日方舟 终末地" },
  { key: "Neverness to Everness", q: "异环" },
  { key: "Zenless Zone Zero", q: "绝区零" },
  { key: "Wuthering Waves", q: "鸣潮" },
];

/* 相似度打分（用于在搜索结果里挑最像的） */
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[（(【\[].*?[）)】\]]/g, "")
    .replace(/[™®:：'"“”‘’\-—–_.,!?！？·、/\\|]/g, "")
    .replace(/\s+/g, "");
}
function sim(q, c) {
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

async function bgmPick(q) {
  const api =
    "https://api.bgm.tv/search/subject/" +
    encodeURIComponent(q) +
    "?type=4&responseGroup=large&max_results=8";
  for (let k = 0; k < 4; k++) {
    try {
      const r = await req(api, true);
      if (r.status === 200) {
        const j = JSON.parse(r.buf.toString("utf8"));
        const list = (j.list || []).map((it) => ({
          id: it.id,
          title: it.name_cn || it.name,
          alt: it.name,
          cover: it.images && (it.images.large || it.images.common),
          s: sim(q, (it.name_cn || "") + (it.name || "")),
        }));
        list.sort((a, b) => b.s - a.s);
        return list[0] || null;
      }
    } catch (e) {}
    await nap(900 + k * 900);
  }
  return null;
}

(async () => {
  let result = {};
  if (fs.existsSync(OUT_JSON)) {
    try {
      result = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
    } catch (e) {}
  }

  let ok = 0, fail = 0;
  const failed = [];

  for (let i = 0; i < BY_ID.length; i++) {
    const t = BY_ID[i];
    const tag = "[" + (i + 1) + "/" + BY_ID.length + "] " + t.key;
    const dest = path.join(POSTER_DIR, "steam-" + t.appid + ".jpg");
    const rel = "posters/steam-" + t.appid + ".jpg";
    const url =
      "https://cdn.cloudflare.steamstatic.com/steam/apps/" + t.appid + "/library_600x900.jpg";

    const already = fs.existsSync(dest) && fs.statSync(dest).size > 2000;
    const done = already ? true : await download(url, dest);
    if (done) {
      result[t.key] = { cover: rel, match: t.key, source: "steam", via: "Steam#" + t.appid + " (人工核对)" };
      ok++;
      console.log(tag + "  → " + rel + (already ? "  (已存在)" : ""));
    } else {
      console.log(tag + "  → 下载失败 appid=" + t.appid);
      fail++;
      failed.push(t.key + "(" + t.appid + ")");
    }
    await nap(400);
  }

  // 删掉错配的旧图
  console.log("\n=== 清理错配旧图 ===");
  for (const t of BY_ID) {
    if (!t.old) continue;
    const f = path.join(POSTER_DIR, t.old);
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log("  已删 " + t.old + "（" + t.key + " 旧错图）");
    }
  }

  // ---- 第二轮：Steam 搜不到的走 Bangumi ----
  if (BY_BGM.length) {
    console.log("\n=== Bangumi 兜底（Steam 未上架的） ===");
    for (let i = 0; i < BY_BGM.length; i++) {
      const t = BY_BGM[i];
      const tag = "[" + (i + 1) + "/" + BY_BGM.length + "] " + t.key;
      try {
        const best = await bgmPick(t.q);
        if (!best) {
          console.log(tag + "  → Bangumi 也搜不到");
          fail++; failed.push(t.key + "(无源)");
          await nap(600);
          continue;
        }
        if (!best.cover) {
          console.log(tag + "  → 匹配「" + best.title + "」但无封面");
          fail++; failed.push(t.key + "(无图)");
          await nap(600);
          continue;
        }
        const dest = path.join(POSTER_DIR, "bgm-game-" + best.id + ".jpg");
        const rel = "posters/bgm-game-" + best.id + ".jpg";
        const done = fs.existsSync(dest) && fs.statSync(dest).size > 2000 ? true : await download(best.cover, dest);
        if (done) {
          result[t.key] = {
            cover: rel,
            match: best.title,
            source: "bangumi",
            via: "Bangumi#" + best.id + " (" + best.s.toFixed(2) + ")",
          };
          ok++;
          console.log(tag + "  → " + best.title + "  (" + best.s.toFixed(2) + ")  " + rel);
        } else {
          console.log(tag + "  → 图片下载失败");
          fail++; failed.push(t.key + "(下载)");
        }
      } catch (e) {
        console.log(tag + "  → 出错：" + e.message);
        fail++; failed.push(t.key);
      }
      await nap(600);
    }
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), "utf8");
  console.log("\n修正完成：成功 " + ok + " / 失败 " + fail);
  if (failed.length) console.log("仍失败：" + failed.join(" / "));
})();
