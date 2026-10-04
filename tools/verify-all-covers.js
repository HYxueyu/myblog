// 全量校验：README/GAMES 所有封面文件是否存在于磁盘 + 是否是合法图片
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const libSrc = fs.readFileSync(path.join(ROOT, "js", "library.js"), "utf8");

// 粗暴但够用：把所有 cover 字段抠出来
function collect(src, label) {
  const out = [];
  // cover: "xxx.jpg"
  const re1 = /cover:\s*"([^"]+)"/g;
  let m;
  while ((m = re1.exec(src))) out.push({ file: m[1], raw: "str" });
  // cover: { src: "xxx.jpg", ... }
  const re2 = /cover:\s*\{\s*src:\s*"([^"]+)"/g;
  while ((m = re2.exec(src))) out.push({ file: m[1], raw: "obj" });
  return out;
}

const covers = collect(libSrc, "library");

// 图片合法性：JPEG ffd8ff / PNG 89504e47 / WebP RIFF....WEBP / GIF 474946
function isImg(buf) {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;                 // jpeg
  if (buf[0] === 0x89 && buf[1] === 0x50) return true;                 // png
  if (buf.toString("ascii", 0, 3) === "GIF") return true;
  if (buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP") return true;
  return false;
}

const seen = new Set();
let ok = 0;
const missing = [];
const broken = [];
const tiny = [];

for (const c of covers) {
  if (seen.has(c.file)) continue;
  seen.add(c.file);
  if (/^https?:\/\//.test(c.file)) { ok++; continue; }  // 外链不检查
  const p = path.join(ROOT, c.file);
  if (!fs.existsSync(p)) { missing.push(c.file); continue; }
  const buf = fs.readFileSync(p);
  if (!isImg(buf)) { broken.push(`${c.file} (${buf.length}B)`); continue; }
  if (buf.length < 3000) tiny.push(`${c.file} (${buf.length}B)`);
  ok++;
}

console.log("=== 封面全量校验 ===");
console.log("引用封面总数（去重）:", seen.size);
console.log("有效:", ok);
console.log("文件缺失:", missing.length);
missing.forEach(f => console.log("   ✗", f));
console.log("非法图片:", broken.length);
broken.forEach(f => console.log("   ✗", f));
console.log("可疑小图(<3KB):", tiny.length);
tiny.forEach(f => console.log("   ?", f));

// 统计 posters 目录实际文件数
const posterDir = path.join(ROOT, "posters");
if (fs.existsSync(posterDir)) {
  const files = fs.readdirSync(posterDir);
  console.log("\nposters 目录文件数:", files.length);
}
process.exit(missing.length || broken.length ? 1 : 0);
