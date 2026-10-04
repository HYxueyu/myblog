/* ============================================================
   小筑 · 足球经理 26 封面兜底
   ------------------------------------------------------------
   背景：FM26 是 2025 新游，Steam CDN 上 library_600x900.jpg /
         header.jpg / capsule_616x353.jpg 全部 404，
         只有 library_hero.jpg 存在（横版大图）。
         所以用 banner 写法显示整张横图。
   用法：node tools/fetch-fm26.js
   ============================================================ */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const DEST = path.join(ROOT, "posters/fm26-hero.jpg");
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
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return req(new URL(res.headers.location, url).href, useProxy, depth + 1).then(resolve, reject);
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

// FM26 试玩版 appid = 3551360；正式版 3551340。逐个试 library_hero.jpg
const CANDIDATES = [
  { appid: 3551360, asset: "library_hero.jpg" },
  { appid: 3551340, asset: "library_hero.jpg" },
  { appid: 3920720, asset: "library_hero.jpg" },  // storesearch 命中的 demo
  { appid: 3551360, asset: "header.jpg" },
  { appid: 3551340, asset: "header.jpg" },
];

(async () => {
  for (const c of CANDIDATES) {
    const url = "https://cdn.cloudflare.steamstatic.com/steam/apps/" + c.appid + "/" + c.asset;
    for (const proxy of [false, true]) {
      for (let i = 0; i < 3; i++) {
        try {
          const r = await req(url, proxy);
          if (r.status === 200 && r.buf.length > 5000 && r.buf[0] === 0xff && r.buf[1] === 0xd8) {
            fs.writeFileSync(DEST, r.buf);
            console.log("OK  " + c.appid + "/" + c.asset + "  →  posters/fm26-hero.jpg  (" + (r.buf.length / 1024).toFixed(1) + "KB)");
            return;
          }
        } catch (e) {}
        await nap(700);
      }
    }
    console.log("miss " + c.appid + "/" + c.asset);
  }
  console.log("全部候选都失败");
  process.exit(1);
})();
