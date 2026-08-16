import { useRef } from "react";
import type { LinkItem } from "../../data/types";
import { setLinks, useStore } from "../../lib/dataService";
import { toast } from "../widgets/Toast";

/**
 * 站点卡片：点击新标签打开；右键 / 长按弹出操作菜单；
 * 占位卡显示为虚线空槽，不可点击。
 */
export function SiteCard({
  link, sound, onContext,
}: {
  link: LinkItem;
  sound?: string;
  onContext: (x: number, y: number, link: LinkItem) => void;
}) {
  const longTimer = useRef<number | null>(null);
  const held = useRef(false);
  const sx = useRef(0);
  const sy = useRef(0);
  const suppressed = useRef(false);
  const { links } = useStore();

  const cancel = () => {
    if (longTimer.current) { window.clearTimeout(longTimer.current); longTimer.current = null; }
  };

  const removeCard = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setLinks(links.filter((l) => l.id !== link.id));
    toast(`已删除：${link.name}`, "ok");
  };

  if (link.placeholder) {
    return (
      <div className="ph-deck" tabIndex={0} aria-label="待填充占位">
        <div className="ph-card ph-1" />
        <div className="ph-card ph-2" />
        <div className="ph-card ph-3">
          <span className="text-base leading-none">⬡</span>
          <span className="ph-fill text-[11px] text-[var(--c-dim)]">待填充</span>
          <span className="num text-[8px] tracking-[0.2em] text-[var(--c-dim)]">{link.no}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`card-${link.no}`}
      data-anchor
      data-sound={sound}
      role="link"
      tabIndex={0}
      aria-label={`${link.name} ${link.desc}`}
      className="panel2 group relative flex h-full min-w-0 flex-col overflow-hidden p-2 transition-[border-color] duration-150 hover:border-[var(--c-cyan)] hover:shadow-[0_0_14px_color-mix(in_srgb,var(--c-cyan)_25%,transparent)]"
      onClick={() => {
        if (suppressed.current) { suppressed.current = false; return; }
        window.open(link.url, "_blank", "noopener");
      }}
      onKeyDown={(e) => { if (e.key === "Enter") window.open(link.url, "_blank", "noopener"); }}
      onContextMenu={(e) => { e.preventDefault(); onContext(e.clientX, e.clientY, link); }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        held.current = false;
        sx.current = e.clientX; sy.current = e.clientY;
        cancel();
        longTimer.current = window.setTimeout(() => { held.current = true; }, 550);
      }}
      onPointerMove={(e) => {
        if (Math.abs(e.clientX - sx.current) > 10 || Math.abs(e.clientY - sy.current) > 10) { cancel(); held.current = false; }
      }}
      onPointerUp={(e) => {
        cancel();
        if (held.current) {
          held.current = false;
          suppressed.current = true;
          onContext(e.clientX, e.clientY, link);
        }
      }}
      onPointerLeave={() => { cancel(); held.current = false; }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg leading-none">{link.icon}</span>
        <div className="flex items-start gap-1">
          <button
            type="button"
            aria-label="删除此站点"
            title="删除此站点"
            className="admin-del hidden h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-[var(--c-magenta)] bg-[var(--c-panel)] text-[11px] leading-none text-[var(--c-magenta)] hover:bg-[var(--c-magenta)] hover:text-black"
            onClick={removeCard}
          >✕</button>
          {link.badge && (
            <span className={`num px-1 py-0.5 text-[8px] font-bold tracking-widest ${link.badge === "NEW" ? "bg-[var(--c-magenta)] text-white" : "bg-[var(--c-orange)] text-black"}`}>
              {link.badge}
            </span>
          )}
        </div>
      </div>
      <div className="jittable mt-1 truncate text-xs font-medium group-hover:text-[var(--c-cyan)]">{link.name}</div>
      <div className="card-desc mt-0.5 line-clamp-1 text-[10px] text-[var(--c-dim)]">{link.desc}</div>
      <div className="num mt-auto truncate pt-1 text-[8px] tracking-[0.16em] text-[var(--c-cyan)]">{link.no} ◈ {link.sub}</div>
    </div>
  );
}
