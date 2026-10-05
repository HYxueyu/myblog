/**
 * cover 路径迁移：相对路径 → 绝对路径
 * ------------------------------------------------------------
 * 背景：media_folder 从 posters/ 改为 uploads/ 后，
 * public_folder 也跟着变成 /uploads。
 *
 * Decap 的路径解析（反编译自 vendor）：
 *   selectMediaFilePublicPath(value):
 *     if (isAbsolutePath(value)) return value;      // 以 / 开头 → 原样用
 *     return join(public_folder, basename(value));  // 否则被重算
 *
 * 现有数据是 "posters/steam-1593500.jpg"（相对），
 * 改 public_folder 后会被重算成 "/uploads/steam-1593500.jpg" → 图全挂。
 *
 * → 把值改成 "/posters/steam-1593500.jpg"（绝对），Decap 就原样使用，
 *   与 public_folder 彻底解耦，以后改 media_folder 也不受影响。
 *
 * 用法：
 *   node tools/migrate-cover-paths.js --dry    # 预览
 *   node tools/migrate-cover-paths.js          # 实际写入
 */
const fs = require("fs");
const path = require("path");

const DRY = process.argv.includes("--dry");
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const FILES = ["games.json", "reading.json", "films.json"];

// 前端读取时用的目录（这些目录必须真实存在）
const KNOWN_DIRS = ["posters", "img", "uploads"];

let totalChanged = 0;
const report = [];

for (const f of FILES) {
  const fp = path.join(DATA, f);
  const raw = fs.readFileSync(fp, "utf8");
  const json = JSON.parse(raw);
  const items = json.items || [];
  let changed = 0;
  const samples = [];

  for (const it of items) {
    const c = it.cover;
    if (!c || typeof c !== "string") continue;
    if (c.startsWith("/")) continue;            // 已是绝对路径
    if (/^https?:\/\//.test(c)) continue;      // 外链，跳过

    const next = "/" + c.replace(/^\.?\//, "");
    it.cover = next;
    changed++;
    if (samples.length < 3) samples.push(c + "  →  " + next);
  }

  if (changed > 0) {
    // 保持原格式（2 空格缩进）写回
    const out = JSON.stringify(json, null, 2) + "\n";
    if (!DRY) fs.writeFileSync(fp, out, "utf8");
    totalChanged += changed;
  }
  report.push({ file: f, total: items.length, changed, samples, wrote: !DRY && changed > 0 });
}

console.log("=".repeat(66));
console.log(DRY ? "  [预览模式] cover 路径迁移：相对 → 绝对" : "  cover 路径迁移：相对 → 绝对");
console.log("=".repeat(66));
for (const r of report) {
  console.log("\n" + r.file + "  （" + r.total + " 条，需改 " + r.changed + " 条）" + (r.wrote ? "  ✅ 已写入" : ""));
  r.samples.forEach((s) => console.log("    " + s));
}
console.log("\n共需修改: " + totalChanged + " 条" + (DRY ? "（未写入，加 --apply 生效）" : ""));

// 校验：所有 cover 指向的文件是否真实存在
console.log("\n" + "-".repeat(66));
console.log("  完整性校验：cover 指向的文件是否存在");
console.log("-".repeat(66));
let missing = 0, checked = 0;
for (const f of FILES) {
  const json = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
  for (const it of json.items || []) {
    const c = it.cover;
    if (!c || /^https?:\/\//.test(c)) continue;
    checked++;
    const rel = c.replace(/^\//, "");
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      missing++;
      console.log("  ✗ 缺失: " + c + "   (" + (it.title || "?") + " in " + f + ")");
    }
  }
}
console.log("\n  检查 " + checked + " 条封面，缺失 " + missing + " 条");
process.exit(missing > 0 ? 1 : 0);
