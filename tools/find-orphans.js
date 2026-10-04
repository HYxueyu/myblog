// 找出 posters 里未被 library.js 引用的孤儿图 + 清理备份文件
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let all = "";
for (const f of ["js/library.js", "main.js", "posts.js", "games.html", "reading.html", "movies.html", "index.html"]) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) all += fs.readFileSync(p, "utf8");
}

const posterDir = path.join(ROOT, "posters");
const files = fs.readdirSync(posterDir);
const orphans = [];
for (const f of files) {
  if (!all.includes(f)) orphans.push(f);
}

console.log("=== 孤儿图（未被任何页面引用） ===");
console.log("数量:", orphans.length);
orphans.forEach(f => {
  const st = fs.statSync(path.join(posterDir, f));
  console.log("  ", f, `(${(st.size / 1024).toFixed(1)}KB)`);
});

// 待清理的备份/临时文件
const junk = [
  "js/library.js.bak",
  "js/library.pre-tidy.bak",
  "js/library.js.orig",
  "tools/diag-bgm.js",
];
console.log("\n=== 待清理临时/备份 ===");
for (const f of junk) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) console.log("  存在:", f);
}
