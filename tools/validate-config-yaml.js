/* 用权威 YAML 解析器（js-yaml，Decap CMS 内部同款依赖）校验 admin/config.yml
   取代自写的 parse-config.js —— 不再造轮子，验证结果才可信 */
const fs = require("fs");
const path = require("path");

let yaml;
try {
  yaml = require("C:/Users/Administrator/node_modules/js-yaml");
} catch (e) {
  console.log("无法加载 js-yaml:", e.message);
  process.exit(1);
}

const file = path.join(__dirname, "..", "admin", "config.yml");
const raw = fs.readFileSync(file, "utf8");

let doc;
try {
  doc = yaml.load(raw);
  console.log("✅ YAML 语法解析通过（js-yaml）");
} catch (e) {
  console.log("❌ YAML 语法错误:", e.message);
  process.exit(1);
}

const need = (cond, msg) => {
  console.log((cond ? "  ✅ " : "  ❌ ") + msg);
  return cond;
};

let ok = true;

console.log("\n=== 后端 ===");
ok &= need(doc.backend && doc.backend.name === "github", "backend.name = github");
ok &= need(!!(doc.backend && doc.backend.repo), "backend.repo = " + (doc.backend && doc.backend.repo));
ok &= need(!!(doc.backend && doc.backend.branch), "backend.branch = " + (doc.backend && doc.backend.branch));
ok &= need(!!(doc.backend && doc.backend.base_url), "backend.base_url = " + (doc.backend && doc.backend.base_url));
ok &= need(!!(doc.backend && doc.backend.auth_endpoint), "backend.auth_endpoint = " + (doc.backend && doc.backend.auth_endpoint));

console.log("\n=== 全局 ===");
// uploads/ = 自己上传的图；posters/ = 脚本刮削的封面，两者必须隔离
ok &= need(doc.media_folder === "uploads", "media_folder = " + doc.media_folder + " (期望 uploads)");
ok &= need(doc.public_folder === "/uploads", "public_folder = " + doc.public_folder + " (期望 /uploads)");
ok &= need(doc.locale === "zh_Hans", "locale = " + doc.locale);
ok &= need(doc.publish_mode === "simple", "publish_mode = " + doc.publish_mode);

console.log("\n=== collections ===");
const cols = doc.collections;
ok &= need(Array.isArray(cols), "collections 是数组（数量 " + (Array.isArray(cols) ? cols.length : typeof cols) + "）");

const expected = [
  { name: "games", file: "data/games.json", kind: "game" },
  { name: "reading", file: "data/reading.json", kind: "reading" },
  { name: "films", file: "data/films.json", kind: "film" },
];

if (Array.isArray(cols)) {
  for (const exp of expected) {
    const c = cols.find((x) => x.name === exp.name);
    console.log("\n[" + exp.name + "]");
    if (!c) { console.log("  ❌ 缺失"); ok = false; continue; }
    ok &= need(!!c.label, "label = " + c.label);
    const f = (c.files || [])[0];
    ok &= need(!!f, "files[0] 存在");
    if (!f) { ok = false; continue; }
    ok &= need(f.file === exp.file, "file = " + f.file + " (期望 " + exp.file + ")");
    ok &= need(f.format === "json", "format = " + f.format);

    const fields = f.fields || [];
    const kindField = fields.find((x) => x.name === "kind");
    ok &= need(!!kindField && kindField.widget === "hidden", "kind 字段 = hidden 且 default=" + (kindField && kindField.default));
    ok &= need(!!kindField && kindField.default === exp.kind, "kind.default = " + exp.kind);

    const listField = fields.find((x) => x.name === "items");
    ok &= need(!!listField && listField.widget === "list", "items 是 list widget");
    if (listField) {
      const sub = (listField.fields || []).map((x) => x.name);
      console.log("    条目字段(" + sub.length + "): " + sub.join(", "));
      ok &= need(sub.includes("title"), "含 title 字段");
      ok &= need(sub.includes("cover"), "含 cover 字段（封面可上传）");
      ok &= need(sub.includes("comment"), "含 comment 字段");
    } else ok = false;
  }
}

console.log("\n" + (ok ? "✅✅ config.yml 完全正确，Decap 可正常读取三个 collection" : "❌ 存在上述问题"));
process.exit(ok ? 0 : 1);
