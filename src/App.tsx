import { useEffect, useState } from "react";
import { TopBar } from "./components/layout/TopBar";
import { Sidebar } from "./components/layout/Sidebar";
import { RightRail } from "./components/layout/RightRail";
import { LazyCategory } from "./components/cards/LazyCategory";
import { AnnounceBoard } from "./components/widgets/AnnounceBoard";
import { MoodPanel } from "./components/widgets/MoodPanel";
import { TechNewsBoard } from "./components/widgets/TechNewsBoard";
import { ResizableBoard } from "./components/widgets/ResizableBoard";
import { Toaster } from "./components/widgets/Toast";
import { RotateOverlay } from "./components/widgets/RotateOverlay";
import { MechaPet } from "./components/pet/MechaPet";
import { MusicAutoWatch } from "./components/music/MusicAutoWatch";
import { AdminPage } from "./components/admin/AdminPage";
import { Corners } from "./components/widgets/Modal";
import { getSettings, setSettings, setTexts, stats, syncTextsFromCloud, syncSiteDataFromCloud, t, useSettings, useStore } from "./lib/dataService";
import { isAdminSession } from "./components/admin/AdminLogin";
import { music, sfx } from "./lib/audio";
import { cloud } from "./lib/cloud";
import type { Promo } from "./data/types";

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

/* 随机机甲渐变配色组：主/辅/点缀三色 + 背景色，每 30 秒随机切换 */
const GRAD_PALETTES: { c: [string, string, string]; bg: [string, string] }[] = [
  { c: ["#00e5ff", "#ff2ed9", "#ffb020"], bg: ["#070b14", "#0d1526"] }, // 原版冰蓝
  { c: ["#22d3ee", "#a855f7", "#f97316"], bg: ["#060b14", "#101a33"] }, // 青紫橙
  { c: ["#34d399", "#38bdf8", "#f472b6"], bg: ["#06130f", "#0f1a22"] }, // 翠绿冰蓝
  { c: ["#f472b6", "#a78bfa", "#34d399"], bg: ["#120a18", "#0a1420"] }, // 粉紫绿
  { c: ["#fbbf24", "#fb7185", "#38bdf8"], bg: ["#14100a", "#0a1420"] }, // 琥珀玫红冰蓝
  { c: ["#2dd4bf", "#f472b6", "#fbbf24"], bg: ["#061216", "#120f0a"] }, // 青粉黄
  { c: ["#818cf8", "#22d3ee", "#fb7185"], bg: ["#0a0f1e", "#150a18"] }, // 靛蓝青玫红
];

/* ============ 全局效果：主题/字体/变量/跳动/音效/快捷键/自动播歌/行内编辑 ============ */
function GlobalEffects() {
  useSettings(); // 订阅设置变化，使全局效果独立响应，无需上层 App 整体重渲染
  const s = getSettings();
  const [adminOn, setAdminOn] = useState(isAdminSession());
  useEffect(() => {
    const onEvt = () => setAdminOn(isAdminSession());
    window.addEventListener("mecha:adminsession", onEvt);
    return () => window.removeEventListener("mecha:adminsession", onEvt);
  }, []);

  // 进入站点时拉取云端文案与全站数据，保证各设备看到一致的内容
  useEffect(() => {
    void syncTextsFromCloud();
    void syncSiteDataFromCloud();
    // 拉取云端共享背景（RightRail 也会拉，但这里保证首帧就应用，避免闪烁）。
    // 云端明确返回（含空值）即覆盖本地：管理员清除后其他设备刷新也会同步清空本地缓存
    void cloud.bg.get().then((r) => {
      if (!r) return;
      const cur = getSettings();
      if (cur.bgImage !== r.bgImage || cur.bgTone !== r.bgTone) {
        setSettings({ bgImage: r.bgImage, bgTone: r.bgTone });
      }
    });
  }, []);

  // 后台模式行内编辑：所有 [data-tk] 文字可编辑，卡片显示删除/编辑
  useEffect(() => {
    document.documentElement.setAttribute("data-admin", adminOn ? "on" : "off");
    if (!adminOn) return;
    // 只对尚未可编辑的元素补属性，避免反复 contentEditable 重置破坏光标位置
    const ensureEditable = () => {
      document.querySelectorAll<HTMLElement>("[data-tk]").forEach((el) => {
        if (el.getAttribute("contenteditable") !== "true") {
          el.contentEditable = "true";
          el.classList.add("admin-editable");
        }
      });
    };
    ensureEditable();
    // 失焦时写回文案覆盖层：输入过程中不触发 setTexts，避免全站重渲染把光标重置到开头
    const commit = (e: Event) => {
      const el = (e.target as HTMLElement).closest?.("[data-tk]") as HTMLElement | null;
      if (el?.dataset.tk) setTexts({ [el.dataset.tk]: el.textContent ?? "" });
    };
    // focusout 冒泡，能捕获正在编辑的 data-tk 元素失焦
    document.addEventListener("focusout", commit);
    // 仅当懒加载等新增 data-tk 元素时补充可编辑，不重置已编辑元素
    const mo = new MutationObserver(ensureEditable);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("focusout", commit);
      mo.disconnect();
      document.documentElement.setAttribute("data-admin", "off");
    };
  }, [adminOn]);

  useEffect(() => {
    const apply = () => {
      const th = s.theme === "auto"
        ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
        : s.theme;
      document.documentElement.setAttribute("data-theme", th);
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [s.theme]);

  // 随机机甲渐变配色：每次进入页面切换一次（非定时轮换），并在本地记录上次索引以免连续一样
  useEffect(() => {
    const r = document.documentElement.style;
    const keys = ["--c-cyan", "--c-magenta", "--c-orange", "--c-bg", "--c-panel", "--c-panel2"] as const;
    const reset = () => keys.forEach((k) => r.removeProperty(k));
    if (!s.colorShift) { reset(); return; }
    let idx: number;
    try {
      const last = Number(localStorage.getItem("mechanav.palette") || "-1");
      idx = (last + 1 + Math.floor(Math.random() * (GRAD_PALETTES.length - 1))) % GRAD_PALETTES.length;
    } catch { idx = Math.floor(Math.random() * GRAD_PALETTES.length); }
    try { localStorage.setItem("mechanav.palette", String(idx)); } catch { /* ignore */ }
    const p = GRAD_PALETTES[idx];
    r.setProperty("--c-cyan", p.c[0]);
    r.setProperty("--c-magenta", p.c[1]);
    r.setProperty("--c-orange", p.c[2]);
    r.setProperty("--c-bg", p.bg[0]);
    r.setProperty("--c-panel", p.bg[1]);
    r.setProperty("--c-panel2", p.bg[1]);
    return reset;
  }, [s.colorShift]);

  useEffect(() => {
    const r = document.documentElement.style;
    document.documentElement.setAttribute("data-font", s.font);
    document.documentElement.setAttribute("data-accent", s.accent);
    r.setProperty("--glow", String(s.glow));
    r.setProperty("--neon-bright", String(s.neonBright));
    r.setProperty("--neon-speed", `${s.neonSpeed}s`);
    r.setProperty("--music-glow", String(s.musicGlow));
    document.documentElement.setAttribute("data-anim-neon", s.animNeon ? "on" : "off");
    document.documentElement.setAttribute("data-anim-shine", s.animShine ? "on" : "off");
    document.documentElement.setAttribute("data-blend", s.blendMode);
    sfx.setVolume(s.soundVol);
  }, [s.font, s.accent, s.glow, s.neonBright, s.neonSpeed, s.soundVol, s.musicGlow, s.animNeon, s.animShine, s.blendMode]);

  // 自定义背景图 + 主页透明开关
  useEffect(() => {
    const b = document.body.style;
    if (s.bgImage) {
      b.backgroundImage = `url("${s.bgImage}")`;
      b.backgroundSize = "cover";
      b.backgroundPosition = "center";
      b.backgroundRepeat = "no-repeat";
      b.backgroundAttachment = "fixed";
    } else {
      b.backgroundImage = ""; b.backgroundSize = ""; b.backgroundPosition = ""; b.backgroundRepeat = ""; b.backgroundAttachment = "";
    }
    document.documentElement.setAttribute("data-home-transparent", s.homeTransparent ? "on" : "off");
    // 可读性增强的真正锚点：只要设置了背景图就要保证文字可读，与"透明化"开关无关
    // （旧逻辑挂在 transparent 上，用户关掉开关后背景图仍显示但衬底/描边全部失效，字全糊在背景里）
    document.documentElement.setAttribute("data-has-bg", s.bgImage ? "on" : "off");
    document.documentElement.setAttribute("data-bg-tone", s.bgTone);
  }, [s.bgImage, s.homeTransparent, s.bgTone]);

  // 点击音效：事件委托，仅在 click 时触发（非 hover，大幅减少事件频率）
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest?.("[data-sound]") as HTMLElement | null;
      if (t) sfx.play(t.dataset.sound || "tools", "click");
    };
    document.addEventListener("click", click, { passive: true });
    return () => document.removeEventListener("click", click);
  }, []);

  // 快捷键 Ctrl+K + 进入页面自动播放（autoplay 可能被拦截，首次人机交互时兜底恢复）
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    // 首次交互（点击/触摸/滚动/按键）才被浏览器放行音频；反复触发 activate，
    // 直到确认已在播放，才移除监听，避免"音源还没加载好导致第一次点击没反应、必须再点播放键"。
    const EVENTS = ["pointerdown", "pointerup", "keydown", "touchstart", "mousedown", "click", "scroll"];
    let done = false;
    const cleanup = () => EVENTS.forEach((ev) => window.removeEventListener(ev, resume));
    const resume = () => {
      if (done) return;
      void music.activate();
      if (music.getState().playing) { done = true; cleanup(); }
    };
    EVENTS.forEach((ev) => window.addEventListener(ev, resume, { passive: true }));
    // 进入即尝试自动播放；被浏览器拦截则靠上面的首次交互兜底
    const t = window.setTimeout(() => music.autoplay(), 800);
    window.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(t);
      cleanup();
      window.removeEventListener("keydown", key);
    };
  }, []);

  return null;
}

/* ============ 主区内容 ============ */
function PromoCard({ promo }: { promo: Promo }) {
  const acc = promo.color === "cyan" ? "var(--c-cyan)" : promo.color === "magenta" ? "var(--c-magenta)" : "var(--c-orange)";
  return (
    <a
      href={promo.link}
      onClick={(e) => {
        if (promo.link.startsWith("#")) { e.preventDefault(); window.location.hash = promo.link; }
      }}
      className="panel2 group relative flex min-w-0 flex-1 basis-52 flex-col gap-1 p-3.5 transition-transform hover:-translate-y-0.5"
      style={{ borderTop: `2px solid ${acc}` }}
    >
      <span className="absolute right-2 top-2 num text-[8px] tracking-[0.3em] text-[var(--c-dim)]">◈ PROMO</span>
      <span className="text-2xl leading-none">{promo.icon}</span>
      <span className="jittable truncate text-sm font-bold" style={{ color: acc }}>{promo.title}</span>
      <span className="text-[11px] leading-snug text-[var(--c-dim)]">{promo.desc}</span>
      <span className="num mt-auto text-[9px] tracking-widest text-[var(--c-dim)] opacity-0 transition-opacity group-hover:opacity-100 hidden sm:block">TAP TO EXPLORE ▸</span>
    </a>
  );
}

function Home() {
  const { categories, promos } = useStore();
  const st = stats();
  return (
    <div className="grid min-h-screen grid-cols-[minmax(0,1fr)] pt-16 lg:grid-cols-[264px_minmax(0,1fr)_56px]">
      <div className="col-span-full">
        <TopBar />
      </div>
      <Sidebar />
      <main className="min-w-0 px-3 pb-24 pt-3 lg:pb-10">
        <div className="mx-auto flex max-w-[1300px] flex-col gap-3">
          {/* 欢迎横幅（手机紧凑：小内边距 + 标题缩小 + 装饰标签组隐藏） */}
          <section className="panel relative overflow-hidden p-4 sm:p-7">
            <Corners />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 sm:gap-y-4">
              <div className="min-w-0 flex-1 basis-72">
                <h1 data-tk="welcome.title" className="num text-xl font-black tracking-wider neon-text sm:text-3xl">{t("welcome.title")}</h1>
                <p data-tk="welcome.sub" className="mt-1.5 text-sm text-[var(--c-dim)] sm:mt-2">{t("welcome.sub")}</p>
                <p data-tk="welcome.hint" className="mt-2 text-[11px] text-[var(--c-dim)] sm:mt-3">◈ {t("welcome.hint")}</p>
              </div>
              <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
                <span data-tk="welcome.tag" className="num border border-[var(--c-cyan)] px-2.5 py-1 text-[10px] tracking-[0.35em] text-[var(--c-cyan)]">◉ {t("welcome.tag")}</span>
                <div className="flex gap-1.5">
                  <span className="num border border-[var(--c-border)] px-2 py-1 text-[9px] tracking-widest text-[var(--c-magenta)]">NEON-CORE</span>
                  <span className="num border border-[var(--c-border)] px-2 py-1 text-[9px] tracking-widest text-[var(--c-orange)]">LOW-LATENCY</span>
                </div>
              </div>
            </div>
          </section>

          {/* 合作推广位 ×3 */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {promos.map((p) => <PromoCard key={p.id} promo={p} />)}
          </div>

          {/* DATA LOG 统计条 */}
          <section className="panel2 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5" aria-label="站点统计">
            <span data-tk="datalog.title" className="num text-[10px] font-bold tracking-[0.35em] text-[var(--c-cyan)]">◈ {t("datalog.title")}</span>
            {[
              { label: t("stat.parts"), value: st.parts, color: "var(--c-cyan)" },
              { label: t("stat.nodes"), value: st.nodes, color: "var(--c-magenta)" },
              { label: t("stat.linked"), value: st.linked, color: "var(--c-orange)" },
              { label: t("stat.pending"), value: st.pending, color: "var(--c-dim)" },
            ].map((c) => (
              <span key={c.label} className="flex items-baseline gap-1.5">
                <span className="text-[10px] text-[var(--c-dim)]">{c.label}</span>
                <span className="num text-lg font-bold leading-none" style={{ color: c.color }}>{c.value}</span>
              </span>
            ))}
          </section>

          {/* 三矩形框：公告发布区 / AI开源快讯 / 心情轮播（受最大活动范围约束，内容框内上下滚动） */}
          <div className="boards-row flex flex-col gap-3 lg:flex-row lg:max-h-[640px]">
            <ResizableBoard side="left" title={t("board.ann")} tag={t("ann.tag")} accent="orange" maxH={560}>
              <AnnounceBoard />
            </ResizableBoard>
            <ResizableBoard side="mid" title="AI · 开源快讯" tag="TECH" accent="cyan" maxH={560}>
              <TechNewsBoard />
            </ResizableBoard>
            <ResizableBoard side="right" title={t("board.mood")} tag="MOOD" accent="magenta" maxH={560}>
              <MoodPanel />
            </ResizableBoard>
          </div>

          {/* 分类大模块（懒挂载：仅渲染视口附近的分类） */}
          {categories.map((c) => <LazyCategory key={c.id} cat={c} />)}

          <footer className="pb-2 pt-1 text-center">
            <span data-tk="footer.line" className="text-[10px] tracking-wider text-[var(--c-dim)]">{t("footer.line")}</span>
          </footer>
        </div>
      </main>
      <RightRail />
    </div>
  );
}

export default function App() {
  const hash = useHashRoute();
  useEffect(() => { window.scrollTo(0, 0); }, [hash]);
  return (
    <>
      <GlobalEffects />
      {hash.startsWith("#/admin") ? <AdminPage /> : <Home />}
      {!hash.startsWith("#/admin") && <MechaPet />}
      {!hash.startsWith("#/admin") && <MusicAutoWatch />}
      <RotateOverlay />
      <Toaster />
    </>
  );
}
