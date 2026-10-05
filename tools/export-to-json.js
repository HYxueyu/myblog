/* ============================================================
   导出：js/library.js  →  data/*.json
   ------------------------------------------------------------
   一次性迁移脚本。执行后：
     data/games.json    ← GAMES
     data/reading.json  ← READING
     data/films.json    ← MOVIES
   之后这些 JSON 就是数据真身，由 Decap 后台管理；
   js/library.js 改为由 tools/build-library.js 自动生成。
   ============================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const libPath = path.join(root, "js", "library.js");
const dataDir = path.join(root, "data");

const src = fs.readFileSync(libPath, "utf8");

// 用 vm 执行 library.js，取出三个数组（不污染当前上下文）
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src, ctx);
vm.runInContext("this.GAMES = GAMES; this.READING = READING; this.MOVIES = MOVIES;", ctx);

const GAMES = ctx.GAMES || [];
const READING = ctx.READING || [];
const MOVIES = ctx.MOVIES || [];

console.log("读入：GAMES", GAMES.length, "| READING", READING.length, "| MOVIES", MOVIES.length);

// 字段顺序规范化，保证 JSON diff 干净、Decap 字段一致
const GAME_FIELDS = ["title", "type", "genre", "platform", "status", "progress", "rating", "comment", "cover", "emoji", "review"];
const BOOK_FIELDS = ["title", "type", "author", "status", "progress", "rating", "comment", "cover", "emoji", "review"];
const FILM_FIELDS = ["title", "type", "author", "status", "progress", "rating", "comment", "cover", "emoji", "review"];

function normalize(item, fields) {
  const out = {};
  for (const f of fields) {
    if (item[f] !== undefined && item[f] !== null && item[f] !== "") out[f] = item[f];
  }
  // 兜底：未在字段表里的额外字段也保留，避免丢数据
  for (const k of Object.keys(item)) {
    if (!(k in out) && item[k] !== undefined && item[k] !== null && item[k] !== "") out[k] = item[k];
  }
  return out;
}

function wrap(list, fields, kind) {
  return {
    kind,
    items: list.map((it) => normalize(it, fields)),
  };
}

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const files = [
  ["games.json", wrap(GAMES, GAME_FIELDS, "game")],
  ["reading.json", wrap(READING, BOOK_FIELDS, "reading")],
  ["films.json", wrap(MOVIES, FILM_FIELDS, "film")],
];

files.forEach(([name, obj]) => {
  const p = path.join(dataDir, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
  console.log("写入", name, "→", obj.items.length, "条");
});

// 备份原 library.js（迁移不该丢原件）
const bak = path.join(root, "js", "library.before-migration.js");
fs.copyFileSync(libPath, bak);
console.log("原件已备份 →", path.relative(root, bak));
