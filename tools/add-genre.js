/* ============================================================
   小筑 · 给 GAMES 补 genre 字段（8 大类，供游戏墙类型筛选）
   ------------------------------------------------------------
   黑羽 2026-10-05 确认：合并成 8 大类，每页 24 条。
   用结构化解析 → 重新序列化，避免正则改文本出错。
   ============================================================ */

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const LIB = path.join(ROOT, "js/library.js");

const GENRE = {
  "God of War": "动作冒险",
  "DEATH STRANDING DIRECTOR'S CUT": "动作冒险",
  "黑神话：悟空": "角色扮演",
  "Slay the Spire": "策略经营",
  "Wallpaper Engine": "工具",
  "Lossless Scaling": "工具",
  "Neverness to Everness": "角色扮演",
  "Call of Duty Modern Warfare": "射击",
  "Crimson Desert Enhanced": "动作冒险",
  "Darkest Dungeon": "角色扮演",
  "Ready or Not": "射击",
  "It Takes Two": "独立游戏",
  "Resident Evil 2": "恐怖",
  "Cyberpunk 2077": "角色扮演",
  "FINAL FANTASY VII REBIRTH": "角色扮演",
  "Red Dead Redemption 2": "动作冒险",
  "Detroit: Become Human": "动作冒险",
  "eFootball": "体育竞技",
  "Where Winds Meet": "角色扮演",
  "Bongo Cat": "独立游戏",
  "Yakuza 0": "动作冒险",
  "Persona 5 Royal": "角色扮演",
  "Sultan's Game": "策略经营",
  "空の軌跡 the 1st Demo": "角色扮演",
  "Diablo IV": "角色扮演",
  "FINAL FANTASY XVI": "角色扮演",
  "The Witcher 3: Wild Hunt": "角色扮演",
  "Borderlands 3": "射击",
  "DAVE THE DIVER": "策略经营",
  "Metro Exodus": "射击",
  "Monster Hunter: World": "动作冒险",
  "The Last of Us Remastered": "动作冒险",
  "塞尔达传说：王国之泪": "动作冒险",
  "博德之门 3": "角色扮演",
  "星露谷物语": "策略经营",
  "DYNASTY WARRIORS: ORIGINS": "动作冒险",
  "Arknights: Endfield": "角色扮演",
  "DSX": "工具",
  "Live2DViewerEX": "工具",
  "足球经理 26（试玩版）": "策略经营",
  "Horizon Zero Dawn Remastered": "动作冒险",
  "Spacewar": "工具",
  "Delta Force": "射击",
  "Wuthering Waves": "角色扮演",
  "Zenless Zone Zero": "角色扮演",
  "Uncharted 4: A Thief’s End": "动作冒险",
  "Grand Theft Auto V Enhanced": "动作冒险",
  "The Last of Us Part I": "动作冒险",
  "Call of Duty": "射击",
  "艾尔登法环：黄金树幽影": "角色扮演",
};

let src = fs.readFileSync(LIB, "utf8");
const gStart = src.indexOf("const GAMES = [");
const gEnd = src.indexOf("\n];", gStart);
if (gStart < 0 || gEnd < 0) throw new Error("找不到 GAMES 数组");
let block = src.slice(gStart, gEnd + 3);

let hit = 0;
const miss = [];
Object.keys(GENRE).forEach(function (title) {
  const tIdx = block.indexOf('title: "' + title + '"');
  if (tIdx < 0) { miss.push(title); return; }
  let eIdx = block.indexOf("\n  },", tIdx);
  if (eIdx < 0) eIdx = block.length;
  let seg = block.slice(tIdx, eIdx);

  if (/genre:\s*"/.test(seg)) {
    seg = seg.replace(/genre:\s*"[^"]*",/, 'genre: "' + GENRE[title] + '",');
  } else {
    // 插到 type 字段之后（同一行内追加）
    seg = seg.replace(/(\n\s*type:\s*"[^"]*",)/, '$1\n    genre: "' + GENRE[title] + '",');
    if (!/genre:/.test(seg)) {
      // 兜底：插到 status 之前
      seg = seg.replace(/(\n\s*status:)/, '\n    genre: "' + GENRE[title] + '",$1');
    }
  }
  block = block.slice(0, tIdx) + seg + block.slice(eIdx);
  hit++;
});

src = src.slice(0, gStart) + block + src.slice(gEnd + 3);
fs.writeFileSync(LIB, src, "utf8");

console.log("genre 写入：" + hit + " 条");
if (miss.length) console.log("未匹配：" + miss.join(" / "));
