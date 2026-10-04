/* ============================================================
   小筑 · Exophase 游戏记录刮削器
   ------------------------------------------------------------
   抓取 https://www.exophase.com/user/<用户名>/ 的游玩记录，
   生成可直接使用的 GAMES 数组（含 Steam 竖版封面 600×900）。

   用法（在 my-blog 目录下开终端）：
     node tools/scrape-exophase.js                     抓 1 页（约 50 条）
     node tools/scrape-exophase.js --pages 3           抓 3 页
     node tools/scrape-exophase.js --user sherry-xueyu 换账号
     node tools/scrape-exophase.js --no-dl             只生成数据不下封面
     node tools/scrape-exophase.js --direct            不走代理（海外网络用）

   产出：
     js/library.generated.js   完整的 GAMES 数组，可整体替换
     posters/steam-<appid>.jpg 自动下载的 Steam 竖版封面

   ⚠ 为什么不直接覆盖 library.js：
     抓取结果里的「状态/评分/短评」是自动推断的，不如你手写的有味道。
     建议把 generated 文件里的条目挑选着合并进去，保留自己写的评语。

   技术要点（供以后维护参考）：
     · Exophase 走 Cloudflare，国内 IP 直连 403，必须经本地代理
       （默认 127.0.0.1:7897，可用 --proxy 改端口）
     · 游戏数据不在 HTML 里，而在内联脚本 window.playerGames 中，
       是一段 Unicode 转义的 JSON 字符串——直接解析它，别去扒 DOM
     · Steam 竖版封面地址：cdn.cloudflare.steamstatic.com/steam/apps/<appid>/library_600x900.jpg
   ============================================================ */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const POSTER_DIR = path.join(ROOT, "posters");

/* ---------- 命令行参数 ---------- */
const argv = process.argv.slice(2);
const argOf = (k, d) => {
  const i = argv.indexOf("--" + k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const USER = argOf("user", "heiyu");
const PAGES = parseInt(argOf("pages", "1"), 10);
const DOWNLOAD = !argv.includes("--no-dl");
const PROXY = argv.includes("--direct")
  ? null
  : { host: "127.0.0.1", port: parseInt(argOf("proxy", "7897"), 10) };

const AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ---------- HTTP（经代理 + 跟随重定向） ---------- */
function request(url, binary, depth) {
  depth = depth || 0;
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error("重定向过多"));
    const u = new URL(url);
    const headers = {
      "User-Agent": AGENT,
      Accept: binary ? "*/*" : "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "identity",
    };

    const onRes = (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(request(new URL(res.headers.location, url).href, binary, depth + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode + " — " + url));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve(binary ? buf : buf.toString("utf8"));
      });
    };

    let req;
    if (PROXY) {
      req = http.request(
        {
          host: PROXY.host,
          port: PROXY.port,
          method: "GET",
          path: url,
          headers: Object.assign({ Host: u.host }, headers),
        },
        onRes
      );
    } else {
      req = https.get(url, { headers }, onRes);
    }
    req.on("error", reject);
    req.setTimeout(40000, () => {
      req.destroy();
      reject(new Error("超时"));
    });
    req.end();
  });
}

/* ---------- 从页面里挖出 window.playerGames ---------- */
function extractPlayerGames(html) {
  const marker = "window.playerGames";
  const at = html.indexOf(marker);
  if (at < 0) throw new Error("页面里没找到 window.playerGames（登录墙或改版？）");

  // 取赋值号后面第一个单引号包裹的字符串
  const q1 = html.indexOf("'", at);
  if (q1 < 0) throw new Error("playerGames 格式异常");
  let i = q1 + 1;
  let raw = "";
  while (i < html.length) {
    const c = html[i];
    if (c === "\\") {
      raw += c + html[i + 1];
      i += 2;
      continue;
    }
    if (c === "'") break;
    raw += c;
    i++;
  }

  // 反转义：外层是 JS 字符串，内容是 \u007B 之类的 Unicode 转义
  const unescaped = JSON.parse('"' + raw + '"');
  const data = JSON.parse(unescaped);
  return Array.isArray(data.games) ? data.games : [];
}

/* ---------- 单条游戏 → 小筑字段 ---------- */
function normalize(g) {
  const meta = g.meta || {};
  const plat = (meta.platforms && meta.platforms[0] && meta.platforms[0].name) || "";
  const env = meta.environment_slug || "";
  const hours = g.playtimeUnits ? g.playtimeUnits.hours + g.playtimeUnits.minutes / 60 : 0;
  const total = g.total_awards || 0;
  const earned = g.earned_awards || 0;
  const percent = typeof g.percent === "number" ? g.percent : total ? Math.round((earned / total) * 100) : 0;

  return {
    title: meta.title || meta.title_original || "(未知标题)",
    platform: plat || (env === "steam" ? "Steam" : env === "psn" ? "PSN" : env),
    env: env,
    appid: env === "steam" ? String(meta.canonical_id || "") : "",
    developer: (meta.developers && meta.developers[0] && meta.developers[0].name) || "",
    hours: Math.round(hours * 10) / 10,
    earned: earned,
    total: total,
    percent: percent,
    // Steam 的时间戳是秒；PSN 是毫秒，统一处理
    lastPlayed: g.lastplayed
      ? new Date(g.lastplayed > 1e11 ? g.lastplayed : g.lastplayed * 1000)
      : null,
    status: g.status || "",
  };
}

/* ---------- 推断小筑的 status 字段 ---------- */
function toStatus(g) {
  if (g.percent >= 100) return "done";        // 全成就 → 已通关
  if (g.hours >= 1) return "playing";          // 玩过 1 小时以上 → 在玩
  return "wish";                               // 只试了几分钟 → 想玩
}

function toComment(g) {
  const bits = [];
  if (g.hours >= 0.1) bits.push("累计 " + g.hours + " 小时");
  if (g.total) bits.push("成就 " + g.earned + "/" + g.total + "（" + g.percent + "%）");
  if (g.lastPlayed) {
    const d = g.lastPlayed;
    bits.push("最近 " + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  }
  return bits.join(" · ");
}

/* ---------- 主流程 ---------- */
(async () => {
  const log = [];
  log.push("用户：" + USER + "　代理：" + (PROXY ? PROXY.host + ":" + PROXY.port : "直连"));

  const all = [];
  for (let p = 1; p <= PAGES; p++) {
    const url =
      "https://www.exophase.com/user/" + USER + "/" + (p > 1 ? "page/" + p + "/" : "");
    try {
      const html = await request(url, false);
      const games = extractPlayerGames(html);
      log.push("第 " + p + " 页：" + games.length + " 条");
      all.push.apply(all, games);
    } catch (e) {
      log.push("第 " + p + " 页失败：" + e.message);
    }
  }

  // 去重：同一游戏同一平台只留一条
  const seen = new Set();
  const uniq = all
    .map(normalize)
    .filter((g) => {
      const k = g.title + "|" + g.platform;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  // 下载 Steam 竖版封面
  let dl = 0;
  if (DOWNLOAD) {
    if (!fs.existsSync(POSTER_DIR)) fs.mkdirSync(POSTER_DIR, { recursive: true });
    for (const g of uniq) {
      if (g.env !== "steam" || !g.appid) continue;
      const rel = "posters/steam-" + g.appid + ".jpg";
      const dest = path.join(ROOT, rel);
      if (fs.existsSync(dest)) {
        g.cover = rel;
        continue;
      }
      try {
        const buf = await request(
          "https://cdn.cloudflare.steamstatic.com/steam/apps/" + g.appid + "/library_600x900.jpg",
          true
        );
        fs.writeFileSync(dest, buf);
        g.cover = rel;
        dl++;
      } catch (e) {
        g.cover = "";   // 没有竖版封面（小作品/Demo 常见），走占位封面
      }
    }
  }

  /* ---------- 生成 library.generated.js ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const body = uniq
    .map((g) => {
      const lines = ["  {"];
      lines.push('    title: "' + esc(g.title) + '",');
      lines.push('    type: "游戏",');
      lines.push('    author: "' + esc(g.developer) + '",');
      lines.push('    platform: "' + esc(g.platform) + '",');
      lines.push('    status: "' + toStatus(g) + '",');
      // 全成就的游戏用文字进度更直观，其余用百分比进度条
      if (toStatus(g) === "playing" && g.percent > 0) {
        lines.push("    progress: " + g.percent + ",");
      } else {
        lines.push('    progress: "' + esc(toComment(g)) + '",');
      }
      lines.push("    rating: 0,");
      lines.push('    comment: "' + esc(toComment(g)) + '",');
      lines.push('    cover: ' + (g.cover ? '"' + g.cover + '"' : '""') + ",");
      lines.push('    emoji: "🎮",');
      lines.push("  },");
      return lines.join("\n");
    })
    .join("\n");

  const header = [
    "/* ============================================================",
    "   由 tools/scrape-exophase.js 自动生成 —— 请勿直接编辑这个文件",
    "   抓取时间：" + new Date().toLocaleString("zh-CN"),
    "   数据来源：https://www.exophase.com/user/" + USER + "/",
    "   共 " + uniq.length + " 条（已按 标题+平台 去重）",
    "   ------------------------------------------------------------",
    "   合并方法：打开 js/library.js，把下面的条目挑进 GAMES 数组。",
    "   建议保留自己写的 comment / rating，只借用 title/cover/progress。",
    "   ============================================================ */",
    "",
    "const GAMES_SCRAPED = [",
  ].join("\n");

  fs.writeFileSync(
    path.join(ROOT, "js", "library.generated.js"),
    header + "\n" + body + "\n];\n",
    "utf8"
  );

  const withCover = uniq.filter((g) => g.cover).length;
  log.push("共 " + uniq.length + " 条；新下载竖版封面 " + dl + " 张，有封面共 " + withCover + " 条");
  log.push("产出：" + path.join("js", "library.generated.js"));
  console.log(log.join("\n"));
  fs.writeFileSync(path.join(ROOT, "..", "_scrape.log"), log.join("\n"), "utf8");
})();
