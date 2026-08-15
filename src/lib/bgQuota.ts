import { fetcht, todayStr } from "./utils";
import { getSettings } from "./dataService";
import { isSupabaseConfigured } from "./supabase";
import { isAdminSession, getAdminHash } from "../components/admin/AdminLogin";

const LS_KEY = "mechanav.bgquota.v1";
const DAILY_MAX = 10; // 每日所有访客共享上传次数

interface QuotaLocal { date: string; used: number }
function readLocal(): QuotaLocal {
  try {
    const r = JSON.parse(localStorage.getItem(LS_KEY) || "{}") as Partial<QuotaLocal>;
    return { date: r.date || "", used: r.used || 0 };
  } catch { return { date: "", used: 0 }; }
}
function writeLocal(q: QuotaLocal) { try { localStorage.setItem(LS_KEY, JSON.stringify(q)); } catch { /* ignore */ } }

/** 今日剩余上传次数；Infinity 表示管理员不限 */
export function bgQuotaRemaining(): number {
  if (isAdminSession()) return Infinity;
  const q = readLocal();
  return q.date === todayStr() ? Math.max(0, DAILY_MAX - q.used) : DAILY_MAX;
}

/**
 * 尝试消耗一次上传配额。管理员无限；访客每日共享 DAILY_MAX 次。
 * 若配置了 Supabase 且后端提供 bg_quota_consume RPC，则走共享配额；否则降级为本地每日计数。
 */
export async function consumeBgQuota(): Promise<{ ok: boolean; remaining: number }> {
  if (isAdminSession()) return { ok: true, remaining: Infinity };

  const cfg = getSettings().supabase;
  if (isSupabaseConfigured(cfg)) {
    try {
      const d = await fetcht<{ ok?: boolean; remaining?: number }>(
        `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/bg_quota_consume`,
        6000,
        { method: "POST", headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" }, body: "{}" },
      );
      if (d && d.ok) return { ok: true, remaining: d.remaining ?? 0 };
      if (d && d.ok === false) return { ok: false, remaining: 0 };
    } catch { /* 后端无该 RPC 时降级本地 */ }
  }

  const today = todayStr();
  const q = readLocal();
  const used = q.date === today ? q.used : 0;
  if (used >= DAILY_MAX) return { ok: false, remaining: 0 };
  writeLocal({ date: today, used: used + 1 });
  return { ok: true, remaining: DAILY_MAX - used - 1 };
}

/**
 * 读取所有设备共享的背景（bg_get RPC）。返回 null 表示后端不可用或未配置。
 */
export async function bgGetAsync(): Promise<{ bgImage: string; bgTone: "dark" | "light" } | null> {
  const cfg = getSettings().supabase;
  if (isSupabaseConfigured(cfg)) {
    try {
      const d = await fetcht<{ bg_image: string; bg_tone: string }[]>(
        `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/bg_get`, 6000,
        { method: "POST", headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" }, body: "{}" },
      );
      const r = Array.isArray(d) && d[0] ? d[0] : undefined;
      if (r) return { bgImage: r.bg_image || "", bgTone: r.bg_tone === "light" ? "light" : "dark" };
    } catch { /* 后端不可用 */ }
  }
  return null;
}

/**
 * 将背景写入数据库以实现所有设备同步（bg_set RPC）。
 * 配额消耗由调用方通过 consumeBgQuota 控制。返回是否成功写入。
 */
export async function bgSetAsync(image: string, tone: string): Promise<boolean> {
  const cfg = getSettings().supabase;
  if (isSupabaseConfigured(cfg)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      try {
        const res = await fetch(
          `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/bg_set`, { signal: ctrl.signal,
            method: "POST", headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_image: image, p_tone: tone }) },
        );
        return res.ok;
      } finally { clearTimeout(timer); }
    } catch { /* 后端不可用则仅本地生效 */ }
  }
  return false;
}

/**
 * 管理员清除所有设备共享的背景（bg_clear RPC，凭管理员令牌校验）。
 * 返回是否成功清除云端；未配置数据库时返回 false（本地清空由调用方 setSettings 完成）。
 */
export async function bgClearAsync(): Promise<boolean> {
  const cfg = getSettings().supabase;
  if (isSupabaseConfigured(cfg)) {
    try {
      const token = getAdminHash();
      if (!token) return false;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      try {
        const res = await fetch(
          `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/bg_clear`, { signal: ctrl.signal,
            method: "POST", headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_token: token }) },
        );
        return res.ok;
      } finally { clearTimeout(timer); }
    } catch { /* 后端不可用则仅本地生效 */ }
  }
  return false;
}

/**
 * 异步查询今日剩余上传次数（优先数据库共享配额，未配置时回退本地）。
 * 返回 null 表示无法确定（如后端不可用）。
 */
export async function bgQuotaRemainingAsync(): Promise<number | null> {
  if (isAdminSession()) return Infinity;
  const cfg = getSettings().supabase;
  if (isSupabaseConfigured(cfg)) {
    try {
      const d = await fetcht<{ remaining?: number }[]>(
        `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/bg_quota_remaining`,
        6000,
        { method: "POST", headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" }, body: "{}" },
      );
      const r = Array.isArray(d) && d[0] ? d[0].remaining : undefined;
      if (typeof r === "number") return r;
    } catch { /* 回退本地 */ }
  }
  return bgQuotaRemaining();
}