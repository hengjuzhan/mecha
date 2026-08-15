import { useEffect, useRef, useState, memo } from "react";
import type { LinkItem } from "../../data/types";
import { SiteCard } from "./SiteCard";

/* 只挂载、永不卸载：懒加载一次后常驻，离屏卡片的绘制由分类的 content-visibility:auto 跳过 */
const mountIO = typeof IntersectionObserver !== "undefined"
  ? new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const cb = (e.target as any)._mountCb as (() => void) | undefined;
            if (cb) cb();
          }
        }
      },
      { rootMargin: "200px 0px" },
    )
  : null;

/* 搜索定位：强制挂载指定编号的卡片，即使它离屏未懒加载。只增不删（挂载后常驻）。 */
const forced = new Set<string>();
const forcedListeners = new Set<() => void>();
export function forceMountCard(no: string) {
  forced.add(no);
  forcedListeners.forEach((fn) => fn());
}

export const LazyCard = memo(function LazyCard({
  link, sound, onContext,
}: {
  link: LinkItem;
  sound?: string;
  onContext: (x: number, y: number, link: LinkItem) => void;
}) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !mountIO) { setShow(true); return; }
    if (forced.has(link.no)) { setShow(true); return; }
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
      setShow(true);
    } else {
      (el as any)._mountCb = () => setShow(true);
      mountIO.observe(el);
    }
    const onForced = () => { if (forced.has(link.no)) setShow(true); };
    forcedListeners.add(onForced);
    return () => {
      mountIO!.unobserve(el);
      (el as any)._mountCb = null;
      forcedListeners.delete(onForced);
    };
  }, [link.no]);

  return (
    <div ref={ref} className="min-h-0">
      {show
        ? <SiteCard link={link} sound={sound} onContext={onContext} />
        : <div className="panel2 flex min-h-[72px] items-center justify-center" style={{ opacity: 0 }} />}
    </div>
  );
});