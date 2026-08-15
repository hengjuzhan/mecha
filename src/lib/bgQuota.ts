import { fetcht, todayStr } from "./utils";
import { getSettings } from "./dataService";
import { isSupabaseConfigured } from "./supabase";
import { isAdminSession } from "../components/admin/AdminLogin";

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