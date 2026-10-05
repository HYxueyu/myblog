/* ============================================================
   小筑 · 清理 demo 条目 + 更新塞尔达记录
   ------------------------------------------------------------
   黑羽 2026-10-05 确认：
     · 删除所有 demo / 试玩版条目（2 条）
     · 塞尔达「王国之泪」进度改为「刚玩了几个任务」
   用结构化解析 → 重新序列化，避免正则改文本出错。
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

/* ---------- 解析成对象数组 ---------- */
const entryRe = /\{\s*\n([\s\S]*?)\n\s*\},/g;
const items = [];
let m;
while ((m = entryRe.exec(block))) {
  const body = m[1];
  const o = {};
  const re = /(\w+):\s*("(?:[^"\\]|\\.)*"|[\d.]+|\{[\s\S]*?\})/g;
  let f;
  while ((f = re.exec(body))) {
    const k = f[1], v = f[2];
    if (v.startsWith('"')) o[k] = v.slice(1, -1).replace(/\\"/g, '"');
    else if (v.startsWith("{")) {
      const s = v.match(/src:\s*"([^"]*)"/);
      o[k] = { src: s ? s[1] : "", banner: /banner:\s*true/.test(v) };
    } else o[k] = Number(v);
  }
  items.push(o);
}
console.log("解析出条目：" + items.length);

/* ---------- ① 删除 demo 条目 ---------- */
const isDemo = (t) => /demo|试玩|体验版/i.test(t);
const removed = items.filter((it) => isDemo(it.title));
const kept = items.filter((it) => !isDemo(it.title));
console.log("删除 demo 条目 " + removed.length + " 条：");
removed.forEach((it) => console.log("   - " + it.title + "（" + it.status + "，封面 " +
  (typeof it.cover === "string" ? it.cover : it.cover && it.cover.src) + "）"));

/* ---------- ② 更新塞尔达 ---------- */
const zelda = kept.find((it) => it.title === "塞尔达传说：王国之泪");
if (zelda) {
  zelda.progress = "刚玩了几个任务";
  zelda.rating = 0;   // 还没深入玩，先不给评分
  zelda.comment = "刚玩了几个任务，攻略已整理成文。";
  console.log("塞尔达已更新：progress=\"" + zelda.progress + "\"，rating=" + zelda.rating);
} else {
  console.log("⚠ 未找到塞尔达条目");
}

/* ---------- 序列化回写 ---------- */
function esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function fmt(g) {
  const out = ["  {"];
  const order = ["title", "type", "genre", "author", "platform", "status", "progress", "rating", "comment", "cover", "emoji", "review"];
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

const newBlock = "const GAMES = [\n" + kept.map(fmt).join("\n") + "\n];";
src = src.slice(0, gStart) + newBlock + src.slice(gEnd + 3);
fs.writeFileSync(LIB, src, "utf8");

const stat = { playing: 0, done: 0, wish: 0 };
kept.forEach((g) => stat[g.status] !== undefined && stat[g.status]++);
console.log("\n完成：共 " + kept.length + " 条（在玩 " + stat.playing + " / 已通关 " + stat.done + " / 想玩 " + stat.wish + "）");
console.log("缺封面：" + kept.filter((g) => !g.cover).length + " 条");
