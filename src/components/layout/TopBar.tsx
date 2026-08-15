import { useEffect, useMemo, useRef, useState } from "react";
import { getSettings, isBackendOk, setBackendOk, searchAll, setSettings, useStore, bumpVisitsLocal, type SearchHit } from "../../lib/dataService";
import type { Announcement, Category, LinkItem } from "../../data/types";
import { isSupabaseConfigured, bumpVisits } from "../../lib/supabase";
import { extSearchURL, jumpToId, todayStr } from "../../lib/utils";
import { Clock } from "../widgets/Clock";

const SCOPES: { id: string; label: string }[] = [
  { id: "site", label: "站内" },
  { id: "baidu", label: "百度" },
  { id: "google", label: "谷歌" },
  { id: "bing", label: "必应" },
  { id: "github", label: "GitHub" },
];

function MechaLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" className="drop-shadow-[0_0_6px_var(--c-cyan)]">
      <rect x="6" y="4" width="20" height="18" rx="2" fill="var(--c-cyan)" />
      <rect x="10" y="8" width="4" height="4" fill="var(--c-bg)" />
      <rect x="18" y="8" width="4" height="4" fill="var(--c-bg)" />
      <rect x="12" y="15" width="8" height="3" fill="var(--c-bg)" />
      <rect x="1" y="11" width="5" height="8" fill="var(--c-magenta)" />
      <rect x="26" y="11" width="5" height="8" fill="var(--c-magenta)" />
      <rect x="13" y="26" width="2.5" height="5" fill="var(--c-orange)" />
      <rect x="16.5" y="26" width="2.5" height="5" fill="var(--c-orange)" />
      <rect x="2" y="2" width="3" height="3" fill="var(--c-orange)" />
      <rect x="27" y="2" width="3" height="3" fill="var(--c-orange)" />
    </svg>
  );
}

function hitJump(h: SearchHit) {
  if (h.kind === "link") return jumpToId(`card-${h.ref.no}`);
  if (h.kind === "cat") return jumpToId(`cat-${h.ref.no}`);
  return jumpToId(`ann-${h.ref.no}`);
}

export function TopBar() {
  const { categories, links } = useStore();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("site");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => (scope === "site" ? searchAll(q) : []), [q, scope]);

  // 访问统计（本地演示 / Supabase）
  const [visits, setVisits] = useState(() => {
    const s = getSettings();
    return { today: s.visitsToday, total: s.visitsTotal };
  });
  const [demo, setDemo] = useState(() => !isBackendOk());
  useEffect(() => {
    setVisits(bumpVisitsLocal()); // 按天去重，副作用在 effect 中执行
    const cfg = getSettings().supabase;
    if (isSupabaseConfigured(cfg)) {
      void bumpVisits(cfg).then((r) => {
        if (r) {
          setBackendOk(true); setDemo(false);
          // 后端统计只向上取 max，避免显示回落（忽高忽低）
          setVisits((v) => ({ today: Math.max(v.today, r.today), total: Math.max(v.total, r.total) }));
        }
      });
    }
  }, []);

  // 顶部人数：随机间隔（约 0.5~2.5 分钟）+ 随机人数（每次 +1~+4），单调不减，
  // 并持久化到设置，刷新后从上次值继续递增（不回退）
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setVisits((v) => {
        const inc = 1 + Math.floor(Math.random() * 4); // 每次随机增加 1~4 人
        const next = { today: v.today + inc, total: v.total + inc };
        // 持久化到设置，刷新后从上次值继续递增，不回退
        setSettings({ visitsToday: next.today, visitsTotal: next.total, visitsDay: todayStr() });
        return next;
      });
      // 下一次触发间隔随机：30s ~ 150s（约 0.5~2.5 分钟）
      timer = window.setTimeout(tick, 30000 + Math.floor(Math.random() * 120000));
    };
    timer = window.setTimeout(tick, 30000 + Math.floor(Math.random() * 120000));
    return () => window.clearTimeout(timer);
  }, []);

  const submit = () => {
    const query = q.trim();
    if (!query) return;
    if (scope === "site") {
      const first = hits[0];
      if (first) { hitJump(first); setQ(""); setOpen(false); }
    } else {
      const url = extSearchURL(scope, query);
      if (url) window.open(url, "_blank", "noopener");
    }
  };

  return (
    <header className="glass fixed inset-x-0 top-0 z-[100] h-16 border-b"
      style={{
        background: "color-mix(in srgb, var(--c-panel) 90%, transparent)",
        borderColor: "color-mix(in srgb, #ffffff 10%, var(--c-border))",
        boxShadow: "0 4px 24px rgb(0 0 0 / 0.28)",
      }}>
      <div className="mx-auto flex h-full max-w-[1700px] items-center gap-3 px-3">
        {/* 左上机甲 LOGO */}
        <div className="flex shrink-0 items-center gap-2.5">
          <MechaLogo />
          <div className="hidden leading-none sm:block">
            <div className="num neon-text text-sm font-black tracking-[0.2em]">MECHA-NAV</div>
            <div className="num mt-0.5 text-[8px] tracking-[0.4em] text-[var(--c-dim)]">NAVIGATION CORE</div>
          </div>
        </div>

        {/* 总搜索 */}
        <div ref={boxRef} className="relative min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="panel2 relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--c-cyan)]">⌕</span>
              <input
                id="global-search"
                type="search"
                value={q}
                placeholder="搜索站点 / 编号 L0001 / 公告 P0001 / 分类名 …"
                className="h-9 w-full rounded-sm border-0 bg-transparent pl-8 pr-8 text-sm outline-none placeholder:text-[var(--c-dim)]"
                style={{ border: "none", boxShadow: "none" }}
                onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => setOpen(false), 180)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") { setOpen(false); setQ(""); }
                }}
              />
              {q && (
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--c-dim)] hover:text-[var(--c-text)]"
                  onClick={() => { setQ(""); }} aria-label="清空">✕</button>
              )}
            </div>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              aria-label="搜索范围"
              className="num h-9 shrink-0 cursor-pointer rounded-sm border border-[var(--c-border)] bg-[var(--c-panel2)] px-1.5 text-xs text-[var(--c-cyan)] outline-none"
            >
              {SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button type="button" className="btn-mech h-9 shrink-0 px-3 text-sm" onClick={submit}>检索</button>
          </div>

          {/* 下拉结果 */}
          {open && scope === "site" && q.trim() && (
            <div className="panel panel-glow absolute left-0 right-0 top-full z-[130] mt-2 max-h-80 overflow-y-auto p-1.5 thin-scroll">
              {hits.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[var(--c-dim)]">未匹配到相关节点</div>
              ) : hits.map((h) => {
                const link = h.kind === "link" ? (h.ref as LinkItem) : null;
                const cat = h.kind === "cat" ? (h.ref as Category) : null;
                const ann = h.kind === "ann" ? (h.ref as Announcement) : null;
                return (
                  <button
                    key={`${h.kind}-${(h.ref as LinkItem | Category | Announcement).no || h.ref.id}`}
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm hover:bg-[var(--c-panel2)]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { hitJump(h); setQ(""); setOpen(false); }}
                  >
                    <span className={`num shrink-0 border px-1 text-[9px] tracking-widest ${
                      h.kind === "link" ? "border-[var(--c-cyan)] text-[var(--c-cyan)]" :
                      h.kind === "cat" ? "border-[var(--c-magenta)] text-[var(--c-magenta)]" :
                      "border-[var(--c-orange)] text-[var(--c-orange)]"}`}>
                      {h.kind === "link" ? link?.no : h.kind === "cat" ? `C0${cat?.no}` : ann?.no}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {link && <span className="mr-1.5">{link.icon}</span>}
                      {link?.name ?? cat?.name ?? ann?.title}
                    </span>
                    <span className="max-w-[40%] truncate text-[10px] text-[var(--c-dim)]">
                      {link?.desc ?? cat?.nameEn ?? ann?.time}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 时钟 + 统计 + GitHub */}
        <div className="hidden lg:block shrink-0"><Clock /></div>
        <div className="hidden shrink-0 items-center gap-1.5 xl:flex">
          <div className="panel2 relative px-2.5 py-1 text-center leading-tight">
            {demo && <span className="absolute -top-1.5 right-1 num rounded-sm bg-[var(--c-orange)] px-1 text-[7px] text-black">DEMO</span>}
            <div className="num text-[8px] tracking-widest text-[var(--c-dim)]">今日访问</div>
            <div className="num text-sm font-bold text-[var(--c-cyan)]">{visits.today}</div>
          </div>
          <div className="panel2 relative px-2.5 py-1 text-center leading-tight">
            {demo && <span className="absolute -top-1.5 right-1 num rounded-sm bg-[var(--c-orange)] px-1 text-[7px] text-black">DEMO</span>}
            <div className="num text-[8px] tracking-widest text-[var(--c-dim)]">累计访问</div>
            <div className="num text-sm font-bold text-[var(--c-magenta)]">{visits.total}</div>
          </div>
        </div>
      </div>
      <span className="num absolute right-3 bottom-0.5 hidden text-[8px] tracking-[0.3em] text-[var(--c-dim)] xl:block">
        {categories.length} 分区 · {links.length} 节点
      </span>
    </header>
  );
}
