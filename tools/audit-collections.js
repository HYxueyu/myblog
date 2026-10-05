/**
 * 用 Decap 的真实配置解析逻辑，验证 config.yml 交给 Decap 后的结构
 * ------------------------------------------------------------
 * Decap 会 config.yml → 加载 → 生成 collection 列表。
 * 这里用同一份 js-yaml 解析，然后按 Decap 的规则推导：
 *   ① 每个 collection 的「列表页」会渲染成什么
 *   ② file collection 的 entries 是怎么构造的
 *   ③ 点进去后 list widget 会拿到什么
 *
 * 重点验证：items 字段的 list widget 配置是否能让 Decap 正确渲染条目列表
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

// 用项目里的 js-yaml（如果有），否则自己找
function loadYaml() {
  const cands = [
    path.join(ROOT, "node_modules", "js-yaml"),
    path.join(process.env.APPDATA || "", "npm", "node_modules", "js-yaml"),
  ];
  for (const c of cands) {
    try { return require(c); } catch (e) {}
  }
  try { return require("js-yaml"); } catch (e) {}
  return null;
}

const yaml = loadYaml();
if (!yaml) { console.log("❌ 找不到 js-yaml"); process.exit(1); }

const cfg = yaml.load(fs.readFileSync(path.join(ROOT, "admin", "config.yml"), "utf8"));

console.log("=".repeat(64));
console.log("  config.yml 交给 Decap 后的结构推演");
console.log("=".repeat(64));

let pass = 0, fail = 0;
const chk = (n, c, d) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (d ? "  → " + d : "")); } };

for (const col of cfg.collections) {
  console.log("\n─── 集合: " + col.label + " (" + col.name + ") ───");
  console.log("  description: " + JSON.stringify(col.description));
  chk("有 label（侧栏显示）", !!col.label);
  chk("有 description（顶部说明）", !!col.description);
  chk("是 files 类型集合", Array.isArray(col.files) && col.files.length > 0);

  for (const f of col.files || []) {
    console.log("  └ 文件卡片: " + f.label);
    console.log("      description : " + JSON.stringify(f.description));
    console.log("      file        : " + f.file);
    console.log("      format      : " + f.format);
    chk("卡片有 label", !!f.label);
    chk("卡片有 description（指引文字）", !!f.description);

    // 检查文件里的字段
    const fields = f.fields || [];
    const itemsField = fields.find((x) => x.name === "items");
    chk("有 items 字段", !!itemsField);
    if (itemsField) {
      chk("items 是 list widget", itemsField.widget === "list");
      console.log("      items.summary: " + JSON.stringify(itemsField.summary));
      chk("items 有 summary（列表行显示什么）", !!itemsField.summary);
      chk("items 有 fields（条目表单）", Array.isArray(itemsField.fields) && itemsField.fields.length > 0);
      if (itemsField.summary) {
        // 校验 summary 模板引用的字段都存在
        const refs = [...itemsField.summary.matchAll(/\{\{fields\.(\w+)\}\}/g)].map((m) => m[1]);
        const names = (itemsField.fields || []).map((x) => x.name);
        const missing = refs.filter((r) => !names.includes(r));
        chk("summary 引用的字段都存在 (" + refs.join(", ") + ")", missing.length === 0,
          "缺失: " + missing.join(", "));
      }
    }
  }
}

// 全局检查
console.log("\n─── 全局 ───");
chk("media_folder 存在", !!cfg.media_folder);
chk("public_folder 存在", !!cfg.public_folder);
chk("backend.base_url 无路径", /^https?:\/\/[^/]+$/.test(cfg.backend.base_url), cfg.backend.base_url);
chk("backend.site_domain = base_url 主机名",
  cfg.backend.site_domain === new URL(cfg.backend.base_url).host, cfg.backend.site_domain);

console.log("\n" + "=".repeat(64));
console.log("  通过 " + pass + " / 失败 " + fail);
console.log("=".repeat(64));
process.exit(fail === 0 ? 0 : 1);
