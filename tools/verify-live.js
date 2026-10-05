// 线上验证：直接抓 https://blog.heiyunas.top/js/library.js，用正则精确解析
const https = require("https");

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      })
      .on("error", reject);
  });
}

function countMatches(str, re) {
  const m = str.match(re);
  return m ? m.length : 0;
}

(async () => {
  const base = "https://blog.heiyunas.top";
  const stamp = Date.now();
  const lib = await get(base + "/js/library.js?v=" + stamp);
  console.log("library.js:", lib.status);

  const src = lib.body;
  if (lib.status !== 200) {
    console.log("抓取失败，body 前 200 字:", src.slice(0, 200));
    return;
  }

  // 精确切出三个数组段：const GAMES = [ ... ]; 之类
  function segment(name) {
    const startRe = new RegExp("const\\s+" + name + "\\s*=\\s*\\[");
    const sm = startRe.exec(src);
    if (!sm) return null;
    let i = sm.index + sm[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
      if (depth === 0) break;
      i++;
    }
    return src.slice(sm.index + sm[0].length, i);
  }

  ["READING", "MOVIES", "GAMES"].forEach((name) => {
    const seg = segment(name);
    if (seg === null) {
      console.log(name + ": 未找到该数组声明");
      return;
    }
    const titles = countMatches(seg, /title:\s*"/g);
    console.log(name + " 条数(title 计数):", titles);
    if (name === "GAMES") {
      console.log("  GAMES 含 Demo/试玩版:", /[Dd]emo|试玩版/.test(seg));
      const zelda = /title:\s*"塞尔达[^"]*"[^}]*?\}/.exec(seg);
      if (zelda) {
        const blk = zelda[0];
        const prog = /progress:\s*"([^"]*)"/.exec(blk);
        const stat = /status:\s*"([^"]*)"/.exec(blk);
        console.log("  塞尔达 status:", stat ? stat[1] : "(无)");
        console.log("  塞尔达 progress:", prog ? prog[1] : "(无)");
      } else {
        console.log("  塞尔达条目: 未匹配到");
      }
    }
  });

  // 已删除封面图是否仍可访问（CDN 缓存可能仍 200）
  for (const p of ["/posters/bgm-game-260.jpg", "/posters/fm26-hero.jpg"]) {
    const r = await get(base + p + "?v=" + stamp);
    console.log(p + ":", r.status, "(CF 缓存可能仍旧命中)");
  }

  for (const page of ["/games.html", "/reading.html", "/films.html"]) {
    const r = await get(base + page + "?v=" + stamp);
    console.log(page + ":", r.status);
  }
})();
