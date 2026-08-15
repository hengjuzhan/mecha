import { useSyncExternalStore } from "react";
import { DEFAULT_CATEGORIES, DEFAULT_LINKS, DEFAULT_ANNOUNCEMENTS, DEFAULT_PROMOS, DEFAULT_MUSIC_SOURCES } from "../data/navData";
import { DEFAULT_TEXTS } from "../data/texts";
import type { Announcement, Category, LinkItem, MusicSource, Overlay, Promo, Settings } from "../data/types";
import { fuzzyScore, uid } from "./utils";
import { cloud } from "./cloud";
import { getAdminHash, isAdminSession } from "../components/admin/AdminLogin";
import { toast } from "../components/widgets/Toast";

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

// 合并设置时，localStorage 中为 null 的 supabase 视为未配置，回退到内置默认连接
function normalizeSettings(s: Settings): Settings {
  const c = s.supabase;
  const ok = !!c && !!c.url && c.url.startsWith("http") && !!c.key;
  if (!ok) {
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
export function setCategories(cats: Category[]) { state = { ...state, categories: cats }; scheduleOverlayWrite(); emit(); pushSiteDataToCloud(); }
export function setLinks(links: LinkItem[]) { state = { ...state, links }; scheduleOverlayWrite(); emit(); pushSiteDataToCloud(); }
export function setAnnouncements(list: Announcement[]) { state = { ...state, announcements: list }; scheduleOverlayWrite(); emit(); pushSiteDataToCloud(); }
export function setPromos(list: Promo[]) { state = { ...state, promos: list }; scheduleOverlayWrite(); emit(); pushSiteDataToCloud(); }
export function setMusicSources(list: MusicSource[]) { state = { ...state, musicSources: list }; scheduleOverlayWrite(); emit(); pushSiteDataToCloud(); }
export function setTexts(patch: Record<string, string>) {
  state = { ...state, texts: { ...state.texts, ...patch } };
  scheduleOverlayWrite(); textsEmit(); emit();
  pushTextsToCloud();
}

/* ---- 文案云端同步：管理员编辑后推送到数据库，各设备进入时拉取，实现跨设备文案一致 ---- */
let textsSyncTimer: number | null = null;
function pushTextsToCloud() {
  if (textsSyncTimer !== null) return;
  textsSyncTimer = window.setTimeout(() => {
    textsSyncTimer = null;
    void doPushTexts();
  }, 500);
}
async function doPushTexts() {
  if (!isAdminSession()) return;
  const token = getAdminHash();
  if (!token) return;
  const ok = await cloud.texts.set(state.texts, token);
  if (!ok) toast("文案云端同步失败，请检查管理员登录与数据库配置", "warn");
}

/** 进入站点时从云端拉取文案覆盖层（云端为跨设备权威源，覆盖本地旧值）；云端为空且已登录管理员时自动把本地文案推送上云 */
export async function syncTextsFromCloud(): Promise<void> {
  if (!cloud.configured()) return;
  const db = await cloud.texts.get();
  if (db && Object.keys(db).length > 0) {
    state = { ...state, texts: { ...db } };
    textsEmit(); emit();
  } else if (isAdminSession() && getAdminHash() && Object.keys(state.texts).length > 0) {
    pushTextsToCloud();
  }
}

/* ---- 全站数据云端同步：管理员编辑分类/站点/公告/推广位/音乐源后推送到数据库，各设备进入时拉取 ---- */
let siteDataSyncTimer: number | null = null;
function pushSiteDataToCloud(notify = false) {
  if (siteDataSyncTimer !== null) return;
  siteDataSyncTimer = window.setTimeout(() => {
    siteDataSyncTimer = null;
    void doPushSiteData(notify);
  }, 800);
}
async function doPushSiteData(notify = false) {
  if (!isAdminSession()) return;
  const token = getAdminHash();
  if (!token) return;
  const ok = await cloud.siteData.set({
    categories: state.categories,
    links: state.links,
    announcements: state.announcements,
    promos: state.promos,
    musicSources: state.musicSources,
  }, token);
  if (notify && ok) toast("全站数据已同步到云端", "ok");
  else if (!ok) toast("全站数据云端同步失败，请检查管理员登录与数据库配置", "warn");
}

/** 进入站点时从云端拉取全站数据（云端为跨设备权威源，覆盖本地旧值）；云端为空且已登录管理员时自动把本地全量推送上云 */
export async function syncSiteDataFromCloud(): Promise<void> {
  if (!cloud.configured()) return;
  const db = await cloud.siteData.get();
  const cats = db && Array.isArray(db.categories) ? (db.categories as Category[]) : null;
  const lks = db && Array.isArray(db.links) ? (db.links as LinkItem[]) : null;
  const anns = db && Array.isArray(db.announcements) ? (db.announcements as Announcement[]) : null;
  const prs = db && Array.isArray(db.promos) ? (db.promos as Promo[]) : null;
  const mss = db && Array.isArray(db.musicSources) ? (db.musicSources as MusicSource[]) : null;
  if (cats || lks || anns || prs || mss) {
    state = {
      ...state,
      categories: cats ?? state.categories,
      links: lks ?? state.links,
      announcements: anns ?? state.announcements,
      promos: prs ?? state.promos,
      musicSources: mss ?? state.musicSources,
    };
    // 同步写入 localStorage 持久化
    flushOverlayWrite();
    emit();
  } else if (isAdminSession() && getAdminHash()) {
    // 云端尚无数据：管理员设备自动初始化，把本地全量数据推送上云，其他设备即可拉取
    pushSiteDataToCloud(true);
  }
}

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
  textsEmit(); emit();
  pushTextsToCloud();
  pushSiteDataToCloud();
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
  if (!d || (!d.categories && !d.links && !d.announcements && !d.promos && !d.musicSources && !d.texts)) return false;
  let changed = false;
  if (d.categories) { state.categories = d.categories; changed = true; }
  if (d.links) { state.links = d.links; changed = true; }
  if (d.announcements) { state.announcements = d.announcements; changed = true; }
  if (d.promos) { state.promos = d.promos; changed = true; }
  if (d.musicSources) { state.musicSources = d.musicSources; changed = true; }
  if (d.texts) { state.texts = { ...state.texts, ...d.texts }; changed = true; }
  flushOverlayWrite();
  textsEmit(); emit();
  if (changed) {
    pushSiteDataToCloud();
    if (d.texts) pushTextsToCloud();
  }
  return true;
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

// 管理员登录成功后立即重新同步：拉取云端最新数据；云端为空时自动把本机数据推送上云
window.addEventListener("mecha:adminsession", (ev) => {
  if ((ev as CustomEvent<{ on?: boolean }>).detail?.on) {
    void syncTextsFromCloud();
    void syncSiteDataFromCloud();
  }
});
