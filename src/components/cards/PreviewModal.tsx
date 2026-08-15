import { useEffect, useState } from "react";
import type { LinkItem } from "../../data/types";
import { Modal } from "../widgets/Modal";
import { t, useTexts } from "../../lib/dataService";

/** 站内 iframe 预览：对拒绝嵌入的站点显示兜底提示 */
export function PreviewModal({ link, onClose }: { link: LinkItem | null; onClose: () => void }) {
  useTexts(); // 文案变化时重渲染，保证 t() 实时同步
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!link) return;
    setHint(false);
    const timer = window.setTimeout(() => setHint(true), 4000);
    return () => window.clearTimeout(timer);
  }, [link]);

  return (
    <Modal open={!!link} onClose={onClose} title={<span>◉ PREVIEW · {link?.name ?? ""}</span>} width={960} z={500}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="num min-w-0 truncate text-[10px] tracking-widest text-[var(--c-dim)]">
          {link?.no} · {link?.url}
        </span>
        <a href={link?.url} target="_blank" rel="noreferrer" className="btn-mech h-7 shrink-0 px-2.5 text-xs">
          {t("preview.open")} ↗
        </a>
      </div>
      <div className="relative h-[62vh] w-full overflow-hidden border border-[var(--c-border)] bg-[#0b0f1a]">
        {link && (
          <iframe
            key={link.id}
            src={link.url}
            title={link.name}
            className="h-full w-full"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            loading="lazy"
          />
        )}
        {hint && (
          <div className="absolute inset-x-0 bottom-0 bg-black/85 px-3 py-2 text-xs leading-relaxed text-[var(--c-orange)]">
            ▲ {t("preview.refuse")}
          </div>
        )}
      </div>
    </Modal>
  );
}
