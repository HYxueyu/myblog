/* 修复后复验：确认 #nc-root 被 Decap 渲染、CMS 全局可见 */
const { spawn } = require("child_process");
const NODE = process.execPath;
const CLI = "C:/Users/Administrator/AppData/Roaming/npm/node_modules/agent-browser/bin/agent-browser.js";

function run(args, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn(NODE, [CLI, ...args], { windowsHide: true });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    const t = setTimeout(() => { try { p.kill(); } catch (e) {} resolve({ code: "timeout", out, err }); }, timeoutMs || 60000);
    p.on("close", (code) => { clearTimeout(t); resolve({ code, out, err }); });
    p.on("error", (e) => { clearTimeout(t); resolve({ code: "spawnerr", out, err: e.message }); });
  });
}

(async () => {
  console.log("open about:blank ...");
  await run(["open", "about:blank"], 60000);
  await run(["eval", `
    window.__errs = [];
    window.addEventListener('error', function(e){ window.__errs.push('ERROR: ' + (e.message||e.type)); }, true);
    window.addEventListener('unhandledrejection', function(e){ window.__errs.push('REJECT: ' + String(e.reason).slice(0,200)); });
    'ok'
  `], 40000);

  console.log("open /admin/ ...");
  let r = await run(["open", "http://127.0.0.1:8899/admin/"], 100000);
  console.log("exit=" + r.code);

  for (const ms of [8000, 8000, 8000]) {
    console.log("wait " + ms + "ms ...");
    await new Promise((res) => setTimeout(res, ms));
  }

  const probe = `
    JSON.stringify({
      errs: (window.__errs||[]).slice(0,15),
      hasRoot: !!document.getElementById('nc-root'),
      rootChildren: document.getElementById('nc-root') ? document.getElementById('nc-root').children.length : -1,
      rootText: document.getElementById('nc-root') ? document.getElementById('nc-root').innerText.slice(0,400) : '',
      decapGlobal: typeof window.CMS,
      tipVisible: (function(){var t=document.getElementById('boot-tip'); return t? (t.style.display!=='none' && t.offsetParent!==null) : false;})(),
      tipText: (function(){var t=document.getElementById('boot-tip'); return t? t.innerText.slice(0,200):'';})()
    })
  `;
  r = await run(["eval", probe], 45000);
  console.log("\n=== 探测结果 ===");
  try {
    const j = JSON.parse(JSON.parse((r.out || "").trim()));
    console.log("hasRoot        :", j.hasRoot);
    console.log("rootChildren   :", j.rootChildren, j.rootChildren > 0 ? "✅ Decap 已渲染" : "❌ 仍为空");
    console.log("window.CMS     :", j.decapGlobal);
    console.log("tipVisible     :", j.tipVisible);
    console.log("rootText       :", j.rootText.slice(0, 300));
    console.log("错误           :", j.errs.length ? j.errs.join(" | ") : "(无)");
  } catch (e) {
    console.log("原始:", (r.out || "").slice(0, 1500));
    if (r.err) console.log("ERR:", r.err.slice(0, 300));
  }

  console.log("\nscreenshot ...");
  await run(["screenshot", "tools/admin-fixed.png"], 60000);
  await run(["close"], 20000);
  console.log("[done]");
})();
