# music · 音乐文件夹

把 mp3 文件放在这个目录里，然后在 `js/posts.js` 的 `MUSIC` 数组中登记：

```js
const MUSIC = [
  { title: "歌曲名", artist: "歌手", src: "music/歌曲.mp3", cover: "" },
];
```

说明：

- 音乐文件和网站一起托管在 Cloudflare Pages 上，国内加载快，不依赖音乐平台
- 建议单曲控制在 10MB 以内（文件太大会拖慢首屏）
- `cover` 可留空，留空显示渐变占位封面
- 至少有一首歌填了 `src`，底部悬浮播放条才会出现
