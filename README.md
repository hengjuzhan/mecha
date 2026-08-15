# MECHA-NAV · 机甲导航站

未来机甲风导航站前端：暗黑赛博机甲视觉、10 大分区卡片导航、全局模糊搜索、在线音乐舱（多音源容错链）、公告发布区、心情轮播、可调大小双矩形面板、桌面机甲宠物、管理员控制台。可静态部署至 GitHub Pages，预留 Supabase 后端接入。

## 技术栈

- Vite 7 + React 19 + TypeScript + TailwindCSS v4（无 UI 组件库，全部手写）
- 路由：hash（`#/admin` 为管理页），兼容 GitHub Pages
- 构建产物为单文件 `dist/index.html`（vite-plugin-singlefile），相对路径直接部署
- 数据层：`dataService` 双适配器 —— LocalAdapter（`navData.ts` 默认数据 + localStorage 覆盖层）/ SupabaseAdapter（管理页「系统」连接后启用）

## 目录结构

```
src/
  components/
    layout/     TopBar / Sidebar / RightRail（顶栏、左栏、右栏）
    cards/      CategoryModule / SiteCard / PreviewModal（分类模块、卡片、站内预览）
    music/      MusicPlayer（音乐模块，含歌词/频谱/霓虹灯管）
    pet/        MechaPet（桌面像素机甲宠物）
    admin/      AdminPage / AdminSections / AdminSystem / AdminLogin（管理控制台）
    widgets/    Toast / Modal / Clock / SettingsPanel / ResizableBoard / AnnounceBoard / MoodPanel
  data/         navData.ts（全站数据）· texts.ts（全站文案）· types.ts
  lib/          dataService.ts · audio.ts（WebAudio 音效 + 音乐引擎）· supabase.ts · utils.ts
supabase/schema.sql   后端建表 + RLS + RPC
```

## 本地开发 / 构建

```bash
npm install
npm run dev      # 开发
npm run build    # 构建 → dist/index.html（单文件，相对路径）
```

## 部署到 GitHub Pages

`npm run build` 后把 `dist/` 内容推到 Pages 分支即可（单文件，无路径问题）。也可使用 `gh-pages` 或 Actions 自动部署。

## Supabase 初始化

1. 在 Supabase 新建项目，SQL Editor 中整体执行 `supabase/schema.sql`（建表 + RLS + `bump_visits` / `admin_import` RPC）。
2. （可选）执行文件末尾注释中的语句，将 `settings.admin.token` 设为管理员口令的 SHA-256，启用「上传全量」RPC。
3. 打开站点 → 管理控制台 → 「系统」页，填入 Project URL 与 anon key → 测试连接 → 上传/拉取全量数据。
4. 接入后端后，顶栏访问统计自动调用 `bump_visits`（前端 localStorage 按天去重），统计框不再显示 DEMO 角标。

## 管理员使用手册（仅限文档，前端无任何可见入口提示）

- **入口**：3 秒内连点顶栏左上角机甲 LOGO 5 次，弹出口令框。初始口令 `admin123`（SHA-256 存储于 localStorage）。
- 登录成功自动跳转 `#/admin`。会话存 sessionStorage，可随时「退出」。
- **分区 / 站点**：增删改不限数量；新站点编号自动分配 `L0001+`；图标按名称关键词自动推荐 emoji（可手改）；占位卡与角标（HOT/NEW）可切换。
- **公告**：文字 / 链接 / 图片三类，自动 `P0001+` 编号，总搜索栏输入编号可定位高亮。
- **推广位**：首页横幅下 3 个合作推广位，标题/描述/链接/配色可编辑。
- **音乐源**：顺序可调（①自部署网易云 API ②Audius ③聚合接口 ④SoundHelix 兜底），访客看不到任何换源入口。
- **外观**：霓虹亮度/频率、文字跳动幅度/节奏/辉光、音效与音乐音量、行内编辑开关、重置布局。
- **行内编辑**：开启后回前台，全站文字（`data-tk` 标记）可直接点击修改，实时写入 `texts.ts` 覆盖层。
- **备份**：JSON 导出 / 导入 / 恢复默认；接 Supabase 后可一键上传/拉取全量。
- **改口令**：「系统」页修改，SHA-256 存储，原始默认 `admin123`。

## 音乐容错链

某音源 5 秒内未 `canplay` 或报错 → 自动换下一音源播同一首；一首歌全源失败 → 切下一首；连续失败 ≥3 次 → 锁定 SoundHelix 演示音源并 toast 提示。频谱使用独立静音探头 + AnalyserNode（CORS 音源），非 CORS 音源自动切换伪频谱动画。进站首次人机交互后自动随机播放（遵守浏览器 autoplay 政策）。

## 其它说明

- 分类音效为 WebAudio 程序化合成（影视=低频方波、二次元=琶音、音乐=正弦滑音、工具=短促滴声…），同元素 800ms 防抖，0 音量即静音。
- 桌面宠物为程序化像素矩阵（canvas 绘制），单击=开心+追赶、双击=害怕逃窜、拖拽=飞行跟随，30–90 秒随机出现/隐藏；`prefers-reduced-motion` 时静态化。
- z-index 公约：内容 0 < 侧栏/右栏 100 < 弹层 500 < 管理员 9000 < 宠物 9500 < toast 9900。
- 所有外部请求带超时与兜底（一言 → ALAPI → 本地 50 句库；表情包失败 → 本地兜底）。
