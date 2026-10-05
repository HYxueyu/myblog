/* 本地静态服务器（模拟 CF Pages），用于真实浏览器验证 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = 8899;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") url = "/index.html";
  let fp = path.join(ROOT, url);

  // 目录 → index.html
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, "index.html");

  if (!fs.existsSync(fp)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found: " + url);
    return;
  }
  const ext = path.extname(fp).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(fp).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("服务已启动: http://127.0.0.1:" + PORT);
  console.log("  games.html  → http://127.0.0.1:" + PORT + "/games.html");
  console.log("  data/games.json → http://127.0.0.1:" + PORT + "/data/games.json");
  console.log("  admin/      → http://127.0.0.1:" + PORT + "/admin/");
});
