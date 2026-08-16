/**
 * MECHA-NAV · 云端同步统一模块（v2）
 *
 * 全部 Supabase 交互的唯一入口：
 *  - rpc() 正确处理 204 无内容响应（void 写函数不解析 JSON，修复旧版误报"同步失败"）
 *  - 配置由 main.tsx 注入（initCloud），避免与 dataService 循环依赖
 *  - 计数 / 背景 / 留言带本地兜底：云端不可用时仍可正常使用，恢复后自动回云端
 *  - 云端为唯一权威源：所有设备进入页面拉取，管理员写入实时推送
 */
import { todayStr, uid } from "./utils";
import type { SupabaseCfg } from "../data/types";

/* ---------------- 配置注入 ---------------- */
let getCfg: () => SupabaseCfg | null = () => null;

export function initCloud(cfgProvider: () => SupabaseCfg | null) {
  getCfg = cfgProvider;
}

export function cloudConfigured(): boolean {
  const c = getCfg();
  return !!c && !!c.url && c.url.startsWith("http") && !!c.key;
}

function currentCfg(): SupabaseCfg | null {
  const c = getCfg();
  return c && c.url && c.url.startsWith("http") && c.key ? c : null;
}

/* ---------------- 底层 RPC ---------------- */
/**
 * 调用 Supabase RPC。成功返回解析后的 JSON（void 函数返回 null），失败返回 undefined。
 * 返回 null = 云端执行成功且无返回体；undefined = 网络失败/未配置/HTTP 错误。
 */
async function rpc<T>(name: string, body: Record<string, unknown> = {}, timeout = 8000): Promise<T | null | undefined> {
  const cfg = currentCfg();
  if (!cfg) return undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return undefined;
    const text = await res.text();
    if (!text) return null; // 204 No Content：执行成功
    try { return JSON.parse(text) as T; } catch { return null; }
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** 写操作便捷封装：仅区分"成功"与"失败/未配置" */
async function rpcOk(name: string, body: Record<string, unknown>, timeout = 8000): Promise<boolean> {
  const r = await rpc(name, body, timeout);
  return r !== undefined;
}

/* ---------------- 访问计数（云端权威 + 本地兜底） ---------------- */
const LS_VISITS = "mechanav.visits.v2";
interface VisitsLocal { day: string; today: number; total: number }

function readVisitsLocal(): VisitsLocal {
  try {
    const v = JSON.parse(localStorage.getItem(LS_VISITS) || "{}") as Partial<VisitsLocal>;
    return { day: v.day || "", today: v.today || 0, total: v.total || 0 };
  } catch { return { day: "", today: 0, total: 0 }; }
}
function writeVisitsLocal(v: VisitsLocal) {
  try { localStorage.setItem(LS_VISITS, JSON.stringify(v)); } catch { /* ignore */ }
}

export interface Visits { today: number; total: number }
export interface VisitsResult extends Visits { online: boolean }

/** 页面进入 / 氛围增量计数。云端成功返回云端值；失败走本地兜底计数。 */
async function visitsBump(n = 1): Promise<VisitsResult> {
  const inc = Math.max(1, Math.floor(n));
  const r = await rpc<Visits[]>("visits_bump", { p_n: inc }, 6000);
  if (r && Array.isArray(r) && r[0] && typeof r[0].today === "number") {
    return { today: r[0].today, total: r[0].total, online: true };
  }
  const v = readVisitsLocal();
  const day = todayStr();
  const next = { day, today: v.day === day ? v.today + inc : inc, total: v.total + inc };
  writeVisitsLocal(next);
  return { today: next.today, total: next.total, online: false };
}

/** 只读查询（不计数），云端不可用返回本地缓存 */
async function visitsGet(): Promise<VisitsResult> {
  const r = await rpc<Visits[]>("visits_get", {}, 6000);
  if (r && Array.isArray(r) && r[0] && typeof r[0].today === "number") {
    return { today: r[0].today, total: r[0].total, online: true };
  }
  const v = readVisitsLocal();
  const day = todayStr();
  return { today: v.day === day ? v.today : 0, total: v.total, online: false };
}

/** 本地计数缓存（页面首帧展示，随后被云端值覆盖） */
function visitsCached(): Visits {
  const v = readVisitsLocal();
  return { today: v.day === todayStr() ? v.today : 0, total: v.total };
}

/** 管理员清空：云端记录 + 本地缓存归零，并广播全局事件让顶栏即时归零 */
async function visitsReset(token: string): Promise<boolean> {
  const ok = await rpcOk("visits_reset", { p_token: token }, 6000);
  writeVisitsLocal({ day: todayStr(), today: 0, total: 0 });
  window.dispatchEvent(new CustomEvent("mecha:visits-reset"));
  return ok;
}

/* ---------------- 全站数据 / 文案 ---------------- */
async function siteDataGet(): Promise<Record<string, unknown> | null> {
  const r = await rpc<{ data: Record<string, unknown> }[]>("site_data_get", {}, 8000);
  const d = r?.[0]?.data;
  return d && typeof d === "object" ? d : null;
}
async function siteDataSet(data: Record<string, unknown>, token: string): Promise<boolean> {
  return rpcOk("site_data_set", { p_data: data, p_token: token }, 12000);
}
async function textsGet(): Promise<Record<string, string> | null> {
  const r = await rpc<{ texts: Record<string, string> }[]>("texts_get", {}, 6000);
  const t = r?.[0]?.texts;
  return t && typeof t === "object" ? t : null;
}
async function textsSet(texts: Record<string, string>, token: string): Promise<boolean> {
  return rpcOk("texts_set", { p_texts: texts, p_token: token }, 8000);
}

/* ---------------- 共享背景 + 配额 ---------------- */
export interface BgData { bgImage: string; bgTone: "dark" | "light" }

async function bgGet(): Promise<BgData | null> {
  const r = await rpc<{ bg_image: string; bg_tone: string }[]>("bg_get", {}, 10000);
  const row = Array.isArray(r) ? r[0] : undefined;
  if (!row) return null;
  return { bgImage: row.bg_image || "", bgTone: row.bg_tone === "light" ? "light" : "dark" };
}

/**
 * 把 dataURL 图片上传到 Storage 公开桶，返回公开 URL。
 * 大 base64 直塞 JSON RPC 在移动网络下易超时导致"本机可见、其他设备不同步"，
 * Storage 二进制上传（比 base64 小 33%）+ 数据库只存小 URL 是可靠路径。
 */
async function bgUpload(dataUrl: string): Promise<string | null> {
  const cfg = currentCfg();
  if (!cfg) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
  const name = `bg-${Date.now()}.${ext}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const bin = atob(m[2]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const base = cfg.url.replace(/\/$/, "");
    // 文件名带时间戳天然唯一，用普通 POST 创建；勿加 x-upsert（upsert 路径需 SELECT 权限，匿名会被 RLS 拒绝）
    const res = await fetch(`${base}/storage/v1/object/bg/${name}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": m[1],
      },
      body: buf,
    });
    if (!res.ok) return null;
    return `${base}/storage/v1/object/public/bg/${name}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 写入新背景，返回被覆盖的旧背景 URL（前端据此删除 Storage 旧文件；undefined=失败/未配置） */
async function bgSet(image: string, tone: string): Promise<string | null | undefined> {
  return rpc<string>("bg_set", { p_image: image, p_tone: tone }, 10000);
}
/** 清空共享背景（访客与管理员均可），返回被清除的旧背景 URL 供清理 Storage */
async function bgClear(token: string): Promise<string | null | undefined> {
  return rpc<string>("bg_clear", { p_token: token }, 8000);
}

/** 删除 Storage bg 桶中被替换/清除的旧背景文件（仅接受本项目 Storage 的 bg- URL；失败静默，孤儿文件无害） */
async function bgRemove(url: string): Promise<boolean> {
  const cfg = currentCfg();
  if (!cfg || !url) return false;
  const base = cfg.url.replace(/\/$/, "");
  const prefix = `${base}/storage/v1/object/public/bg/`;
  if (!url.startsWith(prefix)) return false; // 外部 URL / base64 回退值无需清理
  const name = url.slice(prefix.length);
  if (!/^bg-[\w.-]+$/.test(name)) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${base}/storage/v1/object/bg/${name}`, {
      method: "DELETE",
      signal: ctrl.signal,
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const LS_BGQ = "mechanav.bgquota.v2";
const BG_DAILY_MAX = 10;
function readBgQuotaLocal(): { date: string; used: number } {
  try {
    const q = JSON.parse(localStorage.getItem(LS_BGQ) || "{}") as { date?: string; used?: number };
    return { date: q.date || "", used: q.used || 0 };
  } catch { return { date: "", used: 0 }; }
}

/** 消耗一次上传配额（管理员不限；云端共享配额，失败降级本地） */
async function bgQuotaConsume(isAdmin: boolean): Promise<{ ok: boolean; remaining: number }> {
  if (isAdmin) return { ok: true, remaining: Infinity };
  const r = await rpc<{ ok?: boolean; remaining?: number }[]>("bg_quota_consume", {}, 6000);
  const row = Array.isArray(r) ? r[0] : undefined;
  if (row && row.ok === true) return { ok: true, remaining: row.remaining ?? 0 };
  if (row && row.ok === false) return { ok: false, remaining: 0 };
  const today = todayStr();
  const q = readBgQuotaLocal();
  const used = q.date === today ? q.used : 0;
  if (used >= BG_DAILY_MAX) return { ok: false, remaining: 0 };
  try { localStorage.setItem(LS_BGQ, JSON.stringify({ date: today, used: used + 1 })); } catch { /* ignore */ }
  return { ok: true, remaining: BG_DAILY_MAX - used - 1 };
}

/** 查询今日剩余配额（不消耗；管理员 Infinity；云端失败回退本地） */
async function bgQuotaRemaining(isAdmin: boolean): Promise<number> {
  if (isAdmin) return Infinity;
  const r = await rpc<{ remaining?: number }[]>("bg_quota_remaining", {}, 6000);
  const row = Array.isArray(r) ? r[0] : undefined;
  if (row && typeof row.remaining === "number") return row.remaining;
  const q = readBgQuotaLocal();
  return q.date === todayStr() ? Math.max(0, BG_DAILY_MAX - q.used) : BG_DAILY_MAX;
}

/* ---------------- 留言对话 ---------------- */
export interface GuestRow { id: string; parentId: string | null; name: string; content: string; ts: number }

async function guestList(): Promise<GuestRow[] | null> {
  const r = await rpc<{ id: string; parent_id: string | null; name: string; content: string; ts: number }[]>("guest_list", {}, 8000);
  if (!Array.isArray(r)) return null;
  return r.map((m) => ({ id: m.id, parentId: m.parent_id || null, name: m.name, content: m.content, ts: Number(m.ts) }));
}
async function guestAdd(parentId: string | null, name: string, content: string): Promise<boolean> {
  return rpcOk("guest_add", { p_id: parentId, p_name: name, p_content: content }, 8000);
}
async function guestDelete(id: string, token: string): Promise<boolean> {
  return rpcOk("guest_delete", { p_id: id, p_token: token }, 8000);
}
async function guestClear(token: string): Promise<boolean> {
  return rpcOk("guest_clear", { p_token: token }, 8000);
}

/* ---------------- 管理员令牌 ---------------- */
/** 推送 / 更新管理员令牌（首次无需旧令牌；修改需旧令牌） */
async function adminTokenInit(token: string, oldToken?: string): Promise<boolean> {
  return rpcOk("admin_token_init", { p_token: token, p_old_token: oldToken ?? null }, 6000);
}

/* ---------------- 对外统一 API ---------------- */
export const cloud = {
  configured: cloudConfigured,
  initToken: adminTokenInit,
  visits: { bump: visitsBump, get: visitsGet, cached: visitsCached, reset: visitsReset },
  siteData: { get: siteDataGet, set: siteDataSet },
  texts: { get: textsGet, set: textsSet },
  bg: { get: bgGet, upload: bgUpload, set: bgSet, clear: bgClear, remove: bgRemove, quotaConsume: bgQuotaConsume, quotaRemaining: bgQuotaRemaining },
  guest: { list: guestList, add: guestAdd, del: guestDelete, clear: guestClear },
};

export { uid };
