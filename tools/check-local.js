/* 验证本地服务：JSON 可访问性 + 页面可访问性 */
const http = require("http");

function get(path) {
  return new Promise((resolve) => {
    http
      .get("http://127.0.0.1:8899" + path, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ path, status: res.statusCode, len: d.length, body: d }));
      })
      .on("error", (e) => resolve({ path, status: "ERR " + e.code }));
  });
}

(async () => {
  const paths = [
    "/games.html",
    "/reading.html",
    "/films.html",
    "/data/games.json",
    "/data/reading.json",
    "/data/films.json",
    "/js/main.js",
    "/js/library.js",
    "/admin/",
    "/admin/index.html",
    "/admin/config.yml",
  ];
  for (const p of paths) {
    const r = await get(p);
    console.log(String(r.status).padEnd(10), String(r.len || "").padEnd(8), p);
  }

  console.log("\n=== JSON 内容抽检 ===");
  const g = await get("/data/games.json");
  try {
    const j = JSON.parse(g.body);
    console.log("games.json: kind=" + j.kind + ", items=" + j.items.length);
    console.log("  首条:", j.items[0].title, "|", j.items[0].platform, "|", j.items[0].status);
  } catch (e) {
    console.log("games.json 解析失败:", e.message, "body 前 100:", g.body.slice(0, 100));
  }
})();
