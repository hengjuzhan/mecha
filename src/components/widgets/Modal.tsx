import { useEffect, type ReactNode } from "react";

export function Corners() {
  return (
    <>
      <span className="qd tl" /><span className="qd tr" /><span className="qd bl" /><span className="qd br" />
    </>
  );
}

export function Modal({
  open, onClose, title, children, z = 500, width = 560,
}: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; z?: number; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0" style={{ zIndex: z }} onClick={onClose}>
      {/* 全屏遮罩不用 backdrop-blur：它会逐帧重模糊整页（643 张卡片 + 桌宠/频谱），
          是打开弹窗卡顿的主因；改用不透明的深色遮罩，仅轻微半透明保证对比，无重绘开销 */}
      <div className="absolute inset-0 bg-black/72" />
      <div
        className="absolute left-1/2 top-1/2 max-h-[88vh] w-[min(94vw,100%)] -translate-x-1/2 -translate-y-1/2 overflow-auto"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel relative p-4">
          <Corners />
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--c-border)] pb-2.5">
            <div className="num flex items-center gap-2 text-sm font-bold tracking-widest neon-text">{title}</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="btn-mech h-7 w-7 text-xs"
            >✕</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
