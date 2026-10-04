/* ============================================================
   小筑 · 把补全的游戏封面写进 library.js
   ------------------------------------------------------------
   用法：node tools/apply-game-covers.js
   ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LIB = path.join(ROOT, "js/library.js");
const COVERS = path.join(__dirname, "game-covers.json");

const covers = JSON.parse(fs.readFileSync(COVERS, "utf8"));
let src = fs.readFileSync(LIB, "utf8");

const gStart = src.indexOf("const GAMES = [");
const gEnd = src.indexOf("\n];", gStart);
if (gStart < 0 || gEnd < 0) throw new Error("找不到 GAMES 数组");

let block = src.slice(gStart, gEnd + 3);
let hit = 0;
const miss = [];

for (const key of Object.keys(covers)) {
  const c = covers[key];
  // 定位该条目（先按 title 精确找）
  const tIdx = block.indexOf('title: "' + key + '"');
  if (tIdx < 0) {
    miss.push(key);
    continue;
  }
  // 条目结束位置：从 title 往后找下一个 "  }," 或 "\n];"
  let eIdx = block.indexOf("\n  },", tIdx);
  if (eIdx < 0) eIdx = block.length;
  let seg = block.slice(tIdx, eIdx);

  if (/cover: "/.test(seg)) {
    // 已有封面 → 替换
    seg = seg.replace(/cover: "[^"]*",/, 'cover: "' + c.cover + '",');
  } else {
    // 没有 cover 字段 → 在 emoji 之前插入，或插到条目末尾
    if (/emoji: "/.test(seg)) {
      seg = seg.replace(/(\n\s*)(emoji: ")/, '$1cover: "' + c.cover + '",$1$2');
    } else {
      const lastBrace = seg.lastIndexOf("\n");
      seg = seg.slice(0, lastBrace) + '\n    cover: "' + c.cover + '",' + seg.slice(lastBrace);
    }
  }
  block = block.slice(0, tIdx) + seg + block.slice(eIdx);
  hit++;
}

src = src.slice(0, gStart) + block + src.slice(gEnd + 3);
fs.writeFileSync(LIB, src, "utf8");

console.log("游戏封面写入：" + hit + " 条");
if (miss.length) console.log("  未匹配：" + miss.join(" / "));
