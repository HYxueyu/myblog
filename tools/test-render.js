/* 用最小 DOM 桩跑 main.js，定位渲染错误 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

// ---- 极简 DOM 桩 ----
function makeEl(id) {
  const el = {
    id: id,
    _html: "",
    innerHTML: "",
    textContent: "",
    className: "",
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
    },
    style: {},
    dataset: {},
    children: [],
    setAttribute() {},
    getAttribute(k) { return this.dataset[k] || ""; },
    addEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    afterbegin: null,
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return this._html; },
    set(v) { this._html = v; },
  });
  return el;
}

const store = {};
const nodes = {};
global.document = {
  documentElement: makeEl("html"),
  body: makeEl("body"),
  title: "",
  createElement: (t) => makeEl(t),
  getElementById: (id) => {
    if (!(id in nodes)) nodes[id] = makeEl(id);
    return nodes[id];
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (ev, fn) => {
    if (ev === "DOMContentLoaded") store.domReady = fn;
  },
  readyState: "complete",
};
global.window = {
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener() {},
  location: { href: "http://127.0.0.1:5599/games.html" },
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
global.location = global.window.location;
global.Audio = function () {
  return { addEventListener() {}, play() {}, pause() {}, src: "" };
};
global.navigator = { userAgent: "node" };

// ---- 载入数据 ----
const ctx = {
  console,
  document: global.document,
  window: global.window,
  localStorage: global.localStorage,
  location: global.location,
  Audio: global.Audio,
  navigator: global.navigator,
  setTimeout,
  clearTimeout,
  Math,
  Date,
  JSON,
  Set,
  Array,
  Object,
  String,
  Number,
  Boolean,
  RegExp,
  Error,
  parseInt,
  parseFloat,
  isNaN,
  encodeURIComponent,
  decodeURIComponent,
  URLSearchParams,
  alert: () => {},
};
vm.createContext(ctx);

// 页面里只有 game-shelf 存在，其他容器为 null（模拟 games.html）
nodes["game-shelf"] = makeEl("game-shelf");
nodes["platform-filter"] = makeEl("platform-filter");

try {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/posts.js"), "utf8"), ctx, { filename: "posts.js" });
  console.log("posts.js 载入 OK");
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/library.js"), "utf8"), ctx, { filename: "library.js" });
  console.log("library.js 载入 OK");
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/main.js"), "utf8"), ctx, { filename: "main.js" });
  console.log("main.js 载入 OK");
  if (store.domReady) {
    store.domReady();
    console.log("DOMContentLoaded 执行 OK");
  } else {
    console.log("!! 没有注册 DOMContentLoaded");
  }
  const html = nodes["game-shelf"].innerHTML;
  console.log("\n=== game-shelf 渲染长度：" + html.length + " ===");
  console.log(html.slice(0, 1200));
  console.log("\n=== platform-filter 渲染 ===");
  console.log(nodes["platform-filter"].innerHTML);
} catch (e) {
  console.log("\n!! 报错：" + e.message);
  console.log(e.stack.split("\n").slice(0, 8).join("\n"));
}
