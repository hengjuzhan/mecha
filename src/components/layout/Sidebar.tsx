import { useEffect, useState } from "react";
import { useStore } from "../../lib/dataService";
import { MusicPlayer } from "../music/MusicPlayer";
import { SettingsPanel } from "../widgets/SettingsPanel";

export function Sidebar() {
  const { categories } = useStore();
  const [active, setActive] = useState("1");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [musicSheet, setMusicSheet] = useState(false);

  // scrollspy：滚动监听高亮当前分区
  useEffect(() => {
    const els = categories
      .map((c) => document.getElementById(`cat-${c.no}`))
      .filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) if (en.isIntersecting) setActive(en.target.id.replace("cat-", ""));
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [categories]);

  const go = (no: number) => {
    document.getElementById(`cat-${no}`)?.scrollIntoView({ behavior: "smooth" });
    setMusicSheet(false);
  };

  const navBtns = categories.map((c) => {
    const isAct = String(c.no) === active;
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => go(c.no)}
        data-sound={c.sound}
        className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors ${
          isAct
            ? "border-[var(--c-cyan)] bg-[color-mix(in_srgb,var(--c-cyan)_8%,transparent)]"
            : "border-transparent hover:bg-[var(--c-panel2)]"
        }`}
        aria-current={isAct ? "true" : undefined}
      >
        <span className="num w-6 shrink-0 text-right text-xs text-[var(--c-dim)]">{String(c.no).padStart(2, "0")}</span>
        <span className="shrink-0 text-lg leading-none">{c.icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${isAct ? "neon-text" : ""}`}>{c.name}</span>
          <span className="num block truncate text-[9px] tracking-[0.25em] text-[var(--c-dim)]">{c.nameEn}</span>
        </span>
        {isAct && <span className="blink shrink-0 text-xs text-[var(--c-cyan)]">▸</span>}
      </button>
    );
  });

  return (
    <>
      {/* ===== 桌面左栏：264px 列，sticky 全高（≥1024；手机横屏 768-1023 走全宽+底部导航） ===== */}
      <aside className="glass sticky top-16 hidden h-[calc(100vh-4rem)] flex-col overflow-hidden lg:flex"
        style={{
          background: "color-mix(in srgb, var(--c-panel) 90%, transparent)",
          borderRight: "1px solid color-mix(in srgb, #ffffff 10%, var(--c-border))",
          boxShadow: "8px 0 24px rgb(0 0 0 / 0.22)",
        }}>
        <nav className="thin-scroll min-h-0 flex-1 overflow-y-auto py-2 pr-0.5" aria-label="分类导航">
          {navBtns}
        </nav>
        {/* 音乐模块：固定左栏底部，完全 containment */}
        <div className="mt-auto w-full shrink-0 overflow-hidden border-t border-[var(--c-border)] p-2">
          <MusicPlayer variant="rail" />
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="btn-mech m-2 mt-0 h-9 shrink-0 text-xs"
        >
          ⚙ 系统设置
        </button>
      </aside>

      {/* ===== 移动端底部标签栏（<1024px，含手机横屏） ===== */}
      <nav
        className="fixed inset-x-0 bottom-0 z-[100] flex h-14 items-stretch overflow-x-auto border-t border-[var(--c-border)] lg:hidden"
        aria-label="移动导航"
      >
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => go(c.no)}
            className="flex min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 px-1.5"
          >
            <span className="text-base leading-none">{c.icon}</span>
            <span className="text-[8px] leading-none text-[var(--c-dim)]">{c.name}</span>
          </button>
        ))}
        <span className="mx-1 my-2 w-px shrink-0 bg-[var(--c-border)]" />
        <button type="button" onClick={() => setMusicSheet(true)} className="flex min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 px-1.5">
          <span className="text-base leading-none">🎧</span>
          <span className="text-[8px] leading-none text-[var(--c-dim)]">音乐</span>
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)} className="flex min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 px-1.5">
          <span className="text-base leading-none">⚙️</span>
          <span className="text-[8px] leading-none text-[var(--c-dim)]">设置</span>
        </button>
      </nav>

      {/* 移动端音乐抽屉 */}
      <div
        className={`fixed inset-x-0 bottom-14 z-[400] transition-transform duration-200 lg:hidden ${musicSheet ? "translate-y-0" : "pointer-events-none translate-y-[130%]"}`}
      >
        <div className="panel border-t-2 border-[var(--c-cyan)] p-2 pb-3">
          <div className="mb-1 flex justify-end">
            <button type="button" className="btn-mech h-7 px-2.5 text-[10px]" onClick={() => setMusicSheet(false)}>收起 ▾</button>
          </div>
          <MusicPlayer variant="sheet" />
        </div>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
