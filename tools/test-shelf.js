/* ============================================================
   小筑 · 书架交互测试（筛选 / 分页 / 弹窗）
   ------------------------------------------------------------
   用最小 DOM 桩 + vm 跑 main.js，模拟点击验证行为。
   用法：node tools/test-shelf.js
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/* ---------- 极简 DOM 桩 ---------- */
class El {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase();
    this.children = [];
    this.attrs = {};
    this._class = "";
    this._html = "";
    this._text = "";
    this.listeners = {};
    this.style = {};
    this.dataset = {};
  }
  get className() { return this._class; }
  set className(v) { this._class = v; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] !== undefined ? this.attrs[k] : null; }
  hasAttribute(k) { return this.attrs[k] !== undefined; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  remove() { }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  dispatch(t, ev) { (this.listeners[t] || []).forEach((fn) => fn(ev || {})); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  scrollIntoView() { }
  classList = {
    _s: new Set(),
    add(c) { this._s.add(c); },
    remove(c) { this._s.delete(c); },
    contains(c) { return this._s.has(c); },
    toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
  };
}

// 解析 innerHTML 里带 data-* 的元素，生成可点击的桩节点
function parseCards(html) {
  const out = [];
  const re = /<article class="shelf-card"[^>]*data-idx="(\d+)"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const el = new El("article");
    el.setAttribute("data-idx", m[1]);
    out.push(el);
  }
  return out;
}
function parsePills(html) {
  const out = [];
  const re = /<button class="platform-pill[^"]*"[^>]*data-fk="([^"]*)"[^>]*data-fv="([^"]*)"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const el = new El("button");
    el.setAttribute("data-fk", m[1]);
    el.setAttribute("data-fv", m[2]);
    if (/is-on/.test(m[0])) el.classList.add("is-on");
    out.push(el);
  }
  return out;
}
function parsePager(html) {
  const out = [];
  const re = /<button class="pager-btn"[^>]*data-pg="([^"]*)"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const el = new El("button");
    el.setAttribute("data-pg", m[1]);
    out.push(el);
  }
  return out;
}

/* ---------- 容器桩：innerHTML 被设置后，能"查"到卡片/筛选钮 ---------- */
function makeContainer(id) {
  const el = new El("div");
  el.id = id;
  Object.defineProperty(el, "innerHTML", {
    get() { return this._html; },
    set(v) {
      this._html = String(v);
      this._cards = parseCards(this._html);
      this._pills = parsePills(this._html);
      this._pagers = parsePager(this._html);
    },
  });
  el.querySelectorAll = function (sel) {
    if (sel === ".shelf-card") return this._cards || [];
    if (sel === ".platform-pill" || /platform-pill/.test(sel)) {
      // 维度内查询：.platform-pill[data-fk="xx"]
      const mm = sel.match(/data-fk="([^"]+)"/);
      const list = this._pills || [];
      return mm ? list.filter((p) => p.getAttribute("data-fk") === mm[1]) : list;
    }
    if (sel === ".pager-btn") return this._pagers || [];
    if (/shelf-grid/.test(sel)) return [];
    if (/shelf-group-more/.test(sel)) return [];
    return [];
  };
  el.scrollIntoView = function () { };
  return el;
}

/* ---------- 组装运行环境 ---------- */
const shelfBox = makeContainer("game-shelf");
const filterBox = makeContainer("platform-filter");

const els = {
  "game-shelf": shelfBox,
  "platform-filter": filterBox,
};
const document = {
  body: new El("body"),
  documentElement: new El("html"),
  _domReady: [],
  addEventListener(t, fn) {
    if (t === "DOMContentLoaded") this._domReady.push(fn);
    else if (t === "keydown") this._keydown = fn;
  },
  getElementById: (id) => els[id] || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (t) => new El(t),
  title: "",
};
const localStorage = { getItem: () => null, setItem() { } };
const window = {
  matchMedia: () => ({ matches: false, addEventListener() { } }),
};
const location = { search: "" };
const Audio = function () { return { play() { }, pause() { }, addEventListener() { } }; };
Audio.prototype.addEventListener = function () { };

const ctx = {
  document, localStorage, window, location,
  URLSearchParams, Audio,
  console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
};
ctx.globalThis = ctx;
vm.createContext(ctx);

vm.runInContext(read("js/posts.js"), ctx);
vm.runInContext(read("js/library.js"), ctx);
vm.runInContext(read("js/main.js"), ctx);

// 触发 DOMContentLoaded
(document._domReady || []).forEach((fn) => fn());

/* ---------- 断言 ---------- */
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { console.log("  ✓ " + name); pass++; }
  else { console.log("  ✗ " + name + (extra ? "   → " + extra : "")); fail++; }
}

console.log("\n=== 筛选条 ===");
const fhtml = filterBox.innerHTML;
ok("有 3 个筛选维度（平台/类型/状态）", (fhtml.match(/filter-row-label/g) || []).length === 3,
  "实际 " + (fhtml.match(/filter-row-label/g) || []).length);
ok("状态维度含「已通关」", /已通关/.test(fhtml));
ok("状态维度不含「已读完」（游戏墙应为已通关）", !/已读完/.test(fhtml));
ok("类型维度剔除了孤例（恐怖/体育竞技各 1 条不该出现）",
  !/data-fv="恐怖"/.test(fhtml) && !/data-fv="体育竞技"/.test(fhtml));

console.log("\n=== 分页 ===");
ok("游戏墙第一页有 24 张卡片", (shelfBox._cards || []).length === 24,
  "实际 " + (shelfBox._cards || []).length);
ok("有分页控件", /shelf-pager/.test(shelfBox.innerHTML));
ok("分页信息显示总页数", /\/ \d+ 页/.test(shelfBox.innerHTML),
  (shelfBox.innerHTML.match(/pager-info">([^<]+)/) || [])[1]);
ok("分组标题显示筛选后总数（在玩 33）", /在玩（33）/.test(shelfBox.innerHTML));

console.log("\n=== 卡片可点击 ===");
const card0 = (shelfBox._cards || [])[0];
ok("卡片有 data-idx", card0 && card0.getAttribute("data-idx") === "0");
ok("卡片是 role=button", /role="button"/.test(shelfBox.innerHTML));
ok("卡片有 tabindex（键盘可达）", /tabindex="0"/.test(shelfBox.innerHTML));

console.log("\n=== 筛选交互：点「状态 → 想玩」 ===");
// 筛选条按钮监听器已绑定在 filterBox 的桩上
const pills = filterBox._pills || [];
const wantPlay = pills.find((p) => p.getAttribute("data-fk") === "status" && p.getAttribute("data-fv") === "想玩");
if (wantPlay) {
  wantPlay.dispatch("click");
  ok("筛后分组只剩想玩", /愿望单/.test(shelfBox.innerHTML) && !/在玩（/.test(shelfBox.innerHTML),
    (shelfBox.innerHTML.match(/shelf-group-title">([^<]+)/) || [])[1]);
  ok("想玩共 15 条", /愿望单（15）/.test(shelfBox.innerHTML),
    (shelfBox.innerHTML.match(/shelf-group-title">([^<]+)/) || [])[1]);
} else {
  ok("找到「想玩」筛选按钮", false);
}

console.log("\n=== 结果 === " + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
