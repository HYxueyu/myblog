const fs = require("fs");
const src = fs.readFileSync(__dirname + "/../js/library.js", "utf8");

function seg(name) {
  const re = new RegExp("const\\s+" + name + "\\s*=\\s*\\[");
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === "[") depth++;
    else if (c === "]") depth--;
    if (depth === 0) break;
    i++;
  }
  return src.slice(m.index + m[0].length, i);
}

const g = seg("GAMES");
const titles = (g.match(/title:\s*"/g) || []).length;
console.log("GAMES 总数:", titles);
console.log("含 Demo/试玩:", /[Dd]emo|试玩版/.test(g));
console.log("含 'Call of Duty' 精确条目数:", (g.match(/title:\s*"Call of Duty"/g) || []).length);
console.log("含 'Call of Duty Modern Warfare':", /title:\s*"Call of Duty Modern Warfare"/.test(g));

console.log("\n-- Spacewar 段 --");
const sw = /title:\s*"Spacewar"[\s\S]*?\n  \}/.exec(g);
console.log(sw ? sw[0] : "(未找到)");

console.log("\n-- Call of Duty Modern Warfare 段 --");
const cod = /title:\s*"Call of Duty Modern Warfare"[\s\S]*?\n  \}/.exec(g);
console.log(cod ? cod[0] : "(未找到)");

console.log("\n-- 全部 genre 分布 --");
const genres = {};
(g.match(/genre:\s*"([^"]+)"/g) || []).forEach((s) => {
  const v = /"([^"]+)"/.exec(s)[1];
  genres[v] = (genres[v] || 0) + 1;
});
Object.keys(genres)
  .sort((a, b) => genres[b] - genres[a])
  .forEach((k) => console.log("  " + k + ": " + genres[k]));
