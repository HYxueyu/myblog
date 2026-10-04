/* ============================================================
   小筑 · 把封面写进 library.js + 合并 Exophase 游戏记录
   ------------------------------------------------------------
   一次性执行：node tools/apply-covers-and-games.js
   ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LIB = path.join(ROOT, "js/library.js");

/* ---------- ① 读取封面清单 ---------- */
const covers = JSON.parse(
  fs.readFileSync(path.join(__dirname, "cover-result.json"), "utf8")
);

/* ---------- ② 读取 library.js 里的 READING 数组 ---------- */
let src = fs.readFileSync(LIB, "utf8");

// 提取 READING 数组文本
const rStart = src.indexOf("const READING = [");
const rEnd = src.indexOf("\n];", rStart);
if (rStart < 0 || rEnd < 0) throw new Error("找不到 READING 数组");
let readingText = src.slice(rStart, rEnd + 3);

// 逐条替换 cover: "", → cover: "xxx"
let hit = 0,
  miss = [];
for (const key of Object.keys(covers)) {
  const c = covers[key];
  // 定位该条目的 title 行
  const tIdx = readingText.indexOf('title: "' + key + '"');
  if (tIdx < 0) {
    miss.push(key);
    continue;
  }
  // 从 title 位置往后找第一个 cover: ""
  const cIdx = readingText.indexOf('cover: "",', tIdx);
  if (cIdx < 0) {
    miss.push(key + "（cover 已非空或格式不同）");
    continue;
  }
  readingText =
    readingText.slice(0, cIdx) +
    'cover: "' + c.cover + '",' +
    readingText.slice(cIdx + 'cover: "",'.length);
  hit++;
}
console.log("READING 封面写入：" + hit + " 条");
if (miss.length) console.log("  未匹配：" + miss.join(" / "));

src = src.slice(0, rStart) + readingText + src.slice(rEnd + 3);

/* ---------- ③ 合并游戏记录 ---------- */
// 加载刮削数据
const genSrc = fs.readFileSync(
  path.join(ROOT, "js/library.generated.js"),
  "utf8"
);
const genBody = genSrc.slice(genSrc.indexOf("const GAMES_SCRAPED = ["));
const GAMES_SCRAPED = eval(genBody + "; GAMES_SCRAPED");

// 保留手写短评的三条（按标题模糊对应刮削条目）
const HANDWRITTEN = {
  "Baldur's Gate 3": {
    title: "博德之门 3",
    author: "Larian Studios",
    status: "done",
    rating: 5,
    comment:
      "年度游戏没有悬念。队友全员立体的 CRPG 天花板，二周目排队中。",
    emoji: "🎲",
  },
  "Black Myth: Wukong": {
    title: "黑神话：悟空",
    author: "游戏科学",
    status: "playing",
    rating: 0,
    comment: "第三章的黄风岭配乐封神。手残党在虎先锋面前卡了两晚上。",
    emoji: "🐒",
  },
  "Stardew Valley": {
    title: "星露谷物语",
    author: "ConcernedApe",
    status: "done",
    rating: 4.5,
    comment: "电子布洛芬。压力大的时候回去种两天地，什么都好了。",
    emoji: "🌾",
  },
};

// 平台 + 时长 → 更可读的 progress
function buildProgress(g) {
  const c = g.comment || "";
  const hoursM = c.match(/累计 ([\d.]+) 小时/);
  const pctM = c.match(/成就 \d+\/\d+（(\d+)%）/);
  const recentM = c.match(/最近 ([\d-]+)/);
  const hours = hoursM ? parseFloat(hoursM[1]) : 0;
  const pct = pctM ? parseInt(pctM[1], 10) : null;
  const recent = recentM ? recentM[1] : "";

  const bits = [];
  if (hours >= 0.1) bits.push(hours + " 小时");
  if (recent) bits.push("最近 " + recent);
  return { hours, pct, recent, text: bits.join(" · ") };
}

const games = [];
const seen = new Set();

for (const g of GAMES_SCRAPED) {
  const hw = HANDWRITTEN[g.title];
  const p = buildProgress(g);
  // 去重：同名 + 同平台只留一条
  const dedupKey = g.title + "|" + (g.platform || "");
  if (seen.has(dedupKey)) continue;
  seen.add(dedupKey);

  const entry = {
    title: hw ? hw.title : g.title,
    type: "游戏",
    author: hw ? hw.author : g.author || "",
    platform: g.platform || "",
    status: hw ? hw.status : g.status,
    progress: p.text || g.progress || "",
    rating: hw ? hw.rating : 0,
    comment: hw ? hw.comment : "",
    cover: g.cover || "",
    emoji: hw ? hw.emoji : g.emoji || "🎮",
  };
  // 全成就的自动标已通关
  if (!hw && g.status === "playing" && p.pct === 100) entry.status = "done";
  games.push(entry);
}

// 保留手写但没刮到的：艾尔登法环 DLC
games.push({
  title: "艾尔登法环：黄金树幽影",
  type: "游戏",
  author: "FromSoftware",
  platform: "PS5",
  status: "wish",
  progress: "",
  rating: 0,
  comment: "本体还没打通，DLC 先囤着。",
  cover: "",
  emoji: "🗡️",
});

// 塞尔达（不在 Exophase 记录里，保留原条目含文章链接）
games.push({
  title: "塞尔达传说：王国之泪",
  type: "游戏",
  author: "任天堂",
  platform: "Switch",
  status: "playing",
  progress: "神庙 96 / 152",
  rating: 5,
  comment: "152 个神庙慢慢清，攻略已整理成文。地表 120 + 天空 32。",
  cover: "img/cover-zelda_w.jpg",
  emoji: "🗺️",
  review: "zelda-shrine-guide",
});

/* ---------- ④ 序列化 GAMES ---------- */
function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function fmtEntry(g) {
  const lines = ["  {"];
  const order = [
    "title",
    "type",
    "author",
    "platform",
    "status",
    "progress",
    "rating",
    "comment",
    "cover",
    "emoji",
    "review",
  ];
  for (const k of order) {
    if (g[k] === undefined || g[k] === null || g[k] === "") continue;
    const v = g[k];
    lines.push(
      "    " + k + ": " + (typeof v === "number" ? v : '"' + esc(v) + '"') + ","
    );
  }
  lines.push("  },");
  return lines.join("\n");
}

const gamesBlock = [
  "/* ============================================================",
  "   游戏墙数据",
  "   ★ 数据来源：Exophase 自动刮削（tools/scrape-exophase.js）",
  "   ★ status：「playing」在玩 / 「done」已通关 / 「wish」想玩",
  "   ★ progress：数字=完成度百分比（显示进度条）；文字=时长/关卡",
  "   ★ platform：Steam / PS5 / PS4 / Switch（显示在卡片上）",
  "   ★ 手写短评优先，刮削只补时长和封面",
  "   ============================================================ */",
  "const GAMES = [",
  ...games.map(fmtEntry),
  "];",
].join("\n");

// 替换旧 GAMES 块
const gStart = src.indexOf("/* ============================================================\n   游戏墙数据");
const gEndMarker = "\n];";
const gEnd = src.indexOf(gEndMarker, src.indexOf("const GAMES = ["));
if (gStart < 0 || gEnd < 0) throw new Error("找不到 GAMES 数组");
src = src.slice(0, gStart) + gamesBlock + src.slice(gEnd + gEndMarker.length);

fs.writeFileSync(LIB, src, "utf8");

console.log("\nGAMES 合并完成：" + games.length + " 条");
const stat = { playing: 0, done: 0, wish: 0 };
games.forEach((g) => stat[g.status] !== undefined && stat[g.status]++);
console.log("  在玩 " + stat.playing + " / 已通关 " + stat.done + " / 想玩 " + stat.wish);
console.log("  有封面 " + games.filter((g) => g.cover).length + " 条");
console.log("\n已写入 " + LIB);
