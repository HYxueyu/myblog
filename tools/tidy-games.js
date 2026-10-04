/* ============================================================
   小筑 · 游戏墙收尾整理
   ------------------------------------------------------------
   用「文本 → 对象数组 → 重新序列化」的方式处理，避免正则改文本出错。
   做三件事：
     ① 去掉跨平台重复（同名游戏只留一条，优先保留有封面的）
     ② 给足球经理26 Demo 补 banner 封面
     ③ 按平台+状态重新排序
   用法：node tools/tidy-games.js
   ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LIB = path.join(ROOT, "js/library.js");

let src = fs.readFileSync(LIB, "utf8");
const gStart = src.indexOf("const GAMES = [");
const gEnd = src.indexOf("\n];", gStart);
if (gStart < 0 || gEnd < 0) throw new Error("找不到 GAMES 数组");
const block = src.slice(gStart, gEnd + 3);

/* ---------- 解析：把每个条目变成对象 ---------- */
const items = [];
const entryRe = /\{\s*\n([\s\S]*?)\n\s*\},/g;
let m;
while ((m = entryRe.exec(block))) {
  const body = m[1];
  const o = {};
  // 普通字符串字段
  const re = /(\w+):\s*("(?:[^"\\]|\\.)*"|[\d.]+|\{[\s\S]*?\})/g;
  let f;
  while ((f = re.exec(body))) {
    const k = f[1];
    let v = f[2];
    if (v.startsWith('"')) {
      o[k] = v.slice(1, -1).replace(/\\"/g, '"');
    } else if (v.startsWith("{")) {
      // banner 写法 { src: "...", banner: true }
      const s = v.match(/src:\s*"([^"]*)"/);
      o[k] = { src: s ? s[1] : "", banner: /banner:\s*true/.test(v) };
    } else {
      o[k] = Number(v);
    }
  }
  items.push(o);
}
console.log("解析出条目：" + items.length);

/* ---------- ① 去重：同名 + 同平台保留一条；跨平台同名保留有封面的 ---------- */
const byTitle = {};
items.forEach((it) => {
  const t = it.title;
  if (!byTitle[t]) byTitle[t] = [];
  byTitle[t].push(it);
});

const kept = [];
const dropped = [];
Object.keys(byTitle).forEach((t) => {
  const group = byTitle[t];
  if (group.length === 1) {
    kept.push(group[0]);
    return;
  }
  // 多条同名：优先有封面的，其次时长更长的
  group.sort((a, b) => {
    const ca = a.cover ? 1 : 0, cb = b.cover ? 1 : 0;
    if (ca !== cb) return cb - ca;
    const ha = parseFloat(String(a.progress).match(/[\d.]+/)) || 0;
    const hb = parseFloat(String(b.progress).match(/[\d.]+/)) || 0;
    return hb - ha;
  });
  kept.push(group[0]);
  group.slice(1).forEach((g) => dropped.push(g.title + "[" + (g.platform || "-") + "]"));
});
console.log("去重丢弃：" + (dropped.length ? dropped.join(" / ") : "无"));

/* ---------- ② 足球经理26 Demo：补 banner 封面 ---------- */
// 注意：本脚本可能被重复运行，改名后要用「新旧名字都匹配」的方式找
const fm = kept.find(
  (it) => it.title === "Football Manager 26 Demo" || it.title === "足球经理 26（试玩版）"
);
if (fm) {
  const heroPath = path.join(ROOT, "posters/fm26-hero.jpg");
  if (fs.existsSync(heroPath)) {
    fm.cover = { src: "posters/fm26-hero.jpg", banner: true };
    console.log("✓ FM26 已补 banner 封面");
  }
  // 顺手把名字改成更准确的
  fm.title = "足球经理 26（试玩版）";
  fm.author = "Sports Interactive";
}

/* ---------- ③ 排序：在玩 → 已通关 → 想玩；组内按最近游玩倒序 ---------- */
const ORDER = { playing: 0, done: 1, wish: 2 };
function recentOf(it) {
  const mm = String(it.progress || "").match(/最近\s*(\d{4})-(\d{2})/);
  return mm ? mm[1] + mm[2] : "0";
}
kept.sort((a, b) => {
  const oa = ORDER[a.status] === undefined ? 9 : ORDER[a.status];
  const ob = ORDER[b.status] === undefined ? 9 : ORDER[b.status];
  if (oa !== ob) return oa - ob;
  const ra = recentOf(a), rb = recentOf(b);
  if (ra !== rb) return rb.localeCompare(ra); // 最近的在前面
  return String(a.title).localeCompare(String(b.title));
});

/* ---------- 序列化 ---------- */
function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function fmt(g) {
  const out = ["  {"];
  const order = ["title", "type", "author", "platform", "status", "progress", "rating", "comment", "cover", "emoji", "review"];
  for (const k of order) {
    const v = g[k];
    if (v === undefined || v === null || v === "") continue;
    if (k === "cover" && typeof v === "object") {
      out.push('    cover: { src: "' + v.src + '", banner: ' + (v.banner ? "true" : "false") + " },");
    } else if (typeof v === "number") {
      out.push("    " + k + ": " + v + ",");
    } else {
      out.push('    ' + k + ': "' + esc(v) + '",');
    }
  }
  out.push("  },");
  return out.join("\n");
}

const newBlock =
  "const GAMES = [\n" + kept.map(fmt).join("\n") + "\n];";

src = src.slice(0, gStart) + newBlock + src.slice(gEnd + 3);
fs.writeFileSync(LIB, src, "utf8");

const stat = { playing: 0, done: 0, wish: 0 };
kept.forEach((g) => stat[g.status] !== undefined && stat[g.status]++);
console.log("\n收尾完成：共 " + kept.length + " 条");
console.log("  在玩 " + stat.playing + " / 已通关 " + stat.done + " / 想玩 " + stat.wish);
console.log("  有封面 " + kept.filter((g) => g.cover).length + " 条");
