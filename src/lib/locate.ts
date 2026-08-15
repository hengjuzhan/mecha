import { getState } from "./dataService";
import { jumpToId } from "./utils";
import { forceMountCard } from "../components/cards/LazyCard";
import { forceMountCategory } from "../components/cards/LazyCategory";
import type { SearchHit } from "./dataService";

/* 全站定位共享逻辑：顶部搜索栏与桌宠搜索共用。
   链接卡片与分类是懒加载的，离屏时目标 id 并不在 DOM 中。
   prepareLocate 先强制挂载目标及其所在分类，再返回目标元素 id；
   waitForId 轮询等待目标进入 DOM 后回调（用于滚动 + 高亮，或桌宠移动）。 */

export function prepareLocate(h: SearchHit): string {
  const ref = h.ref as { no: string | number; cat?: string };
  if (h.kind === "link") {
    forceMountCard(ref.no as string);
    const catNo = getState().categories.find((c) => c.id === ref.cat)?.no;
    if (catNo != null) forceMountCategory(catNo);
    return `card-${ref.no}`;
  }
  if (h.kind === "cat") {
    forceMountCategory(ref.no as number);
    return `cat-${ref.no}`;
  }
  return `ann-${ref.no}`;
}

export function waitForId(id: string, cb: () => void, timeout = 2500) {
  if (document.getElementById(id)) { cb(); return; }
  const t0 = Date.now();
  const iv = window.setInterval(() => {
    if (document.getElementById(id) || Date.now() - t0 > timeout) {
      window.clearInterval(iv);
      cb();
    }
  }, 120);
}

/** 通用定位：强制挂载 → 等待渲染 → 滚动 + 高亮。找不到时回调 onFail。 */
export function locateHit(h: SearchHit, onFail?: () => void) {
  const id = prepareLocate(h);
  waitForId(id, () => { if (!jumpToId(id)) onFail?.(); });
}