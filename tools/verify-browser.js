const { spawnSync } = require("child_process");

const AB = "C:/Users/Administrator/AppData/Roaming/npm/node_modules/agent-browser/bin/agent-browser.js";
const NODE = process.execPath;

function ab(args, label) {
  const r = spawnSync(NODE, [AB].concat(args), { encoding: "utf8", timeout: 120000, cwd: __dirname });
  const out = (String(r.stdout || "") + String(r.stderr || "")).trim();
  console.log("[" + label + "] exit=" + r.status);
  if (out) console.log("  " + out.split(/\r?\n/).slice(0, 6).join("\n  "));
  return out;
}

// 串起来跑（同一个 Node 进程内顺序执行，agent-browser 内部会保持会话）
ab(["set", "viewport", "1440", "900"], "设置视口");
ab(["open", "http://127.0.0.1:8899/games.html"], "打开游戏墙");
console.log("\n--- 断言 ---");
console.log("卡片数:", ab(["eval", "document.querySelectorAll('.shelf-card').length"], "卡片数").replace(/[^0-9]/g, "") || "?");
console.log("筛选 pill 数:", ab(["eval", "document.querySelectorAll('.platform-pill').length"], "筛选数").replace(/[^0-9]/g, "") || "?");
console.log("含「在玩」:", ab(["eval", "document.getElementById('game-shelf').textContent.includes('在玩')"], "在玩").includes("true"));
console.log("window.GAMES 条数:", ab(["eval", "(window.GAMES||[]).length"], "GAMES").replace(/[^0-9]/g, "") || "?");
ab(["screenshot", "C:/Users/Administrator/WorkBuddy/2026-09-13-21-31-20/my-blog/tools/shot-games.png"], "截图");
