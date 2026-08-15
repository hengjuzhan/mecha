import { useEffect, useMemo, useRef, useState } from "react";
import { searchAll, useStore, type SearchHit } from "../../lib/dataService";
import type { Announcement, Category, LinkItem } from "../../data/types";
import { cloud } from "../../lib/cloud";
import { extSearchURL } from "../../lib/utils";
import { locateHit } from "../../lib/locate";
import { Clock } from "../widgets/Clock";

const SCOPES: { id: string; label: string }[] = [
  { id: "site", label: "站内" },
  { id: "baidu", label: "百度" },
  { id: "google", label: "谷歌" },
  { id: "bing", label: "必应" },
  { id: "github", label: "GitHub" },
];

// 氛围增量程序：每天总增量固定在 800~1000（访客进入 +1 的真实访问不计入），按剩余时间匀速下发并带随机抖动
const LS_ATMO = "mechanav.visits.atmo";
interface AtmoState { date: string; added: number; target: number }
function readAtmo(): AtmoState {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const s = JSON.parse(localStorage.getItem(LS_ATMO) || "") as AtmoState;
    if (s && s.date === today && s.target >= 800 && s.target <= 1000) return s;
  } catch { /* 跨天/损坏则重新抽取 */ }
  return { date: today, added: 0, target: 800 + Math.floor(Math.random() * 201) };
}
function writeAtmo(s: AtmoState) {
  try { localStorage.setItem(LS_ATMO, JSON.stringify(s)); } catch { /* ignore */ }
}

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
  locateHit(h);
}

export function TopBar() {
  const { categories, links } = useStore();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("site");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => (scope === "site" ? searchAll(q) : []), [q, scope]);

  // 访问统计：云端权威（visits_bump），云端不可用自动回退本地计数；首帧先显示本地缓存避免跳变
  const [visits, setVisits] = useState(() => cloud.visits.cached());
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    let alive = true;
    const apply = (r: { today: number; total: number; online: boolean }) => {
      if (!alive) return;
      setDemo(!r.online);
      // 显示单调不减（避免多标签页/竞态回落）；管理员清空事件单独归零
      setVisits((v) => ({ today: Math.max(v.today, r.today), total: Math.max(v.total, r.total) }));
    };
    // 进入页面计数 +1（真实访问，不计入每日氛围配额）
    void cloud.visits.bump(1).then(apply);
    // 氛围增量：步进 2.5~4.5 分钟，每次按「剩余配额 / 预计剩余次数」下发，单次上限 12 保持自然
    let timer = 0;
    const tick = () => {
      const st = readAtmo();
      const remain = st.target - st.added;
      if (remain > 0) {
        const now = new Date();
        const minsLeft = 1440 - (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60);
        const ticksLeft = Math.max(1, minsLeft / 3.5);
        const ideal = remain / ticksLeft;
        const add = Math.max(1, Math.min(remain, 12, Math.round(ideal * (0.6 + Math.random() * 0.8))));
        st.added += add;
        writeAtmo(st);
        void cloud.visits.bump(add).then(apply);
      }
      timer = window.setTimeout(tick, (150 + Math.floor(Math.random() * 180)) * 1000);
    };
    timer = window.setTimeout(tick, 30000 + Math.floor(Math.random() * 60000));
    // 管理员清空访问人数时，顶栏计数即时归零（随后从 1 重新开始）
    const onReset = () => setVisits({ today: 0, total: 0 });
    window.addEventListener("mecha:visits-reset", onReset);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("mecha:visits-reset", onReset);
    };
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
                className="h-9 w-full min-w-0 rounded-sm border-0 bg-transparent pl-8 pr-8 text-sm outline-none placeholder:text-[var(--c-dim)]"
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
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <div className="panel2 relative px-1.5 py-1 text-center leading-tight lg:px-2.5">
            {demo && <span className="absolute -top-1.5 right-1 num rounded-sm bg-[var(--c-orange)] px-1 text-[7px] text-black lg:hidden">DM</span>}
            {demo && <span className="absolute -top-1.5 right-1 num hidden rounded-sm bg-[var(--c-orange)] px-1 text-[7px] text-black lg:block">DEMO</span>}
            <div className="num whitespace-nowrap text-[7px] tracking-widest text-[var(--c-dim)] sm:text-[8px]">今日</div>
            <div className="num whitespace-nowrap text-xs font-bold text-[var(--c-cyan)] sm:text-sm">{visits.today}</div>
          </div>
          <div className="panel2 relative px-1.5 py-1 text-center leading-tight lg:px-2.5">
            {demo && <span className="absolute -top-1.5 right-1 num rounded-sm bg-[var(--c-orange)] px-1 text-[7px] text-black lg:hidden">DM</span>}
            {demo && <span className="absolute -top-1.5 right-1 num hidden rounded-sm bg-[var(--c-orange)] px-1 text-[7px] text-black lg:block">DEMO</span>}
            <div className="num whitespace-nowrap text-[7px] tracking-widest text-[var(--c-dim)] sm:text-[8px]">累计</div>
            <div className="num whitespace-nowrap text-xs font-bold text-[var(--c-magenta)] sm:text-sm">{visits.total}</div>
          </div>
        </div>
      </div>
      <span className="num absolute right-3 bottom-0.5 hidden text-[8px] tracking-[0.3em] text-[var(--c-dim)] xl:block">
        {categories.length} 分区 · {links.length} 节点
      </span>
    </header>
  );
}
