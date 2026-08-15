import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, LinkItem } from "../../data/types";
import { useStore } from "../../lib/dataService";
import { copyText } from "../../lib/utils";
import { LazyCard } from "./LazyCard";
import { PreviewModal } from "./PreviewModal";
import { toast } from "../widgets/Toast";
import { Corners } from "../widgets/Modal";

/** 分类大模块：标题 + 子分类 tabs + 固定高度横向滑动卡片带（3 行 × 5 列/屏） */
export function CategoryModule({ cat }: { cat: Category }) {
  const { links } = useStore();
  const stripRef = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState("全部");
  const [menu, setMenu] = useState<{ x: number; y: number; link: LinkItem } | null>(null);
  const [preview, setPreview] = useState<LinkItem | null>(null);

  const list = useMemo(
    () => links.filter((l) => l.cat === cat.id && (sub === "全部" || l.sub === sub)),
    [links, cat.id, sub],
  );

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  const scrollBy = (dir: number) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  const openMenu = (x: number, y: number, link: LinkItem) => {
    setMenu({ x: Math.min(x, window.innerWidth - 180), y: Math.min(y, window.innerHeight - 150), link });
  };

  const doCopy = async (link: LinkItem) => {
    const ok = await copyText(link.url);
    toast(ok ? `已复制链接：${link.name}` : "复制失败", ok ? "ok" : "warn");
    setMenu(null);
  };

  return (
    <section className="panel lazy-cat relative p-3.5 sm:p-4">
      <Corners />
      {/* 头部 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-sound={cat.sound}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="num text-2xl font-black tracking-wider neon-mag">{String(cat.no).padStart(2, "0")}</span>
          <span className="text-2xl leading-none">{cat.icon}</span>
          <div className="min-w-0">
            <h2 className="jittable truncate text-base font-bold tracking-wide sm:text-lg">{cat.name}</h2>
            <div className="num text-[9px] tracking-[0.35em] text-[var(--c-dim)]">{cat.nameEn} · {list.length} NODES</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="mr-1 flex gap-1" role="tablist" aria-label={`${cat.name}子分类`}>
            {["全部", ...cat.subcats].map((s2) => (
              <button
                key={s2}
                type="button"
                role="tab"
                aria-selected={sub === s2}
                onClick={() => setSub(s2)}
                className={`h-7 px-2.5 text-xs transition-colors ${
                  sub === s2
                    ? "border border-[var(--c-cyan)] bg-[color-mix(in_srgb,var(--c-cyan)_14%,transparent)] text-[var(--c-cyan)]"
                    : "border border-[var(--c-border)] text-[var(--c-dim)] hover:text-[var(--c-text)]"
                }`}
              >
                {s2}
              </button>
            ))}
          </div>
          <button type="button" className="btn-mech h-7 w-7 text-xs" onClick={() => scrollBy(-1)} aria-label="向左滑动">‹</button>
          <button type="button" className="btn-mech h-7 w-7 text-xs" onClick={() => scrollBy(1)} aria-label="向右滑动">›</button>
        </div>
      </div>

      {/* 卡片带：固定高度，每屏 3 行 × 5 列，其余横向滑动 */}
      <div
        ref={stripRef}
        className="card-strip mt-3"
        tabIndex={0}
        aria-label={`${cat.name}站点列表，可横向滑动`}
      >
        {list.map((l) => (
          <LazyCard key={l.id} link={l} sound={cat.sound} onContext={openMenu} />
        ))}
      </div>

      {/* 右键/长按菜单 */}
      {menu && (
        <div
          className="panel panel-glow fixed z-[500] w-44 p-1"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-[var(--c-panel2)]"
            onClick={() => { window.open(menu.link.url, "_blank", "noopener"); setMenu(null); }}>
            <span>🔗</span>打开站点
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-[var(--c-panel2)]"
            onClick={() => { setPreview(menu.link); setMenu(null); }}>
            <span>🖥️</span>站内预览
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-[var(--c-panel2)]"
            onClick={() => void doCopy(menu.link)}>
            <span>📋</span>复制链接
          </button>
        </div>
      )}

      <PreviewModal link={preview} onClose={() => setPreview(null)} />
    </section>
  );
}
