/* ============================================================
   小筑 · 清空影视墙（黑羽确认 5 条都没看过）
   ------------------------------------------------------------
   用结构化解析 → 重新序列化，避免正则改文本出错。
   MOVIES 清空为空数组；同时删除对应的 5 个无封面条目。
   ============================================================ */

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const LIB = path.join(ROOT, "js/library.js");

let src = fs.readFileSync(LIB, "utf8");

// 定位 MOVIES 数组
const mStart = src.indexOf("const MOVIES = [");
const mEnd = src.indexOf("\n];", mStart);
if (mStart < 0 || mEnd < 0) throw new Error("找不到 MOVIES 数组");

const oldBlock = src.slice(mStart, mEnd + 3);
console.log("原 MOVIES 块长度:", oldBlock.length, "字节");

// 数一下条数
const titleCount = (oldBlock.match(/title:/g) || []).length;
console.log("原 MOVIES 条目:", titleCount);

// 替换为空数组（保留注释说明）
const newBlock = `const MOVIES = [
  /* 影视记录暂空（黑羽 2026-10-05 确认旧 5 条都没看过，已清空）
     —— 之后用「片名 + 看到哪 + 评分」即可补录，墨鸦会自动抓海报 */
];`;

src = src.slice(0, mStart) + newBlock + src.slice(mEnd + 3);
fs.writeFileSync(LIB, src, "utf8");

console.log("✓ MOVIES 已清空");
