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

## V11 网页计算器更新
- 水化学工具页改为四个独立的网页原生计算板块，并新增氢氧稳定同位素补给高程计算。
- 库尔洛夫式：mg/L 直接输入，自动计算 meq/L、meq%、矿化度、电荷平衡误差、水化学类型和 Piper 三线图；支持多水样。
- 剖面校正：连续测点 X/Y/高程直接计算导线与剖面投影参数。
- 地层厚度：直接按 Y=sinα·cosβ·cosγ±cosα·sinβ 和 D=L·Y 计算。
- Excel 上传保留为可选辅助导入，不再是计算的前置条件。

## V12 计算工具更新
- 库尔洛夫式输入列调整为：Na、K、Ca、Mg、Cl、SO4、HCO3 在前，其余离子统一置后。
- 库尔洛夫式下方 Piper 三线图升级为标准三角形—菱形布局，增加 20% 网格、50% 分区线、刻度、化学离子轴标签、多颜色/多符号样品图例和 PNG 导出。
- “剖面校正计算表”按原 Excel 的“剖面校正表打印”字段和公式在网页端直接计算。
- “剖面地层厚度计算表”按原 Excel A–V 列展开，并保留原工作簿现有 T 列计算关系。


## v27 Na-K-Mg 平衡曲线
- 完全平衡线和平衡下限由公式实时生成，不再使用手工折线。
- 显示 80–360 ℃ 等温线，间隔 20 ℃。
- 完全平衡区采用 Giggenbach Na-K 温标；局部平衡区采用 K-Mg 温标。
- 已合并移动端导航与计算模块适配样式。

- 库尔洛夫式模块新增主要离子 1:1 等当量关系图：Na+K–Cl 与 Ca+Mg–HCO3+SO4（meq/L），同步输出逐样品位置解释、文献判据和 PNG 下载。

## V36 稳定同位素与移动端优化
- “补给高程计算”继续位于库尔洛夫式之后、剖面校正之前。
- 当地高程模型改为直接录入线性式 `δ = a × ALT + b`：默认选择 δD，也可切换为 δ18O；网页反算 `ALT = (δ - b) / a`。
- 补给源判读新增“学术版 / 简洁版”切换；学术版保留蒸发、端元混合、高 d-excess、水岩交换和模型适用性等限定条件。
- δD–δ18O 图在手机端改为自适应缩放，不再强制宽画布横向滚动；设置项在平板/手机端自动由双列变为单列。
- 同位素输入、结果表在窄屏保持横向滑动，并固定第一列样品编号，便于手机浏览长表。
- 表单字号调整为 16 px，减少 iOS 浏览器输入框自动放大；操作按钮在窄屏自动换行。
- 保留中国 CHNIP 全国空间回归、全球平均 δ18O 高程梯度 + 当地参考点、当地自定义高程公式三类模型，并保留 Craig (1961)、Liu et al. (2014)、Poage & Chamberlain (2001)、Jasechko (2019) 等文献说明。

## v37 小更新
- 补给高程自定义公式新增符号说明：ALT = Altitude，为海拔高度，单位 m。
- 氢氧稳定同位素关系图的横纵坐标标题改为“△ δ¹⁸O (‰)”和“△ δD / δ²H (‰)”，在同位素符号前加入空心三角形。
- 延续 v36 的手机端响应式布局与横向表格滚动兼容。

## V38 SEO 专项优化

- 工具页标题改为“库尔洛夫式在线计算｜水化学类型、Piper三线图与补给高程计算”。
- 工具页新增针对库尔洛夫式、meq/L、离子当量百分比、水化学类型与 Piper 三线图的自然语言说明。
- 新增 canonical、robots、Open Graph 与 WebApplication 结构化数据。
- `sitemap.xml` 新增 `/tools/piper.html` 并更新 lastmod。
- 首页导航的内部链接锚文本由“水化学工具”优化为“库尔洛夫式计算”。
- 保留原有手机端兼容、稳定同位素、ALT 海拔说明及所有计算功能。

## v39 导航优化
- 首页导航中的“库尔洛夫式计算”改为“其他水化学计算”。
- 点击后弹出四个计算板块：库尔洛夫式 + 图解、补给高程计算、剖面校正计算表、剖面地层厚度计算表。
- 每个菜单项可通过 URL hash 直接打开对应板块，并自动滚动到该板块。
- 桌面端与手机端均增加下拉菜单适配。

## v40 首页导航顺序与命名优化
- 首页导航“夹角方法”改为“裂隙夹角计算”（英文同步为 Fracture Angle Calculation）。
- “其他水化学计算”下拉菜单提前到“裂隙夹角计算”之后、论文之前。
- 下拉菜单继续包含 4 个板块，并可直接跳转到工具页对应标签：库尔洛夫式 + 图解、补给高程计算、剖面校正计算表、剖面地层厚度计算表。
- 保留桌面端和手机端下拉菜单适配及 URL hash 自动切换/滚动。


## V41 导航微调
- 修正桌面端“其他水化学计算”与相邻导航项基线/高度不一致的问题，使其与其他菜单保持同一垂直高度。
- “裂隙夹角计算”和“其他水化学计算”使用更深字体颜色并加粗，以突出两个计算入口；手机端布局规则保持不变。


## v42 导航部署一致性修正
- 修复 GitHub Pages/浏览器缩放或 Windows 显示缩放使 CSS 视口落入 `max-width:900px` 后，首页导航变成两行、下拉菜单进入普通文档流的问题。
- 721–1150 CSS px 区间强制保持桌面式单行导航；“其他水化学计算”继续使用浮层下拉菜单，不再挤占导航高度。
- 721–860 CSS px 自动压缩导航字号与间距，避免中等宽度窗口换行；真正的手机导航仍在 720 px 以下启用。
- HTML 中为 CSS/JS 资源增加 `?v=42` 版本参数，避免 GitHub Pages/CDN 或浏览器继续使用旧版缓存样式。
