/* ============================================================
   小筑 · 阅读墙 & 影视墙 数据文件
   ------------------------------------------------------------
   ★ 如何添加/更新条目：修改下面的 READING（书/漫画）或
     MOVIES（电影/剧集）数组，或直接告诉墨鸦"《XX》读到xx%"
   ★ 字段说明（READING / MOVIES 通用）：
       title    标题（书名 / 片名）
       type     类型：READING 用「书 / 漫画」；MOVIES 用「电影 / 剧集」
       author   作者 / 导演（可省略）
       status   状态：
                  "reading" → 在读 / 在看
                  "done"    → 已读完 / 已看完
                  "wish"    → 想读 / 想看
       progress 进度：
                  READING 用数字表示百分比，如 42 表示读到 42%；
                  MOVIES 用文字表示，如 "S2E05" 或 " 看到 45 分钟"
                  （仅 status 为 reading 时显示进度条）
       rating   评分：0-5，支持 0.5（如 4.5），未评分填 0
       comment  一句话观后感 / 短评（可省略）
       cover    海报图片地址（相对路径，如 "posters/dune2.jpg"）。
                留空则显示渐变占位封面，之后拿到海报随时替换
       emoji    占位封面上的图标
   ============================================================ */

const READING = [
  {
    title: "夜航西飞",
    type: "书",
    author: "柏瑞尔·马卡姆",
    status: "reading",
    progress: 42,
    rating: 0,
    comment: "写非洲的夜空和飞行，句子干净得像被风洗过。",
    cover: "",
    emoji: "✈️",
  },
  {
    title: "编舟记",
    type: "书",
    author: "三浦紫苑",
    status: "reading",
    progress: 68,
    rating: 0,
    comment: "一群人花十五年编一本词典，慢得让人安心。",
    cover: "",
    emoji: "📖",
  },
  {
    title: "深海循光",
    type: "漫画",
    author: "",
    status: "reading",
    progress: 85,
    rating: 0,
    comment: "分镜和配色都很讲究，单行本收集中。",
    cover: "",
    emoji: "🌊",
  },
  {
    title: "我与地坛",
    type: "书",
    author: "史铁生",
    status: "done",
    progress: 100,
    rating: 5,
    comment: "重读第三遍。关于命运与母亲，常读常新。",
    cover: "",
    emoji: "🍁",
  },
  {
    title: "小王子",
    type: "书",
    author: "圣埃克苏佩里",
    status: "done",
    progress: 100,
    rating: 4.5,
    comment: "大人也应该每年读一次的书。",
    cover: "",
    emoji: "🦊",
  },
  {
    title: "日暮东邻",
    type: "漫画",
    author: "",
    status: "done",
    progress: 100,
    rating: 4,
    comment: "治愈系日常，结尾收得漂亮。",
    cover: "",
    emoji: "🏮",
  },
  {
    title: "走向静默",
    type: "书",
    author: "",
    status: "wish",
    progress: 0,
    rating: 0,
    comment: "朋友推荐的推理，排在下一本。",
    cover: "",
    emoji: "🔍",
  },
];

const MOVIES = [
  {
    title: "沙丘 2",
    type: "电影",
    author: "丹尼斯·维伦纽瓦",
    status: "done",
    progress: "",
    rating: 4.5,
    comment: "IMAX 影院看的，沙虫出场那一段值回票价。",
    cover: "",
    emoji: "🏜️",
  },
  {
    title: "漫长的季节",
    type: "剧集",
    author: "辛爽",
    status: "done",
    progress: "全 12 集",
    rating: 5,
    comment: "「往前看，别回头。」年度最佳，没有之一。",
    cover: "",
    emoji: "🌽",
    review: "changan-season-review",
  },
  {
    title: "良医",
    type: "剧集",
    author: "",
    status: "reading",
    progress: "S2E05",
    rating: 0,
    comment: "医疗剧下饭神器，就是节奏有点拖。",
    cover: "",
    emoji: "🏥",
  },
  {
    title: "你的名字。",
    type: "电影",
    author: "新海诚",
    status: "done",
    progress: "",
    rating: 4,
    comment: "隔了五年二刷，红绳的伏笔这次才看全。",
    cover: "",
    emoji: "☄️",
  },
  {
    title: "奥本海默",
    type: "电影",
    author: "克里斯托弗·诺兰",
    status: "wish",
    progress: "",
    rating: 0,
    comment: "一直没找到三个小时的完整时间。",
    cover: "",
    emoji: "☢️",
  },
];

/* ============================================================
   游戏墙数据
   ★ status 状态："playing" 在玩 / "done" 已通关 / "wish" 想玩
   ★ progress：数字=完成度百分比（显示进度条）；文字=游戏时长或关卡
   ★ 海报：cover 填 posters/ 下的本地图片路径（Steam 商店页海报
     由墨鸦抓取，暂无海报时显示渐变占位封面）
   ============================================================ */
const GAMES = [
  {
    title: "塞尔达传说：王国之泪",
    type: "游戏",
    author: "任天堂",
    status: "playing",
    progress: "神庙 96 / 152",
    rating: 5,
    comment: "152 个神庙慢慢清，攻略已整理成文。地表 120 + 天空 32。",
    cover: "img/cover-zelda_w.jpg",
    emoji: "🗺️",
    review: "zelda-shrine-guide",
  },
  {
    title: "博德之门 3",
    type: "游戏",
    author: "Larian Studios",
    status: "done",
    progress: "一周目 142 小时",
    rating: 5,
    comment: "年度游戏没有悬念。队友全员立体的 CRPG 天花板，二周目排队中。",
    cover: "posters/bg3.jpg",
    emoji: "🎲",
  },
  {
    title: "黑神话：悟空",
    type: "游戏",
    author: "游戏科学",
    status: "playing",
    progress: 55,
    rating: 0,
    comment: "第三章的黄风岭配乐封神。手残党在虎先锋面前卡了两晚上。",
    cover: "posters/wukong.jpg",
    emoji: "🐒",
  },
  {
    title: "星露谷物语",
    type: "游戏",
    author: "ConcernedApe",
    status: "done",
    progress: "三年目",
    rating: 4.5,
    comment: "电子布洛芬。压力大的时候回去种两天地，什么都好了。",
    cover: "posters/sdv.jpg",
    emoji: "🌾",
  },
  {
    title: "艾尔登法环：黄金树幽影",
    type: "游戏",
    author: "FromSoftware",
    status: "wish",
    progress: "",
    rating: 0,
    comment: "本体还没打通，DLC 先囤着。",
    cover: "",
    emoji: "🗡️",
  },
];

/* ============================================================
   「全文观后感」链接约定
   ------------------------------------------------------------
   READING / MOVIES / GAMES 任意条目加一个字段：
       review: "对应博文 POSTS 数组里的 id"
   卡片上就会自动出现「→ 全文观后感」链接，跳到 post.html。
   长篇感想写好发给我，我负责：① 登记为博客文章 ② 墙上挂链接。
   ============================================================ */
