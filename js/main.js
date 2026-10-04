/* ============================================================
   小筑 · 页面渲染脚本
   负责读取 posts.js 数据并渲染：文章卡片、照片墙、视频卡片、
   文章详情页，以及页头导航的移动端交互。
   ============================================================ */

/* ---------- 明暗模式 ---------- */

const THEME_KEY = "xiaozhu-theme";

// 读取当前应该用的主题：用户手动选过就用选的，否则跟随系统
function preferredTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

// 应用主题到 <html>，并同步所有切换按钮的图标与文字
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll(".theme-toggle").forEach(function (btn) {
    const light = theme === "light";
    btn.querySelector(".theme-icon").textContent = light ? "☀️" : "🌙";
    btn.querySelector(".theme-text").textContent = light ? "日间" : "夜间";
    btn.setAttribute("aria-label", light ? "切换到夜间模式" : "切换到日间模式");
  });
}

// 在侧边栏底部与移动端顶栏插入切换按钮
function initThemeToggle() {
  function makeBtn() {
    return '<button class="theme-toggle" type="button">' +
      '<span class="theme-icon">🌙</span><span class="theme-text">夜间</span></button>';
  }
  const side = document.querySelector(".side-foot");
  if (side) side.insertAdjacentHTML("afterbegin", makeBtn());
  const top = document.querySelector(".topbar");
  if (top) top.insertAdjacentHTML("beforeend", makeBtn());

  document.querySelectorAll(".theme-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 隐私模式下忽略 */ }
      applyTheme(next);
    });
  });

  applyTheme(preferredTheme());

  // 没手动选过时，系统主题变了就跟着变
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
      let saved = null;
      try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
      if (saved === "light" || saved === "dark") return;   // 用户手动选过就不自动改
      applyTheme(preferredTheme());
    });
  }
}

/* ---------- 工具函数 ---------- */

// 格式化日期：2026-09-06 → 2026年9月6日
function formatDate(str) {
  const parts = str.split("-");
  return parts[0] + " 年 " + parseInt(parts[1], 10) + " 月 " + parseInt(parts[2], 10) + " 日";
}

// 生成文章封面 HTML：优先使用图片，否则显示 emoji 渐变占位
function coverHTML(post) {
  if (post.coverImg) {
    return '<div class="post-cover" style="padding:0;align-items:stretch">' +
      '<img src="' + post.coverImg + '" alt="' + post.title + ' 封面图" style="width:100%;height:100%;object-fit:cover"></div>';
  }
  // 占位封面：样式写在 CSS 的 .post-cover.ph 里，明暗模式自动切换
  return '<div class="post-cover ph"><span>' + post.emoji + "</span></div>";
}

// 生成单张文章卡片 HTML
function postCardHTML(post) {
  return '' +
    '<a class="post-card" href="post.html?id=' + post.id + '">' +
      coverHTML(post) +
      '<div class="post-body">' +
        '<div class="post-meta"><span class="cat">' + post.category + "</span>" + formatDate(post.date) + "</div>" +
        "<h3>" + post.title + "</h3>" +
        "<p>" + post.summary + "</p>" +
      "</div>" +
    "</a>";
}

// 渲染文章卡片列表到指定容器
function renderPosts(container, list) {
  if (!container) return;
  if (!list || list.length === 0) {
    container.innerHTML = '<p class="empty-tip">这里还空空的，第一篇文章正在路上 ✍️</p>';
    return;
  }
  container.innerHTML = list.map(postCardHTML).join("");
}

/* ---------- 阅读墙 & 影视墙渲染 ---------- */

// 状态标签配置：key → 显示文字 + 样式类名
const SHELF_STATUS = {
  reading: { label: "在读", cls: "badge-reading" },
  watching: { label: "在看", cls: "badge-reading" },
  playing: { label: "在玩", cls: "badge-reading" },
  done: { label: "已读完", cls: "badge-done" },
  wish: { label: "想读", cls: "badge-wish" },
};

// 各类墙的分组标题：ing=进行中 / done=已完成 / wish=计划中
const SHELF_LABELS = {
  reading: { ing: "正在读", done: "已读完", wish: "想读清单" },
  film:    { ing: "在看",   done: "已看完", wish: "想看片单" },
  game:    { ing: "在玩",   done: "已通关", wish: "愿望单" },
};

// 生成星级 HTML（支持 0.5 分，用半星表示）
function starsHTML(rating) {
  if (!rating || rating <= 0) return "";
  let stars = "";
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) stars += "★";
    else if (rating >= i - 0.5) stars += "⯨"; // 半星字符
    else stars += "☆";
  }
  return '<div class="shelf-stars" aria-label="评分 ' + rating + ' 星">' + stars + "</div>";
}

// 生成占位封面（渐变底 + emoji + 标题）或真实封面
// 支持「海报」{ src, ratio } 与「横幅」{ src, banner: true } 两种写法：
//   cover: { src: "posters/bg3-poster.jpg", ratio: "2/3" }
//   cover: { src: "posters/bg3-header.jpg", banner: true }
// 旧的字符串写法（cover: "posters/xx.jpg"）仍然兼容，按 2:3 竖版处理。
function coverOf(item) {
  const c = item.cover;
  if (!c) return null;
  return typeof c === "string" ? { src: c, banner: false } : { src: c.src, banner: !!c.banner };
}

function posterHTML(item, emojiFallback) {
  const c = coverOf(item);
  if (c && c.src) {
    const cls = "shelf-cover" + (c.banner ? " is-wide" : "");
    return '<div class="' + cls + '"><img src="' + c.src + '" alt="' +
      item.type + "封面 · " + item.title + '" loading="lazy"></div>';
  }
  // 占位封面：样式写在 CSS 的 .shelf-cover.ph 里，明暗模式自动切换
  return '<div class="shelf-cover ph">' +
    '<span class="shelf-cover-emoji">' + (item.emoji || emojiFallback) + "</span>" +
    '<span class="shelf-cover-title">' + item.title + "</span></div>";
}

// 生成一个条目卡片（阅读墙与影视墙共用结构）
function shelfCardHTML(item, defaultEmoji) {
  let extra = "";

  // 在玩/在看/在读：显示进度（游戏与阅读用百分比条，剧集用文字进度）
  if (item.status === "reading" || item.status === "watching" || item.status === "playing") {
    if (typeof item.progress === "number") {
      extra += '<div class="shelf-progress"><div class="shelf-progress-bar" style="width:' +
        Math.min(item.progress, 100) + '%"></div></div>' +
        '<div class="shelf-progress-text">' +
        (item.status === "playing" ? "完成度 " : "读到 ") + item.progress + "%</div>";
    } else if (item.progress) {
      extra += '<div class="shelf-progress-text">' +
        (item.status === "playing" ? "游戏时长 " : "看到 ") + item.progress + "</div>";
    }
  } else if (item.status === "done" && item.progress && item.type !== "书" && item.type !== "漫画") {
    extra += '<div class="shelf-progress-text">' + item.progress + "</div>";
  }

  // 状态标签（想读/想看/想玩不显示进度）
  const st = SHELF_STATUS[item.status] || SHELF_STATUS.wish;

  return '<article class="shelf-card">' +
    '<div class="shelf-cover-wrap">' +
      posterHTML(item, defaultEmoji) +
      '<span class="shelf-badge ' + st.cls + '">' + st.label + "</span>" +
    "</div>" +
    '<div class="shelf-info">' +
      "<h3>" + item.title + "</h3>" +
      '<div class="shelf-meta">' + item.type +
        (item.author ? " · " + item.author : "") +
      "</div>" +
      starsHTML(item.rating) +
      extra +
      (item.comment ? '<p class="shelf-comment">' + item.comment + "</p>" : "") +
      // 长篇观后感：跳转到独立博文
      (item.review ? '<a class="shelf-review-link" href="post.html?id=' + item.review + '">→ 全文观后感</a>' : "") +
    "</div>" +
  "</article>";
}

// 把条目按状态分组渲染：进行中 / 已完成 / 计划中
function renderShelf(container, items, defaultEmoji, labels) {
  if (!container) return;
  labels = labels || SHELF_LABELS.reading;
  const groups = [
    { key: "reading", heading: labels.ing },
    { key: "watching", heading: labels.ing },
    { key: "playing", heading: labels.ing },
    { key: "done", heading: labels.done },
    { key: "wish", heading: labels.wish },
  ];
  let html = "";
  groups.forEach(function (g) {
    const list = items.filter(function (it) { return it.status === g.key; });
    if (list.length === 0) return;
    html += '<h2 class="shelf-group-title">' + g.heading + "（" + list.length + "）</h2>";
    html += '<div class="shelf-grid">' +
      list.map(function (it) { return shelfCardHTML(it, defaultEmoji); }).join("") +
      "</div>";
  });
  container.innerHTML = html || '<p class="empty-tip">这里还空着，第一条记录正在路上 📚</p>';
}

/* ---------- 音乐播放器（底部悬浮播放条 + 音乐页歌单） ---------- */

// 取有音源的歌曲；全局保存当前播放器，供音乐页点歌复用
let MUSIC_PLAYER = null;

// 初始化底部播放条：至少一首可播放的歌才显示
function initMusicPlayer() {
  const bar = document.getElementById("player-bar");
  if (!bar) return null;

  const songs = (typeof MUSIC !== "undefined" ? MUSIC : []).filter(function (s) { return s.src; });
  if (songs.length === 0) { bar.remove(); return null; }

  document.body.classList.add("has-player");   // 给页面底部留出空间
  let index = 0;
  const audio = new Audio(songs[index].src);

  bar.innerHTML =
    '<div class="player-inner">' +
      '<button class="player-btn" id="player-prev" aria-label="上一首">⏮</button>' +
      '<button class="player-btn player-toggle" id="player-toggle" aria-label="播放/暂停">▶</button>' +
      '<button class="player-btn" id="player-next" aria-label="下一首">⏭</button>' +
      '<div class="player-info">' +
        '<span class="player-title" id="player-title"></span>' +
        '<span class="player-artist" id="player-artist"></span>' +
      "</div>" +
      '<div class="player-progress" id="player-progress" role="slider" aria-label="播放进度">' +
        '<div class="player-progress-fill" id="player-fill"></div>' +
      "</div>" +
      '<a class="player-link" href="music.html">歌单</a>' +
    "</div>";

  const toggleBtn = bar.querySelector("#player-toggle");
  const titleEl = bar.querySelector("#player-title");
  const artistEl = bar.querySelector("#player-artist");
  const fillEl = bar.querySelector("#player-fill");

  // 载入指定序号的歌曲
  function loadSong(i) {
    index = (i + songs.length) % songs.length;
    audio.src = songs[index].src;
    titleEl.textContent = songs[index].title;
    artistEl.textContent = songs[index].artist || "";
    fillEl.style.width = "0%";
  }

  // 播放 / 暂停切换
  function togglePlay() {
    if (audio.paused) { audio.play(); toggleBtn.textContent = "⏸"; }
    else { audio.pause(); toggleBtn.textContent = "▶"; }
  }

  toggleBtn.addEventListener("click", togglePlay);
  bar.querySelector("#player-prev").addEventListener("click", function () {
    loadSong(index - 1); audio.play(); toggleBtn.textContent = "⏸";
  });
  bar.querySelector("#player-next").addEventListener("click", function () {
    loadSong(index + 1); audio.play(); toggleBtn.textContent = "⏸";
  });

  // 进度条：点击跳转
  bar.querySelector("#player-progress").addEventListener("click", function (e) {
    const rect = this.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  });

  // 播放中更新进度
  audio.addEventListener("timeupdate", function () {
    if (!audio.duration) return;
    fillEl.style.width = (audio.currentTime / audio.duration * 100) + "%";
  });

  // 播完自动下一首
  audio.addEventListener("ended", function () { loadSong(index + 1); audio.play(); });

  loadSong(0);
  MUSIC_PLAYER = {
    songs: songs,
    play: function (i) { loadSong(i); audio.play(); toggleBtn.textContent = "⏸"; },
  };
  return MUSIC_PLAYER;
}

// 渲染音乐页歌单
function renderMusicList(container) {
  if (!container) return;
  const songs = typeof MUSIC !== "undefined" ? MUSIC : [];
  if (songs.length === 0) {
    container.innerHTML = '<p class="empty-tip">歌单还是空的 🎵</p>';
    return;
  }
  container.innerHTML = songs.map(function (s, i) {
    const ready = !!s.src;
    return '<div class="music-item' + (ready ? "" : " music-item-disabled") + '" data-index="' + i + '">' +
      '<div class="music-cover"' + (s.cover ? ' style="background-image:url(' + s.cover + ');background-size:cover"' : "") + ">" +
        (s.cover ? "" : '<span>🎵</span>') +
      "</div>" +
      '<div class="music-meta"><h3>' + s.title + "</h3><p>" + (s.artist || "") + "</p></div>" +
      '<span class="music-status">' + (ready ? "播放" : "待补充") + "</span>" +
    "</div>";
  }).join("");

  // 点击可播放的歌曲 → 交给底部播放条播放
  container.querySelectorAll(".music-item").forEach(function (el) {
    el.addEventListener("click", function () {
      const i = parseInt(el.getAttribute("data-index"), 10);
      const s = songs[i];
      if (!s.src) return;
      if (MUSIC_PLAYER) MUSIC_PLAYER.play(MUSIC_PLAYER.songs.indexOf(s));
    });
  });
}

/* ---------- 各页面渲染入口 ---------- */
document.addEventListener("DOMContentLoaded", function () {
  // 明暗模式开关
  initThemeToggle();

  // 移动端汉堡菜单开关
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
    });
  }

  // ---- 首页：最新 3 篇 ----
  const homeList = document.getElementById("latest-posts");
  if (homeList) renderPosts(homeList, POSTS.slice(0, 3));

  // ---- 首页：照片墙预览（取所有相册里最新的 4 张） ----
  const homePhotos = document.getElementById("home-gallery");
  if (homePhotos) renderGallery(homePhotos, allPhotos().slice(0, 4));

  // ---- 音乐：底部播放条（全站）+ 音乐页歌单 ----
  initMusicPlayer();
  const musicList = document.getElementById("music-list");
  if (musicList) {
    renderMusicList(musicList);
    document.title = "音乐 · 小筑";
  }

  // ---- 阅读墙页（数据在 js/library.js 的 READING 数组） ----
  const shelfBox = document.getElementById("reading-shelf");
  if (shelfBox) {
    renderShelf(shelfBox, READING, "📚", SHELF_LABELS.reading);
    document.title = "阅读墙 · 小筑";
  }

  // ---- 影视墙页（数据在 js/library.js 的 MOVIES 数组） ----
  const filmBox = document.getElementById("film-shelf");
  if (filmBox) {
    renderShelf(filmBox, MOVIES, "🎬", SHELF_LABELS.film);
    document.title = "影视墙 · 小筑";
  }

  // ---- 游戏墙页（数据在 js/library.js 的 GAMES 数组） ----
  const gameBox = document.getElementById("game-shelf");
  if (gameBox) {
    renderShelf(gameBox, GAMES, "🎮", SHELF_LABELS.game);
    document.title = "游戏墙 · 小筑";
  }

  // ---- 日志列表页：分类筛选 ----
  const blogList = document.getElementById("blog-list");
  if (blogList) {
    const allCats = ["全部"].concat(Array.from(new Set(POSTS.map(function (p) { return p.category; }))));
    const bar = document.getElementById("filter-bar");

    // 生成筛选按钮
    allCats.forEach(function (cat, i) {
      const btn = document.createElement("button");
      btn.className = "filter-btn" + (i === 0 ? " active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", function () {
        bar.querySelectorAll(".filter-btn").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        renderPosts(blogList, cat === "全部" ? POSTS : POSTS.filter(function (p) { return p.category === cat; }));
      });
      bar.appendChild(btn);
    });

    renderPosts(blogList, POSTS);
  }

  // ---- 文章详情页：根据 URL 参数 ?id=xxx 渲染 ----
  const articleBox = document.getElementById("article");
  if (articleBox) {
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const post = POSTS.find(function (p) { return p.id === id; }) || POSTS[0];
    document.title = post.title + " · 小筑";

    articleBox.innerHTML =
      '<div class="article-head">' +
        '<span class="cat-tag">' + post.category + "</span>" +
        "<h1>" + post.title + "</h1>" +
        '<div class="article-meta">' + formatDate(post.date) +
          (post.tags && post.tags.length ? " · " + post.tags.map(function (t) { return "#" + t; }).join(" ") : "") +
        "</div>" +
      "</div>" +
      '<div class="article-content">' + post.content + "</div>" +
      '<a class="back-link" href="blog.html">← 返回日志列表</a>';

    // 评论区：仅在 js/config.js 填了 Twikoo 后端地址时加载
    if (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG.twikooEnvId) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/twikoo@1.6.44/dist/twikoo.min.js";
      script.onload = function () {
        twikoo.init({
          envId: SITE_CONFIG.twikooEnvId,
          el: "#twikoo",
          path: "post.html?id=" + post.id,   // 每篇文章独立的评论路径
          lang: "zh-CN",
        });
      };
      document.body.appendChild(script);
    }
  }

  // ---- 相册页（按相册分组，点击图片放大） ----
  const albumBox = document.getElementById("album-list");
  if (albumBox) renderAlbums(albumBox);

  // ---- Vlog 页 ----
  const videoGrid = document.getElementById("video-grid");
  if (videoGrid) {
    videoGrid.innerHTML = VIDEOS.map(function (v) {
      const frame = v.embed
        ? '<iframe src="' + v.embed + '" title="' + v.title + '" allowfullscreen loading="lazy"></iframe>'
        : '<div class="video-frame">🎬 视频占位框<br><small>在 js/posts.js 的 VIDEOS 中填入嵌入地址即可播放</small></div>';
      return '<article class="video-card"><div class="video-frame-wrap">' + frame + "</div>" +
        '<div class="video-info"><h3>' + v.title + '</h3><div class="video-meta">' + v.meta + "</div></div></article>";
    }).join("");
  }
});

/* ---------- 照片 / 相册 / 灯箱 ---------- */

// 所有相册的照片摊平成一个列表（首页预览、灯箱翻页用）
function allPhotos() {
  const albums = typeof ALBUMS !== "undefined" ? ALBUMS : [];
  const flat = [];
  albums.forEach(function (a) {
    a.photos.forEach(function (p) { flat.push({ src: p.src, caption: p.caption, album: a.name }); });
  });
  return flat;
}

// 单张照片的 figure 结构（有图可点击放大，无图显示占位）
function photoFigureHTML(p) {
  const inner = p.src
    ? '<img src="' + p.src + '" alt="' + p.caption + '" loading="lazy" style="width:100%;height:100%;object-fit:cover">'
    : '<div class="photo-placeholder">📷</div>';
  return '<figure class="photo-item" data-src="' + (p.src || "") + '" data-caption="' + p.caption + '">' +
    inner + "<figcaption>" + p.caption + "</figcaption></figure>";
}

// 灯箱（点击图片放大查看）
let LB_EL = null, LB_LIST = [], LB_IDX = 0;

function ensureLightbox() {
  if (LB_EL) return;
  LB_EL = document.createElement("div");
  LB_EL.className = "lightbox";
  LB_EL.innerHTML =
    '<button class="lb-btn lb-close" aria-label="关闭">✕</button>' +
    '<button class="lb-btn lb-prev" aria-label="上一张">‹</button>' +
    '<img alt="">' +
    '<div class="lb-caption"></div>' +
    '<button class="lb-btn lb-next" aria-label="下一张">›</button>';
  document.body.appendChild(LB_EL);
  // 点空白处或 ✕ 关闭；‹ › 翻页；键盘 Esc / 方向键同样可控
  LB_EL.addEventListener("click", function (e) {
    if (e.target === LB_EL || e.target.classList.contains("lb-close")) LB_EL.classList.remove("open");
  });
  LB_EL.querySelector(".lb-prev").addEventListener("click", function () { stepLightbox(-1); });
  LB_EL.querySelector(".lb-next").addEventListener("click", function () { stepLightbox(1); });
  document.addEventListener("keydown", function (e) {
    if (!LB_EL.classList.contains("open")) return;
    if (e.key === "Escape") LB_EL.classList.remove("open");
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
  });
}

function openLightbox(list, i) {
  ensureLightbox();
  LB_LIST = list; LB_IDX = i;
  showLightbox();
  LB_EL.classList.add("open");
}

function showLightbox() {
  const p = LB_LIST[LB_IDX];
  const img = LB_EL.querySelector("img");
  img.src = p.src; img.alt = p.caption || "";
  LB_EL.querySelector(".lb-caption").textContent = (p.album ? p.album + " · " : "") + (p.caption || "");
}

function stepLightbox(d) {
  LB_IDX = (LB_IDX + d + LB_LIST.length) % LB_LIST.length;
  showLightbox();
}

// 给容器里所有带图的照片绑定点击放大
function bindLightboxClicks(container, list) {
  container.querySelectorAll(".photo-item").forEach(function (el) {
    el.addEventListener("click", function () {
      const src = el.getAttribute("data-src");
      if (!src) return;   // 占位图不可放大
      const idx = list.findIndex(function (p) { return p.src === src; });
      openLightbox(list, idx >= 0 ? idx : 0);
    });
  });
}

// 渲染一组平铺照片（首页预览用）
function renderGallery(container, photos) {
  if (!container) return;
  container.innerHTML = photos.map(photoFigureHTML).join("");
  bindLightboxClicks(container, photos);
}

// 渲染相册页：按相册分组 + 顶部分类标签跳转
function renderAlbums(container) {
  if (!container) return;
  const albums = typeof ALBUMS !== "undefined" ? ALBUMS : [];
  if (albums.length === 0) {
    container.innerHTML = '<p class="empty-tip">相册还是空的 📷</p>';
    return;
  }

  // 每个相册给一个锚点 id（中文名不能直接做 id，用序号）
  let html = "";
  albums.forEach(function (a, i) {
    const anchor = "album-" + i;
    html += '<section class="album-block" id="' + anchor + '">' +
      '<h2 class="shelf-group-title">' + a.name +
        '<span class="album-count">' + a.photos.length + " 张</span></h2>" +
      '<div class="gallery-grid">' + a.photos.map(photoFigureHTML).join("") + "</div>" +
    "</section>";
  });
  container.innerHTML = html;
  bindLightboxClicks(container, allPhotos());

  // 顶部分类标签：点击跳到对应相册
  const tabs = document.getElementById("album-tabs");
  if (tabs) {
    tabs.innerHTML = albums.map(function (a, i) {
      return '<a class="album-tab" href="#album-' + i + '">' + a.name +
        '<span>' + a.photos.length + "</span></a>";
    }).join("");
  }
}
