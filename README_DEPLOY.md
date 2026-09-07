# V8 更新说明

本版恢复较具展示感的文学作品卡片样式，并保持其位于代表性论文之后；《岩层与水痕》增加 2025.09 时间标记，同时新增“其他文学作品”入口及 works/index.html 时间档案页，便于后续添加未获奖作品。公开联系信息新增个人邮箱 1627168737@qq.com 与学术交流邮箱 peng_cheng_ma@163.com。首页“查看夹角计算方法”改为“查看裂隙夹角计算方法”，“裂隙岩体水力学”改为“岩体渗流”。

# V4 更新说明

本版更新导师与学术合作伙伴信息，新增 L** 显式计算公式，并将“文学作品”改为位于论文板块之后的可持续追加时间序列模块。

# pengchengma.com deployment

This is a static website. The repository root should contain `index.html`, `styles.css`, `script.js`, `CNAME`, and `assets/`.

## GitHub Pages
1. Create a GitHub repository and upload all files in this folder to the repository root.
2. Settings -> Pages -> Deploy from a branch -> `main` / root.
3. The included `CNAME` file already sets the custom domain to `pengchengma.com`.
4. At the DNS provider for `pengchengma.com`, create the records required by GitHub Pages. For the apex domain, use GitHub Pages' current A/AAAA records; for `www`, use a CNAME to `<your-github-username>.github.io` if you want `www` too.
5. Back in GitHub Pages, enable HTTPS after DNS verification succeeds.

## Netlify / Vercel alternative
Upload the same folder as a static site, add `pengchengma.com` as the custom domain in the hosting dashboard, then point the domain's DNS records to the provider as instructed.

Important: the files are configured for `pengchengma.com`, but DNS/registrar changes require access to the domain account and therefore cannot be completed from this package alone.

## v2 内容说明
- 新增“经历与成果”时间线，将专业工作内容与项目资料质量奖、学生科技成果、培训证书和地质文学荣誉对应展示。
- 新增硕士论文图 5-4（L**、KREV、块体化水平与块体类型关系）。
- 网页底部新增全部荣誉/证书图片墙。
- 继续不展示个人联系电话、住址或实时位置信息。


## V3 更新
- 新增“学术指导与合作”：导师于青春教授；合作伙伴刘盼盼、王秋宇。
- 新增“文学作品”板块与《岩层与水痕》独立双语阅读页。
- 《岩层与水痕》与“地质文学作品征集评选·诗歌类二等奖”建立双向超链接。
- 诗歌来源截图中的个人联系电话和电子邮箱不进入网站公开页面。
- 荣誉板块继续在网页底部集中展示全部荣誉/证书图片。
