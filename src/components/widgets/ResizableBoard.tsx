import { useEffect, useRef, useState, type ReactNode } from "react";
import { getSettings, setSettings } from "../../lib/dataService";
import type { Settings } from "../../data/types";
import { clamp } from "../../lib/utils";

/**
 * 可调大小矩形面板：左/中/右三列（<768px 上下堆叠），带 resize 手柄。
 * 活动范围受限：横向 min/max、纵向受 maxH（最大活动高度）约束，超出内容在框内上下滚动。
 */
const W_INIT: Record<Side, number> = { left: 0.38, mid: 0.3, right: 0.32 };
const KEY: Record<Side, "boardLeft" | "boardMid" | "boardRight"> = {
  left: "boardLeft", mid: "boardMid", right: "boardRight",
};
type Side = "left" | "mid" | "right";

export function ResizableBoard({
  side, title, tag, accent, maxH = 600, children,
}: {
  side: Side;
  title: string;
  tag: string;
  accent: "cyan" | "magenta" | "orange";
  maxH?: number;
  children: ReactNode;
}) {
  const key = KEY[side];
  const [size, setSize] = useState(() => getSettings()[key]);
  const boxRef = useRef<HTMLDivElement>(null);

  // 首次布局：按预设百分比计算宽度像素并持久化（移动端全宽堆叠）
  useEffect(() => {
    if (size.w > 0) return;
    const box = boxRef.current;
    if (!box?.parentElement) return;
    const pw = box.parentElement.clientWidth;
    const pct = W_INIT[side];
    const w = window.innerWidth < 768 ? pw : Math.max(240, Math.round(pw * pct));
    const patch: Partial<Settings> = { [key]: { w, h: size.h } };
    setSettings(patch);
    setSize({ w, h: size.h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const box = boxRef.current;
    if (!box) return;
    const sx = e.clientX, sy = e.clientY, sw = box.offsetWidth, sh = box.offsetHeight;
    const move = (ev: PointerEvent) => {
      const nw = clamp(Math.round(sw + ev.clientX - sx), 240, 1400);
      const nh = clamp(Math.round(sh + ev.clientY - sy), 160, maxH); // 受最大活动范围约束
      setSize({ w: nw, h: nh });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const s = getSettings();
      const patch: Partial<Settings> = { [key]: { ...s[key] } };
      if (boxRef.current) {
        const b = boxRef.current;
        patch[key] = { w: clamp(b.offsetWidth, 240, 1400), h: clamp(b.offsetHeight, 160, maxH) };
      }
      setSettings(patch);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // 移动端/平板：用 +/- 按钮调节高度（拖拽手柄在触屏上难以操作）
  const bumpH = (delta: number) => {
    const nh = clamp(size.h + delta, 160, maxH);
    setSize({ ...size, h: nh });
    const s = getSettings();
    setSettings({ [key]: { ...s[key], h: nh } });
  };

  const acc = accent === "cyan" ? "var(--c-cyan)" : accent === "magenta" ? "var(--c-magenta)" : "var(--c-orange)";
  const flexBasis = size.w > 0 ? size.w : W_INIT[side] * 100 + "%";

  return (
    <div
      ref={boxRef}
      className="panel relative flex min-w-0 flex-col"
      style={{
        flexBasis,
        flexGrow: 0,
        flexShrink: 1,
        height: size.h,
        maxHeight: maxH,
        minHeight: 160,
      }}
    >
      <span className="qd tl" /><span className="qd tr" /><span className="qd bl" /><span className="qd br" />
      <div className="flex items-center justify-between gap-2 border-b border-[var(--c-border)] px-3 py-2">
        <span className="min-w-0 truncate text-sm font-semibold tracking-wide">{title}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center gap-1 lg:hidden">
            <button type="button" onClick={() => bumpH(-60)}
              className="grid h-7 w-7 place-items-center rounded border border-[var(--c-border)] text-base leading-none text-[var(--c-dim)] active:scale-90"
              aria-label="调小高度">−</button>
            <button type="button" onClick={() => bumpH(60)}
              className="grid h-7 w-7 place-items-center rounded border border-[var(--c-border)] text-base leading-none text-[var(--c-dim)] active:scale-90"
              aria-label="调大高度">+</button>
          </div>
          <span className="num text-[9px] tracking-[0.3em]" style={{ color: acc }}>◈ {tag}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-2.5">{children}</div>
      <div className="resize-handle h" style={side === "right" ? { left: 0, right: "auto" } : undefined}
        onPointerDown={(e) => startDrag(e)} aria-hidden="true" />
      <div className="resize-handle v" onPointerDown={(e) => startDrag(e)} aria-hidden="true" />
    </div>
  );
}