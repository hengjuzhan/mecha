export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const uid = (p = "x") => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const weekName = (d: Date) => ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];

export const dateSeed = () => Number(todayStr().replace(/-/g, ""));

/** 确定性伪随机数（按日期种子） */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 子序列模糊匹配：返回分数，-1 表示不匹配 */
export function fuzzyScore(hay: string, needle: string): number {
  if (!needle) return 0;
  const h = hay.toLowerCase(), n = needle.toLowerCase();
  if (h === n) return 10000;
  const idx = h.indexOf(n);
  if (idx === 0) return 8000 - h.length;
  if (idx > 0) return 5000 - idx - h.length;
  let j = 0, gaps = 0;
  for (let i = 0; i < h.length && j < n.length; i++) {
    if (h[i] === n[j]) { j++; } else { gaps++; }
  }
  return j === n.length ? Math.max(1, 2000 - gaps * 30 - h.length) : -1;
}

export async function fetcht<T>(url: string, ms = 5000, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function downloadJSON(filename: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); return true; } catch { return false; }
    finally { ta.remove(); }
  }
}

/** 滚动到目标并闪烁高亮。
    高亮用脱离 React 的临时覆盖层实现（叠加在目标元素上），
    避免 React 重渲染用静态 className 覆盖掉手动添加的类。 */
export function jumpToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    const e2 = document.getElementById(id);
    if (!e2) return;
    const r = e2.getBoundingClientRect();
    const o = document.createElement("div");
    o.className = "flash-overlay";
    o.style.left = `${r.left}px`;
    o.style.top = `${r.top}px`;
    o.style.width = `${r.width}px`;
    o.style.height = `${r.height}px`;
    document.body.appendChild(o);
    window.setTimeout(() => o.remove(), 4400);
  }, 650);
  return true;
}

export function extSearchURL(scope: string, q: string): string | null {
  const s = encodeURIComponent(q);
  switch (scope) {
    case "baidu": return `https://www.baidu.com/s?wd=${s}`;
    case "google": return `https://www.google.com/search?q=${s}`;
    case "bing": return `https://www.bing.com/search?q=${s}`;
    case "github": return `https://github.com/search?q=${s}`;
    default: return null;
  }
}

export const EMOJI_DICT: [string, string][] = [
  ["影视", "🎬"], ["视频", "📺"], ["电影", "🎬"], ["直播", "📡"], ["动画", "🎌"], ["动漫", "🎌"], ["漫画", "📚"],
  ["音乐", "🎵"], ["歌曲", "🎧"], ["播客", "🎙️"], ["游戏", "🎮"], ["代码", "💻"], ["开发", "💻"], ["编程", "💻"],
  ["github", "🐙"], ["文档", "📘"], ["教程", "🐤"], ["社区", "💬"], ["问答", "🧑‍💻"], ["ai", "🤖"], ["绘画", "🎨"],
  ["图片", "🖼️"], ["设计", "🎨"], ["素材", "🧩"], ["灵感", "🌸"], ["办公", "📄"], ["文档", "📃"], ["网盘", "☁️"],
  ["云", "☁️"], ["传输", "📤"], ["压缩", "🗜️"], ["pdf", "📑"], ["资讯", "📰"], ["新闻", "📰"], ["阅读", "📖"],
  ["书", "📚"], ["电子书", "📚"], ["古籍", "📜"], ["购物", "🛒"], ["外卖", "🍜"], ["美食", "🍜"], ["出行", "🚄"],
  ["地图", "🗺️"], ["旅行", "✈️"], ["酒店", "🏨"], ["金融", "💰"], ["邮箱", "📧"], ["邮件", "📧"], ["搜索", "🔍"],
  ["工具", "🧰"], ["图片压缩", "🗜️"], ["翻译", "🌐"], ["百科", "📚"], ["维基", "📚"], ["小说", "📕"], ["轻小说", "📗"],
  ["画师", "🖌️"], ["插画", "🖌️"], ["同人", "🖌️"], ["电台", "📻"], ["字幕", "💬"], ["壁纸", "🖼️"], ["社交", "💬"],
];

export function suggestEmoji(name: string): string {
  const n = name.toLowerCase();
  for (const [k, e] of EMOJI_DICT) if (n.includes(k)) return e;
  return "🔗";
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isMobile = () => typeof window !== "undefined" && window.innerWidth < 768;

export function toastMsg(msg: string, type: "info" | "ok" | "warn" = "info") {
  window.dispatchEvent(new CustomEvent("mecha:toast", { detail: { msg, type } }));
}
