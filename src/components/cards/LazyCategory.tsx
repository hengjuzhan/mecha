import { useEffect, useRef, useState, memo } from "react";
import type { Category } from "../../data/types";
import { CategoryModule } from "./CategoryModule";

/* 只挂载、永不卸载：懒加载一次后常驻，离屏绘制交给 content-visibility:auto 跳过。
   避免"下滑再上滑后 IO 不触发、分类渲染不出"的卸载/重挂载 bug。 */
const mountIO = typeof IntersectionObserver !== "undefined"
  ? new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const cb = (e.target as any)._catMount as (() => void) | undefined;
            if (cb) cb();
          }
        }
      },
      { rootMargin: "1200px 0px" },
    )
  : null;

/* 搜索定位：强制挂载指定编号的分类，即使它离屏未懒加载。 */
const forced = new Set<number>();
const forcedListeners = new Set<() => void>();
export function forceMountCategory(no: number) {
  forced.add(no);
  forcedListeners.forEach((fn) => fn());
}

export const LazyCategory = memo(function LazyCategory({ cat }: { cat: Category }) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !mountIO) { setMounted(true); return; }
    if (forced.has(cat.no)) { setMounted(true); return; }
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 1200 && rect.bottom > -1200) {
      setMounted(true);
    } else {
      (el as any)._catMount = () => setMounted(true);
      mountIO.observe(el);
    }
    const onForced = () => { if (forced.has(cat.no)) setMounted(true); };
    forcedListeners.add(onForced);
    return () => {
      mountIO!.unobserve(el);
      (el as any)._catMount = null;
      forcedListeners.delete(onForced);
    };
  }, [cat.no]);

  return (
    <div id={`cat-${cat.no}`} data-anchor ref={ref}>
      {mounted
        ? <CategoryModule cat={cat} />
        : <div className="flex items-center justify-center" style={{ height: 380 }}>
            <span className="num text-xs tracking-widest text-[var(--c-dim)] blink">LOADING…</span>
          </div>}
    </div>
  );
});