import { useEffect, useState } from "react";
import { t } from "../../lib/dataService";

/** 手机/平板竖屏进入时提示旋转横屏；桌面端与横屏状态不显示 */
export function RotateOverlay() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 仅触屏手机/平板（主指针为粗触控）才提示；桌面鼠标/触控笔记本不提示
    const isTouchTablet =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)").matches ||
        (window.ontouchstart !== undefined && navigator.maxTouchPoints > 0));
    if (!isTouchTablet) return;

    const update = () => {
      const portrait =
        window.matchMedia?.("(orientation: portrait)").matches ??
        window.innerHeight > window.innerWidth;
      setShow(portrait);
    };
    update();
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!show || dismissed) return null;

  return (
    <div className="rotate-overlay" role="alert">
      <div className="rotate-box">
        <span className="rotate-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="2" y="4" width="20" height="16" rx="2" transform="rotate(90 12 12)" />
            <rect x="7" y="9" width="10" height="6" rx="1" />
          </svg>
        </span>
        <p className="rotate-title">{t("rotate.title")}</p>
        <p className="rotate-sub">{t("rotate.sub")}</p>
        <button type="button" className="btn-mech rotate-btn" onClick={() => setDismissed(true)}>
          {t("rotate.dismiss")}
        </button>
      </div>
    </div>
  );
}