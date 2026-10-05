/* 对比迁移前后：备份的原 library.js vs 由 JSON 生成的新 library.js
   逐条逐字段比对，有任何差异都报出来 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function load(file) {
  const src = fs.readFileSync(path.join(root, "js", file), "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  vm.runInContext("this.G = GAMES; this.R = READING; this.M = MOVIES;", ctx);
  return { G: ctx.G || [], R: ctx.R || [], M: ctx.M || [] };
}

const before = load("library.before-migration.js");
const after = load("library.js");

let diff = 0;

function cmp(label, a, b) {
  console.log("\n=== " + label + " ===  " + a.length + " vs " + b.length);
  if (a.length !== b.length) {
    console.log("  ❌ 条数不同！");
    diff++;
  }
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || {};
    const y = b[i] || {};
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) {
      const va = x[k];
      const vb = y[k];
      // 空字符串 / undefined 视为等价
      const ea = va === undefined || va === "";
      const eb = vb === undefined || vb === "";
      if (ea && eb) continue;
      if (String(va) !== String(vb)) {
        console.log("  ❌ [" + i + "] " + (x.title || "?") + " 字段 " + k + ": " + JSON.stringify(va) + " → " + JSON.stringify(vb));
        diff++;
      }
    }
  }
  if (diff === 0) console.log("  ✅ 完全一致");
}

cmp("GAMES", before.G, after.G);
cmp("READING", before.R, after.R);
cmp("MOVIES", before.M, after.M);

console.log("\n===== 结论：" + (diff === 0 ? "✅ 数据完全等价，可安全迁移" : "❌ 有 " + diff + " 处差异，需检查") + " =====");
