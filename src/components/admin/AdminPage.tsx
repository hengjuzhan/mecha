import { lazy, startTransition, Suspense, useState } from "react";
import { isAdminSession, setAdminSession, AdminLogin } from "./AdminLogin";

// 各 tab 内容懒加载：仅渲染当前 tab，其余按需异步加载，降低进入后台时的首帧同步渲染成本
const sectionMap: Record<string, React.LazyExoticComponent<() => React.JSX.Element>> = {
  links: lazy(() => import("./AdminSections").then((m) => ({ default: m.LinksSection }))),
  cats: lazy(() => import("./AdminSections").then((m) => ({ default: m.CatsSection }))),
  ann: lazy(() => import("./AdminSections").then((m) => ({ default: m.AnnSection }))),
  promo: lazy(() => import("./AdminSections").then((m) => ({ default: m.PromoSection }))),
  music: lazy(() => import("./AdminSystem").then((m) => ({ default: m.MusicSection }))),
  appear: lazy(() => import("./AdminSystem").then((m) => ({ default: m.AppearanceSection }))),
  data: lazy(() => import("./AdminSystem").then((m) => ({ default: m.DataSection }))),
  sys: lazy(() => import("./AdminSystem").then((m) => ({ default: m.SystemSection }))),
};
const SectionLazy = ({ id }: { id: string }) => {
  const Comp = sectionMap[id];
  return (
    <Suspense fallback={<div className="py-10 text-center text-xs text-[var(--c-dim)]">加载中…</div>}>
      <Comp />
    </Suspense>
  );
};

const TABS: { id: string; label: string }[] = [
  { id: "links", label: "▣ 站点" },
  { id: "cats", label: "▣ 分区" },
  { id: "ann", label: "▣ 公告" },
  { id: "promo", label: "▣ 推广位" },
  { id: "music", label: "▣ 音乐源" },
  { id: "appear", label: "▣ 外观" },
  { id: "data", label: "▣ 备份" },
  { id: "sys", label: "▣ 系统" },
];

export function AdminPage() {
  const [ok, setOk] = useState(isAdminSession());
  const [tab, setTab] = useState("links");

  if (!ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-3">
        <AdminLogin open onClose={() => { /* 无会话不允许直接关闭，改为返回导航页 */ window.location.hash = "#/"; }} onSuccess={() => setOk(true)} />
        <button
          type="button"
          className="btn-mech mag h-9 px-4 text-xs"
          onClick={() => { window.location.hash = "#/"; }}
        >← 返回导航页（退出验证）</button>
      </div>
    );
  }

  const logout = () => {
    setAdminSession(false);
    window.location.hash = "#/";
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[100] h-14 border-b border-[var(--c-border)]"
        style={{ background: "color-mix(in srgb, var(--c-panel) 92%, transparent)", backdropFilter: "blur(8px)" }}>
        <div className="mx-auto flex h-full max-w-[1280px] items-center gap-3 px-3">
          <div className="num neon-mag text-sm font-black tracking-[0.25em]">◉ BACK-STAGE · 后台</div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn-mech h-8 px-3 text-xs" onClick={() => { window.location.hash = "#/"; }}>✎ 前往导航页行内编辑</button>
            <button type="button" className="btn-mech mag h-8 px-3 text-xs" onClick={logout}>退出</button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1280px] flex-col gap-3 px-3 py-4">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => startTransition(() => setTab(tb.id))}
              className={`h-9 px-3.5 text-xs transition-colors ${
                tab === tb.id
                  ? "border border-[var(--c-cyan)] bg-[color-mix(in_srgb,var(--c-cyan)_14%,transparent)] text-[var(--c-cyan)]"
                  : "border border-[var(--c-border)] text-[var(--c-dim)] hover:text-[var(--c-text)]"
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <SectionLazy id={tab} />
        <footer className="pb-6 pt-2 text-center text-[10px] text-[var(--c-dim)]">
          BACK-STAGE MODE · 所有改动实时持久化到本地
        </footer>
      </main>
    </div>
  );
}