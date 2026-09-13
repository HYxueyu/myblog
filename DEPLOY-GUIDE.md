# Hexo 博客部署到 Cloudflare Pages 完整步骤

## 前提条件
- ✅ Hexo 博客已在本地搭建完成（blog-site 目录）
- ✅ 已有 GitHub 账号（或注册一个）
- ✅ 已有自己的域名

---

## 第一步：把代码上传到 GitHub

### 1.1 注册/登录 GitHub
- 打开 https://github.com
- 如果没有账号，点 Sign up 注册（用邮箱就行）
- 登录后记住你的用户名

### 1.2 创建仓库
1. 点右上角 **+** → **New repository**
2. 填写：
   - Repository name: `my-blog`
   - 选 **Public**（公开）
   - 勾选 **Add a README file**
3. 点 **Create repository**

### 1.3 上传代码

打开 PowerShell，依次执行以下命令（注意替换"你的用户名"）：

```powershell
# 进入博客目录
cd "C:\Users\Administrator\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6aa417c61b92bed59a19faaf\blog-site"

# 初始化 Git
git init
git add .
git commit -m "初始化博客"

# 关联远程仓库（把"你的用户名"换成你的 GitHub 用户名）
git branch -M main
git remote add origin https://github.com/你的用户名/my-blog.git
git push -u origin main
```

如果提示要登录，输入 GitHub 用户名和密码（或 Token）。

---

## 第二步：在 Cloudflare Pages 部署

### 2.1 注册 Cloudflare
1. 打开 https://www.cloudflare.com
2. 点 **Sign up**，用邮箱注册（免费）

### 2.2 创建项目
1. 登录后，点左侧 **Workers & Pages**
2. 点 **Create application**
3. 选 **Pages** 标签
4. 点 **Connect to Git**
5. 选 **GitHub**，授权登录
6. 选中你的 `my-blog` 仓库
7. 点 **Begin setup**

### 2.3 配置部署参数

| 配置项 | 填什么 |
|--------|--------|
| Project name | `my-blog`（或随便填） |
| Production branch | `main` |
| Framework preset | 选 **None** |
| Build command | `npm install && npx hexo generate` |
| Build output directory | `public` |

> ⚠️ Build command 一定要填 `npm install && npx hexo generate`
> ⚠️ Build output directory 一定要填 `public`

8. 点 **Save and Deploy**
9. 等 2-3 分钟，部署完成后会给你一个地址：`https://my-blog.pages.dev`
10. 点开就能看到你的博客了！

---

## 第三步：绑定你的域名

### 3.1 在 Cloudflare 添加自定义域名
1. 进入 Cloudflare → Workers & Pages → 点你的项目
2. 点 **Custom domains** 标签
3. 点 **Set up a custom domain**
4. 输入你想用的子域名，比如：`blog.你的域名.com`
5. 点 **Continue**

### 3.2 添加 DNS 解析记录

Cloudflare 会提示你需要添加一条 DNS 记录：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| CNAME | blog | `my-blog.pages.dev` |

#### 如果域名在阿里云：
1. 登录 https://wanwang.aliyun.com → 控制台
2. 找到 **云解析 DNS** → 找到你的域名
3. 点 **解析设置** → **添加记录**
4. 填写：记录类型 CNAME、主机记录 blog、记录值 `my-blog.pages.dev`
5. 保存

#### 如果域名在腾讯云：
1. 登录 https://dnspod.cloud.tencent.com
2. 找到你的域名 → 点 **添加记录**
3. 填写：主机记录 blog、记录类型 CNAME、记录值 `my-blog.pages.dev`
4. 保存

#### 如果域名已经在 Cloudflare 管理 DNS：
那就更简单了，Cloudflare 会自动帮你加好记录，不用手动操作。

### 3.3 等待生效
1. 回到 Cloudflare Pages，点 **Activate domain**
2. 等 DNS 生效（快的几分钟，慢的几小时）
3. 状态变绿色 **Active** 就好了
4. 用 `blog.你的域名.com` 访问你的博客！

---

## 第四步：以后怎么更新博客

### 写新文章
```powershell
cd "C:\Users\Administrator\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6aa417c61b92bed59a19faaf\blog-site"
hexo new "新文章标题"
```

### 编辑文章
用 Typora 或任何编辑器打开 `source/_posts/新文章标题.md`，写 Markdown 内容。

### 发布到线上
```powershell
hexo generate
git add .
git commit -m "新文章：标题"
git push
```

push 之后 Cloudflare 会自动重新部署，1-2 分钟后线上就更新了。

---

## 配置域名到博客

上线后，把你的域名填到 Hexo 配置里，这样分享链接等会正确显示：

打开 `blog-site/_config.yml`，把 url 改成你的域名：
```yaml
url: https://blog.你的域名.com
```

然后重新 `hexo generate && git push` 就行。

---

## 常见问题

### Q: 部署失败怎么办？
检查 Build command 是不是填的 `npm install && npx hexo generate`，Build output directory 是不是填的 `public`。

### Q: 域名打不开？
DNS 生效需要时间，等一会儿再试。或者用手机流量试试（避开缓存）。

### Q: 提示不安全？
Cloudflare 会自动配好 SSL 证书，刚开始可能要等几分钟证书签发。

### Q: 文章里的图片显示不了？
把图片放在 `source/img/` 目录里，文章里用 `/img/图片名.jpg` 引用就行。
