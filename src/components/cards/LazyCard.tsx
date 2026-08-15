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
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
      setShow(true);
    } else {
      (el as any)._mountCb = () => setShow(true);
      mountIO.observe(el);
    }
    return () => {
      mountIO!.unobserve(el);
      (el as any)._mountCb = null;
    };
  }, []);

  return (
    <div ref={ref} className="min-h-0">
      {show
        ? <SiteCard link={link} sound={sound} onContext={onContext} />
        : <div className="panel2 flex min-h-[72px] items-center justify-center" style={{ opacity: 0 }} />}
    </div>
  );
});