import { useSyncExternalStore } from "react";
import { DEFAULT_CATEGORIES, DEFAULT_LINKS, DEFAULT_ANNOUNCEMENTS, DEFAULT_PROMOS, DEFAULT_MUSIC_SOURCES } from "../data/navData";
import { DEFAULT_TEXTS } from "../data/texts";
import type { Announcement, Category, LinkItem, MusicSource, Overlay, Promo, Settings } from "../data/types";
import { fuzzyScore, todayStr, uid } from "./utils";
import { isSupabaseConfigured } from "./supabase";

const LS_OVERLAY = "mechanav.data.v1";
const LS_SET = "mechanav.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  accent: "cyan",
  font: "system",
  soundVol: 0.7,
  neonBright: 1,
  neonSpeed: 1.6,
  jumpAmp: 2,
  jumpSpeed: 0.22,
  glow: 0.9,
  musicVol: 0.8,
  musicGlow: 0.8,
  musicHeight: 0,
  musicWidth: 0,
  boardLeft: { w: 0, h: 280 },
  boardMid: { w: 0, h: 280 },
  boardRight: { w: 0, h: 280 },
  colorShift: true,
  animNeon: true,
  animJump: false,
  animShine: true,
  blendMode: "normal",
  homeTransparent: false,
  bgImage: "",
  bgTone: "dark",
  supabase: {
    url: "https://njwoxdamaqtbnvpuvblg.supabase.co",
    key: "sb_publishable_K4Yw_dhapfPUPRzu2H4TvQ_kN9IfnSl",
  },
  visitsDay: "",
  visitsTotal: 0,
  visitsToday: 0,
};

export interface SiteState {
  categories: Category[];
  links: LinkItem[];
  announcements: Announcement[];
  promos: Promo[];
  musicSources: MusicSource[];
  texts: Record<string, string>;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch { return fallback; }
}

let overlay: Overlay = loadJSON<Overlay>(LS_OVERLAY, {});
let settings: Settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...loadJSON<Partial<Settings>>(LS_SET, {}) });
let backendOk = false;
export const isBackendOk = () => backendOk;
export const setBackendOk = (v: boolean) => { backendOk = v; };

// 合并设置时，localStorage 中为 null 的 supabase 视为未配置，回退到内置默认连接
function normalizeSettings(s: Settings): Settings {
  if (!isSupabaseConfigured(s.supabase)) {
    s = { ...s, supabase: DEFAULT_SETTINGS.supabase };
  }
  return s;
}

// 迁移：仅清理无效/偏移的旧音源，保留所有可用播放源（gdstudio 平台 + 访客自备源）
const savedMusic = overlay.musicSources;
let migratedMusic: MusicSource[] = savedMusic && savedMusic.length > 0
  ? savedMusic.filter((m) => m && m.baseUrl && m.baseUrl.startsWith("http") && m.enabled !== false)
  : DEFAULT_MUSIC_SOURCES;
if (migratedMusic.length === 0) migratedMusic = DEFAULT_MUSIC_SOURCES;

let state: SiteState = {
  categories: overlay.categories ?? DEFAULT_CATEGORIES,
  links: overlay.links ?? DEFAULT_LINKS,
  announcements: overlay.announcements ?? DEFAULT_ANNOUNCEMENTS,
  promos: overlay.promos ?? DEFAULT_PROMOS,
  musicSources: migratedMusic,
  texts: overlay.texts ?? {},
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getState = (): SiteState => state;
export function useStore(): SiteState { return useSyncExternalStore(subscribe, getState); }

/* 文案专属订阅：仅当 texts 引用变化时重渲染，避免无关组件（MoodPanel/PreviewModal 等）在
   分类/站点/公告变化时被连带重渲染，同时保证管理员修改文字后所有 t() 处实时同步 */
const textsListeners = new Set<() => void>();
const textsEmit = () => textsListeners.forEach((l) => l());
const textsSubscribe = (fn: () => void) => { textsListeners.add(fn); return () => { textsListeners.delete(fn); }; };
const getTextsSnapshot = (): Record<string, string> => state.texts;
export function useTexts(): Record<string, string> { return useSyncExternalStore(textsSubscribe, getTextsSnapshot); }

/* 设置与站点数据分离订阅：setSettings 只通知 settings 订阅者，避免触发全站 useStore 重渲染 */
const settingsListeners = new Set<() => void>();
const settingsEmit = () => settingsListeners.forEach((l) => l());
const settingsSubscribe = (fn: () => void) => { settingsListeners.add(fn); return () => { settingsListeners.delete(fn); }; };
const getSettingsSnapshot = (): Settings => settings;
export function useSettings(): Settings { return useSyncExternalStore(settingsSubscribe, getSettingsSnapshot); }

/* ---- 持久化防抖：编辑类高频操作（击键/拖滑杆）合并写入，避免每次同步序列化全量数据卡顿 ----
   复位/导入/倒计时等低频一次性操作仍立即写入 */
function writeOverlay() {
  try {
    localStorage.setItem(LS_OVERLAY, JSON.stringify({
      categories: state.categories, links: state.links, announcements: state.announcements,
      promos: state.promos, musicSources: state.musicSources, texts: state.texts,
    }));
  } catch { /* 存储满则忽略 */ }
}
function writeSettings() { try { localStorage.setItem(LS_SET, JSON.stringify(settings)); } catch { /* ignore */ } }

let overlayTimer: number | null = null;
let settingsTimer: number | null = null;
function scheduleOverlayWrite() {
  if (overlayTimer !== null) return;
  overlayTimer = window.setTimeout(() => { overlayTimer = null; writeOverlay(); }, 400);
}
function scheduleSettingsWrite() {
  if (settingsTimer !== null) return;
  settingsTimer = window.setTimeout(() => { settingsTimer = null; writeSettings(); }, 400);
}
function flushOverlayWrite() {
  if (overlayTimer !== null) { window.clearTimeout(overlayTimer); overlayTimer = null; }
  writeOverlay();
}
function flushSettingsWrite() {
  if (settingsTimer !== null) { window.clearTimeout(settingsTimer); settingsTimer = null; }
  writeSettings();
}
// 页面关闭/切走前冲刷未写入的防抖数据，避免刷新丢失最后输入
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => { flushOverlayWrite(); flushSettingsWrite(); }, { capture: true });
}

export const getSettings = (): Settings => settings;
export function setSettings(patch: Partial<Settings>) {
  settings = normalizeSettings({ ...settings, ...patch });
  scheduleSettingsWrite();
  settingsEmit(); // 仅通知 settings 订阅者，不再触发全站 useStore 重渲染
}
export function setCategories(cats: Category[]) { state = { ...state, categories: cats }; scheduleOverlayWrite(); emit(); }
export function setLinks(links: LinkItem[]) { state = { ...state, links }; scheduleOverlayWrite(); emit(); }
export function setAnnouncements(list: Announcement[]) { state = { ...state, announcements: list }; scheduleOverlayWrite(); emit(); }
export function setPromos(list: Promo[]) { state = { ...state, promos: list }; scheduleOverlayWrite(); emit(); }
export function setMusicSources(list: MusicSource[]) { state = { ...state, musicSources: list }; scheduleOverlayWrite(); emit(); }
export function setTexts(patch: Record<string, string>) { state = { ...state, texts: { ...state.texts, ...patch } }; scheduleOverlayWrite(); textsEmit(); emit(); }

/** 文案读取：管理员覆盖层 → 默认文案 */
export function t(key: string): string { return state.texts[key] || DEFAULT_TEXTS[key] || key; }

export function nextLinkNo(): string {
  const max = state.links.reduce((m, l) => Math.max(m, parseInt(l.no.replace(/\D/g, ""), 10) || 0), 0);
  return `L${String(max + 1).padStart(4, "0")}`;
}
export function nextAnnNo(): string {
  const max = state.announcements.reduce((m, a) => Math.max(m, parseInt(a.no.replace(/\D/g, ""), 10) || 0), 0);
  return `P${String(max + 1).padStart(4, "0")}`;
}
export function newLink(catId: string): LinkItem {
  return { id: uid("l"), no: nextLinkNo(), name: "新站点", url: "", desc: "", cat: catId, sub: "", icon: "🔗" };
}

export function stats() {
  const nodes = state.links.length;
  const linked = state.links.filter((l) => !l.placeholder && l.url).length;
  return { parts: state.categories.length, nodes, linked, pending: nodes - linked };
}

export function resetOverlay() {
  state = {
    categories: DEFAULT_CATEGORIES, links: DEFAULT_LINKS, announcements: DEFAULT_ANNOUNCEMENTS,
    promos: DEFAULT_PROMOS, musicSources: DEFAULT_MUSIC_SOURCES, texts: {},
  };
  flushOverlayWrite();
  emit();
}

export function exportJSON() {
  return {
    version: 1, exportedAt: new Date().toISOString(),
    categories: state.categories, links: state.links, announcements: state.announcements,
    promos: state.promos, musicSources: state.musicSources, texts: state.texts,
  };
}

export function importJSON(obj: unknown): boolean {
  const d = (obj ?? {}) as Partial<Overlay>;
  if (!d || (!d.categories && !d.links && !d.announcements && !d.promos && !d.musicSources)) return false;
  if (d.categories) state.categories = d.categories;
  if (d.links) state.links = d.links;
  if (d.announcements) state.announcements = d.announcements;
  if (d.promos) state.promos = d.promos;
  if (d.musicSources) state.musicSources = d.musicSources;
  if (d.texts) state.texts = d.texts;
  flushOverlayWrite();
  emit();
  return true;
}

/** 本地演示访问计数（localStorage 按天去重），接后端后由 bump_visits 覆盖 */
export function bumpVisitsLocal(): { today: number; total: number } {
  const today = todayStr();
  const prevDay = settings.visitsDay;
  const prevToday = settings.visitsToday;
  const prevTotal = settings.visitsTotal;
  // 单调递增：累计只增不减；今日跨天重置为小起点（从低到高），当天内同步累加
  const todayCnt = prevDay === today ? prevToday + 1 : 1;
  const total = (prevTotal > 0 ? prevTotal : 1299) + 1;
  settings = { ...settings, visitsDay: today, visitsToday: todayCnt, visitsTotal: total };
  flushSettingsWrite();
  emit();
  return { today: todayCnt, total };
}

/* ---------- 全站搜索：站点名 / 编号 L0001 / 分类 / 公告 P0001 ---------- */
export interface SearchHit {
  kind: "link" | "cat" | "ann";
  ref: LinkItem | Category | Announcement;
  score: number;
}

export function searchAll(q: string): SearchHit[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const hits: SearchHit[] = [];
  const exactNo = /^([lp])(\d{4})$/.exec(query);
  if (exactNo) {
    const [, kind] = exactNo;
    if (kind === "l") {
      const l = state.links.find((x) => x.no.toLowerCase() === query);
      if (l) return [{ kind: "link", ref: l, score: 10000 }];
    } else {
      const a = state.announcements.find((x) => x.no.toLowerCase() === query);
      if (a) return [{ kind: "ann", ref: a, score: 10000 }];
    }
  }
  for (const cat of state.categories) {
    const s = Math.max(fuzzyScore(cat.name, query), fuzzyScore(cat.nameEn, query), fuzzyScore(cat.icon + cat.nameEn + cat.name, query));
    if (s > 0) hits.push({ kind: "cat", ref: cat, score: s });
  }
  for (const l of state.links) {
    if (l.placeholder) continue;
    const cat = state.categories.find((c) => c.id === l.cat);
    const s = Math.max(
      fuzzyScore(l.name, query), fuzzyScore(l.no, query),
      fuzzyScore(l.desc, query), fuzzyScore(l.sub, query),
      cat ? fuzzyScore(cat.name, query) : -1,
    );
    if (s > 0) hits.push({ kind: "link", ref: l, score: s });
  }
  for (const a of state.announcements) {
    const s = Math.max(fuzzyScore(a.title, query), fuzzyScore(a.content, query), fuzzyScore(a.no, query));
    if (s > 0) hits.push({ kind: "ann", ref: a, score: s });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 12);
}
