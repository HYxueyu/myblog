/* 游戏墙数据体检 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const src = fs.readFileSync(path.join(ROOT, "js/library.js"), "utf8");
const m = src.match(/const GAMES = \[([\s\S]*?)\n\];/);
if (!m) throw new Error("找不到 GAMES");
const re = /\{([\s\S]*?)\n  \},/g;
const out = [];
let x;
while ((x = re.exec(m[1]))) out.push(x[1]);

let n = 0, bad = 0;
const noCov = [];
out.forEach((t) => {
  n++;
  const banner = t.match(/cover:\s*\{\s*src:\s*"([^"]+)"/);
  const plain = t.match(/cover:\s*"([^"]+)"/);
  if (!banner && !plain) {
    noCov.push((t.match(/title:\s*"([^"]+)"/) || [])[1]);
    return;
  }
  const p = banner ? banner[1] : plain[1];
  if (!fs.existsSync(path.join(ROOT, p)) || fs.statSync(path.join(ROOT, p)).size < 2000) {
    bad++;
    console.log("  ✗ " + p);
  }
});

console.log("GAMES 条目: " + n);
console.log("无封面: " + (noCov.length ? noCov.join(" / ") : "0 条 ✓"));
console.log("图片损坏/缺失: " + bad);

console.log("\n--- 全部条目（排序后）---");
out.forEach((t, i) => {
  const ti = (t.match(/title:\s*"([^"]+)"/) || [])[1];
  const pf = (t.match(/platform:\s*"([^"]+)"/) || [])[1] || "-";
  const st = (t.match(/status:\s*"([^"]+)"/) || [])[1];
  const banner = t.match(/cover:\s*\{\s*src:\s*"([^"]+)"/);
  const plain = t.match(/cover:\s*"([^"]+)"/);
  const cov = banner ? "banner" : plain ? plain[1] : "无封面";
  console.log(
    "  " + String(i + 1).padStart(3) + " " + st.padEnd(8) + pf.padEnd(7) + ti.padEnd(36) + "| " + cov
  );
});
