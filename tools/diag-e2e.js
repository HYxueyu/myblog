/* 精确诊断：改 JSON 后，卡片里渲染的标题到底是什么 */
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
const obj = JSON.parse(original);
obj.items[0].title = "ZZTESTTITLE";
fs.writeFileSync(DATA, JSON.stringify(obj, null, 2) + "\n", "utf8");
console.log("已把首条标题改为 ZZTESTTITLE");

ab(["open", "http://127.0.0.1:8899/games.html"]);
console.log("\n--- 诊断 ---");
// 1) window.GAMES[0].title
console.log("window.GAMES[0].title =", ab(["eval", "(window.GAMES[0]||{}).title"]));
// 2) 实际渲染的第一张卡片标题
console.log("卡片标题 =", ab(["eval", "(document.querySelector('.shelf-card h3')||{}).textContent"]));
// 3) 整页是否含 ZZ
console.log("页面含 ZZTESTTITLE =", ab(["eval", "document.documentElement.textContent.includes('ZZTESTTITLE')"]));
// 4) 检查 fetch 是否成功（重新拉一次）
console.log("手动 fetch 探测 =", ab(["eval", "fetch('data/games.json').then(r=>r.json()).then(j=>j.items[0].title)"]));

fs.writeFileSync(DATA, original, "utf8");
console.log("\n已还原");
