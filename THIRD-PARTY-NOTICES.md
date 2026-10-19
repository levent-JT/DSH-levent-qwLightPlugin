# 第三方代码来源与许可

本项目内联了一部分 MIT 许可的第三方代码，按 MIT 要求保留版权声明与许可原文。

## 1. 二维码编码器 — `vendor/qr.mjs`

- **来源**：https://github.com/WolfGenerals/ncm-player （`index.mjs` 内的 `qrEncode` 实现）
- **作者**：WolfGenerals
- **许可**：MIT（原文见 `vendor/LICENSE.ncm-player-WolfGenerals`）
- **复用方式**：整段 `qrEncode` 实现原样保留；`qrToSvgDataUrl()` 是上游自带的 SVG 封装
- **我们的改动**：
  1. 不新增算法改动，仅由 `scripts/build-host.mjs` 把它内联进 `lib/index.js`
     （去掉 `export` 前缀，让它成为宿主模块作用域内的普通声明）。
  2. 用途：把微信扫码登录返回的二维码内容渲染成 `data:image/svg+xml`，
     供宿主直接返回给面板 `<img src>`，不依赖外部二维码服务、不受 CSP 影响。

## 2. 协议知识（未复制代码）

以下外部系统的行为全部来自公开文档或真实接口调用，本仓库没有复制其实现代码：

| 来源 | 用途 |
|---|---|
| https://github.com/NapNeko/NapCatQQ 与 https://napneko.github.io | QQ 侧的 OneBot 11 事件结构、接口清单、网络配置 |
| https://github.com/botuniverse/onebot-11 | 消息段定义 |
| https://github.com/Tencent/openclaw-weixin （npm `@tencent-weixin/openclaw-weixin`） | 微信 iLink 协议：扫码、`getupdates` 长轮询、`sendmessage`、媒体上传下载与 AES-128-ECB |

QQ 表情与头像的图片地址是腾讯的公开 CDN：

- `https://qzonestyle.gtimg.cn/qzone/em/e{id}.gif`
- `https://q1.qlogo.cn/g?b=qq&nk={uin}&s=100`

本项目只是引用这些地址，不缓存、不转存。
