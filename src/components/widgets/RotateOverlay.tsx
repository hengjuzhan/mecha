import { useEffect, useState } from "react";
import { t } from "../../lib/dataService";

/** 手机/平板竖屏进入时顶部滑入一条非阻断提示（几秒后自动收起，也可点击关闭）；
 *  不再整屏遮挡——竖屏本身也能正常浏览全部内容，只是提示横屏体验更佳 */
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
    // 首次提示 6 秒后自动收起，之后仅在旋转回来时再短暂提示
    const t2 = window.setTimeout(() => setDismissed(true), 6000);
    return () => {
      window.clearTimeout(t2);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!show || dismissed) return null;

  return (
    <div className="rotate-hint" role="status">
      <span className="rotate-hint-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2" y="4" width="20" height="16" rx="2" transform="rotate(90 12 12)" />
          <rect x="7" y="9" width="10" height="6" rx="1" />
        </svg>
      </span>
      <span className="rotate-hint-text">
        <b>{t("rotate.title")}</b>
        <span className="rotate-hint-sub">{t("rotate.sub")}</span>
      </span>
      <button type="button" className="rotate-hint-close" onClick={() => setDismissed(true)} aria-label="关闭提示">✕</button>
    </div>
  );
}
