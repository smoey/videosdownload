# 视频下载器（Cloudflare Pages 版）

在线解析并下载 **抖音、小红书、YouTube、X (Twitter)、TikTok** 的视频、图片和音频。纯前端页面 + Cloudflare Pages Functions，不需要自己的服务器。

- 支持直接粘贴 App 里的整段分享文案，会自动提取链接
- 抖音、TikTok 去水印；小红书优先给原画地址；X 自动选最高码率
- 下载经过 `/api/media` 中转，带上平台要求的 Referer，浏览器直接保存为文件

## 部署到 Cloudflare Pages

1. 打开 Cloudflare 控制台 → **Workers 和 Pages** → **创建** → **Pages** → **连接到 Git**，选择本仓库。
2. 构建设置：
   - 框架预设：`无`
   - 构建命令：留空
   - 构建输出目录：`public`
3. 点 **保存并部署**。`functions/` 目录会被自动识别为后端接口。

也可以用命令行：`npm install && npx wrangler pages deploy`。

本地调试：`npm install && npm run dev`，打开 http://localhost:8788 。运行测试：`npm test`。

## 可选环境变量

在 Pages 项目 → 设置 → 环境变量 里添加：

| 变量 | 作用 |
| --- | --- |
| `COBALT_API_URL` | 备用解析服务，内置解析失败时自动改用它。填一个 [cobalt](https://github.com/imputnet/cobalt) 实例的地址，例如 `https://cobalt.example.com/` |
| `COBALT_API_KEY` | 该 cobalt 实例需要的 API Key（没有就不填） |

## 各平台的实现方式和限制

Cloudflare 的运行环境里没有 yt-dlp 和 ffmpeg，所以每个平台都是单独写的解析逻辑：

| 平台 | 方式 | 说明 |
| --- | --- | --- |
| 抖音 | 解析官方分享页 `iesdouyin.com`，失败时用 tikwm.com | 视频去水印，图文作品下载原图 |
| 小红书 | 解析笔记网页里的数据 | 请用 App 里“分享 → 复制链接”得到的链接（带 `xsec_token`），否则可能要求登录 |
| X | fxtwitter / vxtwitter 公开接口 | 受保护账号的推文无法下载 |
| TikTok | 第三方接口 tikwm.com | 免费额度约每秒 1 次请求 |
| YouTube | YouTube 安卓 VR / iOS 客户端接口 | **最不稳定**。YouTube 经常拦截云服务器，失败时建议配置 `COBALT_API_URL`。高清画质是音画分离的（没有 ffmpeg 无法合并），只有 360p 左右有带声音的完整文件 |

平台随时可能改版，解析失败时需要更新对应的 `src/platforms/*.js`。

## 注意

- 下载流量会经过你的 Cloudflare Pages 项目。免费版 Functions 每天 10 万次请求，大文件分段下载也会计入次数。
- `/api/media` 只允许中转各平台 CDN 域名，不能当成任意网址的代理。
- 仅供个人学习与备份使用。请遵守各平台服务条款，尊重原作者版权，不要将下载内容用于二次传播或商业用途。
