/* 端到端验证：改 data/games.json → 页面是否读到新数据
   步骤：1) 备份原 JSON  2) 改一条标题  3) 浏览器验证  4) 还原 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DATA = path.join(__dirname, "..", "data", "games.json");
const AB = "C:/Users/Administrator/AppData/Roaming/npm/node_modules/agent-browser/bin/agent-browser.js";
const NODE = process.execPath;

function ab(args) {
  const r = spawnSync(NODE, [AB].concat(args), { encoding: "utf8", timeout: 90000, cwd: __dirname });
  return (String(r.stdout || "") + String(r.stderr || "")).trim();
}

const original = fs.readFileSync(DATA, "utf8");

try {
  // 改：给第一条标题加个标记
  const obj = JSON.parse(original);
  const firstTitle = obj.items[0].title;
  obj.items[0].title = firstTitle + "【后台测试】";
  fs.writeFileSync(DATA, JSON.stringify(obj, null, 2) + "\n", "utf8");
  console.log("① 已修改 JSON 首条标题：", firstTitle, "→", obj.items[0].title);

  // 浏览器验证
  ab(["set", "viewport", "1440", "900"]);
  ab(["open", "http://127.0.0.1:8899/games.html"]);
  const hasMark = ab(["eval", "document.body.textContent.includes('【后台测试】')"]);
  const gamesLen = ab(["eval", "(window.GAMES||[]).length"]);
  console.log("② 浏览器读到标记:", hasMark.includes("true") ? "✅ 是" : "❌ 否");
  console.log("③ window.GAMES 条数:", (gamesLen.match(/\d+/) || ["?"])[0]);
} finally {
  // 还原
  fs.writeFileSync(DATA, original, "utf8");
  console.log("④ 已还原 JSON");
}

// 还原后再验证一次，确认回到原状
ab(["open", "http://127.0.0.1:8899/games.html"]);
const clean = ab(["eval", "document.body.textContent.includes('【后台测试】')"]);
console.log("⑤ 还原后标记已消失:", clean.includes("false") ? "✅ 是" : "❌ 否");
