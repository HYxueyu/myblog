---
title: 用 PyCharm 写博客并推送到 GitHub
date: 2026-09-16 15:30:00
tags:
  - 教程
  - 工具
  - Hexo
cover: /img/cover-hello.jpg
---

今天教大家怎么用 PyCharm 写博客文章，然后一键推送到 GitHub，让博客自动更新。

## 为什么用 PyCharm 写博客？

PyCharm 不只是写 Python 的工具，它还是一个强大的编辑器：

- 内置 Markdown 预览，边写边看效果
- 集成 Git 版本控制，写完直接提交推送
- 文件树管理，拖拽图片到文件夹就能用
- 多标签编辑，同时编辑文章和配置文件

## 写文章的流程

### 第一步：新建文章

在 PyCharm 左侧文件树中，右键 `source/_posts/` 文件夹 → New → File，输入文件名（比如 `我的新文章.md`），记得加 `.md` 后缀。

### 第二步：写 Front Matter

每篇文章开头要有 Front Matter（用三个横线包裹的配置信息）：

```markdown
---
title: 我的文章标题
date: 2026-09-16 15:00:00
tags:
  - 标签1
  - 标签2
cover: /img/cover-hello.jpg
---
```

### 第三步：插入图片

图片放在 `source/img/` 文件夹里，然后在文章中引用：

![这是一张示例图片](/img/cover-hello.jpg)

也可以用相对路径引用文章自带的图片文件夹里的图片。

### 第四步：写正文

用 Markdown 语法写正文，支持标题、列表、表格、代码块等。

> 写完之后保存文件（Ctrl+S），然后就可以提交了。

## 推送到 GitHub

在 PyCharm 中用 Git 提交推送非常简单：

1. 按 `Ctrl+K` 打开提交窗口
2. 勾选你修改的文件
3. 写提交信息（比如"新增文章：用 PyCharm 写博客"）
4. 点击 Commit
5. 按 `Ctrl+Shift+K` 推送到 GitHub

推送后 Cloudflare Pages 会自动构建部署，1-2 分钟后博客就更新了！

## 总结

整个流程就是：**写 Markdown → 放图片 → Ctrl+K 提交 → Ctrl+Shift+K 推送 → 自动上线**

比命令行方便多了，而且 PyCharm 的语法高亮和自动补全让写文章更高效。
