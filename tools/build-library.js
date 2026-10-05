/* ============================================================
   构建：data/*.json  →  js/library.js
   ------------------------------------------------------------
   ★ 数据真身在 data/*.json（由 Decap 后台管理）
   ★ 本脚本把它们拼回 js/library.js（HTML 与 main.js 无需改动）
   ★ 每次改完 JSON 都要跑一次；线上由 Cloudflare Pages 自动跑
   ============================================================ */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const outPath = path.join(root, "js", "library.js");

function read(name) {
  const p = path.join(dataDir, name);
  if (!fs.existsSync(p)) return { kind: "", items: [] };
  const raw = fs.readFileSync(p, "utf8").trim();
  if (!raw) return { kind: "", items: [] };
  const obj = JSON.parse(raw);
  if (Array.isArray(obj)) return { kind: "", items: obj };
  return { kind: obj.kind || "", items: obj.items || [] };
}

// JS 字符串字面量转义（处理引号、反斜杠、换行）
function jsStr(v) {
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return String(v);
  return JSON.stringify(String(v));
}

// 输出单个条目的 JS 对象文本
function itemToJs(item, fields) {
  const keys = [];
  for (const f of fields) {
    if (item[f] !== undefined && item[f] !== null && item[f] !== "") keys.push(f);
  }
  // 保留字段表外的额外字段，避免丢数据
  for (const k of Object.keys(item)) {
    if (!keys.includes(k) && item[k] !== undefined && item[k] !== null && item[k] !== "") keys.push(k);
  }
  const lines = keys.map((k) => "    " + k + ": " + jsStr(item[k]) + ",");
  return "  {\n" + lines.join("\n") + "\n  }";
}

const GAME_FIELDS = ["title", "type", "genre", "platform", "status", "progress", "rating", "comment", "cover", "emoji", "review"];
const BOOK_FIELDS = ["title", "type", "author", "status", "progress", "rating", "comment", "cover", "emoji", "review"];
const FILM_FIELDS = ["title", "type", "author", "status", "progress", "rating", "comment", "cover", "emoji", "review"];

const games = read("games.json");
const reading = read("reading.json");
const films = read("films.json");

const header = `/* ============================================================
   小筑 · 数据文件（自动生成，请勿手改！）
   ------------------------------------------------------------
   ★ 数据真身在 data/games.json / reading.json / films.json
   ★ 由 tools/build-library.js 汇总生成本文件
   ★ 想改内容：用后台（/admin）或直接编辑 data/*.json
   ★ 手工改本文件会在下次构建时被覆盖
   ------------------------------------------------------------
   生成时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
   ============================================================ */

`;

const body = [
  "const READING = [",
  reading.items.map((it) => itemToJs(it, BOOK_FIELDS)).join(",\n"),
  "];",
  "",
  "const MOVIES = [",
  films.items.map((it) => itemToJs(it, FILM_FIELDS)).join(",\n"),
  "];",
  "",
  "const GAMES = [",
  games.items.map((it) => itemToJs(it, GAME_FIELDS)).join(",\n"),
  "];",
  "",
].join("\n");

// 条目为空时避免出现 "[]" 里夹空行导致的怪异格式，统一清理
const out = (header + body).replace(/\[\n\s*\n\]/g, "[]").replace(/\[\n\]/g, "[]");

fs.writeFileSync(outPath, out, "utf8");
console.log("已生成 js/library.js");
console.log("  READING", reading.items.length, "| MOVIES", films.items.length, "| GAMES", games.items.length);
