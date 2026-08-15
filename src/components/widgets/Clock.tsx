import { useEffect, useState } from "react";
import { pad2, weekName } from "../../lib/utils";

export function Clock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="flex select-none flex-col items-end leading-none" aria-label={`当前时间 ${now.toLocaleString()}`}>
      <div className="num neon-text text-base font-bold tracking-[0.15em] tabular-nums md:text-xl">
        {pad2(now.getHours())}:{pad2(now.getMinutes())}
        <span className="blink">:</span>{pad2(now.getSeconds())}
      </div>
      {!compact && (
        <div className="num mt-1 text-[10px] tracking-[0.2em] text-[var(--c-dim)]">
          {now.getFullYear()}-{pad2(now.getMonth() + 1)}-{pad2(now.getDate())} · 星期{weekName(now)}
        </div>
      )}
    </div>
  );
}
