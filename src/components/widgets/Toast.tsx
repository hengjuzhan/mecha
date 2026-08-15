import { useEffect, useState } from "react";

export interface ToastItem { id: number; msg: string; type: "info" | "ok" | "warn" }
let seq = 0;

export function toast(msg: string, type: ToastItem["type"] = "info") {
  window.dispatchEvent(new CustomEvent("mecha:toast", { detail: { msg, type } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { msg: string; type: ToastItem["type"] };
      const item: ToastItem = { id: ++seq, msg: d.msg, type: d.type };
      setItems((p) => [...p.slice(-4), item]);
      window.setTimeout(() => setItems((p) => p.filter((x) => x.id !== item.id)), 3200);
    };
    window.addEventListener("mecha:toast", on);
    return () => window.removeEventListener("mecha:toast", on);
  }, []);
  const color = { info: "var(--c-cyan)", ok: "#22e06b", warn: "var(--c-orange)" };
  const glyph = { info: "▣", ok: "✓", warn: "▲" };
  return (
    <div className="fixed left-1/2 top-4 z-[9900] flex w-[min(92vw,440px)] -translate-x-1/2 flex-col gap-2 pointer-events-none">
      {items.map((i) => (
        <div key={i.id} className="panel panel-glow flex items-center gap-2.5 px-3.5 py-2.5 text-sm">
          <span className="num text-xs" style={{ color: color[i.type] }}>{glyph[i.type]}</span>
          <span className="min-w-0 flex-1 break-words leading-snug">{i.msg}</span>
        </div>
      ))}
    </div>
  );
}
