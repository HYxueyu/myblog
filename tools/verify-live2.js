// 精细验证线上 Spacewar / CoD 是否已更新
const https = require("https");

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, body: d }));
      })
      .on("error", reject);
  });
}

(async () => {
  const stamp = Date.now();
  const r = await get("https://blog.heiyunas.top/js/library.js?v=" + stamp);
  console.log("library.js:", r.status);
  const s = r.body;

  const sw = /title:\s*"Spacewar"[\s\S]*?\n  \}/.exec(s);
  console.log("\n[Spacewar]");
  console.log(sw ? sw[0] : "(未找到)");

  const cod = /title:\s*"Call of Duty Modern Warfare"[\s\S]*?\n  \}/.exec(s);
  console.log("\n[Call of Duty Modern Warfare]");
  console.log(cod ? cod[0] : "(未找到)");

  console.log("\n含独立重复 'Call of Duty\"' 条目:", /title:\s*"Call of Duty"/.test(s));

  // 新封面图是否可访问
  const img = await get("https://blog.heiyunas.top/posters/steam-4989790.jpg?v=" + stamp);
  console.log("\nposters/steam-4989790.jpg:", img.status, "| bytes:", img.body.length);
})();
