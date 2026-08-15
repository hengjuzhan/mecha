import { useState } from "react";
import { useStore, t } from "../../lib/dataService";

export function AnnounceBoard() {
  const { announcements } = useStore();
  const [zoom, setZoom] = useState<string | null>(null);
  // 置顶公告优先置前，其余按发布顺序
  const list = [...announcements].sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0)).slice(0, 8);
  if (list.length === 0) {
    return <div className="py-8 text-center text-sm text-[var(--c-dim)]">{t("board.ann.empty")}</div>;
  }
  return (
    <div className="thin-scroll flex h-full flex-col gap-2 overflow-y-auto pr-1">
      {list.map((a) => (
        <div key={a.id} id={`ann-${a.no}`} data-anchor className={`panel2 shrink-0 p-2.5 text-sm ${a.pinned ? "border-l-2 border-[var(--c-orange)]" : ""}`}>
          <div className="flex items-center gap-2">
            {a.pinned && <span className="shrink-0 text-sm leading-none" title="置顶公告">📌</span>}
            <span className="num shrink-0 border border-[var(--c-cyan)] px-1 text-[9px] tracking-wider text-[var(--c-cyan)]">{a.no}</span>
            <span className={`num shrink-0 px-1 text-[9px] tracking-widest ${a.kind === "link" ? "text-[var(--c-magenta)]" : a.kind === "image" ? "text-[var(--c-orange)]" : "text-[var(--c-dim)]"}`}>
              [{a.kind === "link" ? "LINK" : a.kind === "image" ? "IMAGE" : "TEXT"}]
            </span>
            <span className="min-w-0 truncate font-medium">{a.title}</span>
          </div>
          {a.kind === "image" ? (
            <img
              src={a.content}
              alt={a.title}
              loading="lazy"
              className="mt-1.5 max-h-40 w-full cursor-zoom-in object-contain transition-opacity hover:opacity-80"
              onClick={() => setZoom(a.content)}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : a.kind === "link" ? (
            <a href={a.content} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs text-[var(--c-cyan)] hover:underline">{a.content}</a>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-[var(--c-dim)]">{a.content}</p>
          )}
          <div className="num mt-1 text-[9px] tracking-[0.25em] text-[var(--c-dim)]">{a.time}</div>
        </div>
      ))}

      {/* 点击放大查看 */}
      {zoom && (
        <div
          className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setZoom(null)}
        >
          <button
            type="button"
            aria-label="关闭"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-sm border border-[var(--c-border)] text-xl text-[var(--c-text)] hover:border-[var(--c-cyan)] hover:text-[var(--c-cyan)]"
          >✕</button>
          <img
            src={zoom}
            alt="放大查看"
            className="max-h-[90vh] max-w-[92vw] object-contain shadow-[0_0_40px_color-mix(in_srgb,var(--c-cyan)_30%,transparent)]"
            onClick={(e) => e.stopPropagation()}
          />
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.3em] text-[var(--c-dim)]">点击任意处关闭 · CLICK TO CLOSE</span>
        </div>
      )}
    </div>
  );
}