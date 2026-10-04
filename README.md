# 小筑 · 个人博客

一个零构建的纯静态博客：没有后端、没有数据库、不需要 node 构建。文件本身就是网站。

## 文件结构

```
index.html      首页
blog.html       日志列表（按分类筛选）
post.html       文章详情页（通过 ?id=xxx 加载）
reading.html    阅读墙（书 / 漫画）
films.html      影视墙（电影 / 剧集）
games.html      游戏墙
gallery.html    相册
vlog.html       Vlog 视频
about.html      关于我

js/posts.js     文章数据（POSTS）+ 照片（PHOTOS）+ 视频（VIDEOS）
js/library.js   阅读 / 影视 / 游戏墙数据（READING / MOVIES / GAMES）
js/main.js      页面渲染逻辑
css/style.css   全站样式（改配色和风格改这里）
img/            文章与相册图片
posters/        影视 / 游戏海报
```

## 发文章

在 `js/posts.js` 的 `POSTS` 数组最前面加一条：

```js
{
  id: "my-new-post",        // 唯一英文 id，详情页链接用
  category: "生活日志",      // 分类名
  title: "文章标题",
  date: "2026-10-04",
  coverImg: "img/xxx.jpg",  // 可选封面图
  emoji: "🌿",               // 无封面时显示的图标
  tags: ["标签1", "标签2"],
  summary: "列表页显示的两行摘要",
  content: `<p>正文，支持 HTML</p>`,
}
```

## 更新书架 / 影音墙 / 游戏墙

改 `js/library.js` 里对应的数组即可。字段说明见该文件头部注释。

## 更新线上网站

```bash
git add -A
git commit -m "更新内容"
git push
```

推送后托管平台 1-2 分钟自动更新。

> 本机网络直连 github.com 不稳定，push 失败时走 clash 代理（端口 7897）：
> `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push`

## 部署方式

- **Cloudflare Pages**（当前）：构建命令留空，输出目录填 `/`
- **GitHub Pages**：仓库 Settings → Pages → 从 `main` 分支根目录发布

## 迁移记录

2026-10-04 从 Hexo 版本整体迁移：文章、图片全部迁入，旧 Hexo 代码退役（保留在 git 历史中可回溯）。
