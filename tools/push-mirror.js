const { spawnSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// 日志落盘（PowerShell 工具不回收 stdout）
const LOGF = path.join(__dirname, "push-mirror.log");
try { fs.writeFileSync(LOGF, ""); } catch (e) {}
const _log = console.log;
console.log = (...a) => {
  const s = a.map((x) => (typeof x === "string" ? x : String(x))).join(" ");
  _log(s);
  try { fs.appendFileSync(LOGF, s + "\n"); } catch (e) {}
};

// 清死代理：本机 HTTP_PROXY 指向 127.0.0.1:56802，端口开但上游不通
const cleanEnv = Object.assign({}, process.env);
["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"].forEach((k) => delete cleanEnv[k]);

// 1. 从 github.com 凭据取出 user/pass（不打印密码）
function getCred() {
  const got = execFileSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
    env: cleanEnv,
  });
  const lines = got.split(/\r?\n/);
  const user = (lines.find((l) => l.startsWith("username=")) || "").slice(9);
  const pass = (lines.find((l) => l.startsWith("password=")) || "").slice(9);
  return { user, pass };
}

const { user, pass } = getCred();
if (!user || !pass) {
  console.log("❌ 未取到凭据");
  process.exit(1);
}
console.log("凭据: user=" + user + ", pass 长度=" + pass.length);

// 2. 构造带凭据的 ghfast.top URL
const enc = encodeURIComponent;
const url = "https://" + enc(user) + ":" + enc(pass) + "@ghfast.top/https://github.com/HYxueyu/myblog.git";

// 3. 推送
const r = spawnSync("git", ["push", url, "main"], { encoding: "utf8", timeout: 180000, env: cleanEnv });

// 4. 输出（抹掉 URL 里的凭据）
function clean(s) {
  return String(s || "").replace(/https:\/\/[^@\s]+@/g, "https://***@");
}
console.log("--- stdout ---");
console.log(clean(r.stdout));
console.log("--- stderr ---");
console.log(clean(r.stderr));
console.log("exit:", r.status, r.signal || "".trim());
