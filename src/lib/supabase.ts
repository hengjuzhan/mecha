import { fetcht } from "./utils";
import type { SupabaseCfg } from "../data/types";

/** 轻量 Supabase REST/RPC 客户端（无依赖，带超时） */
export function isSupabaseConfigured(cfg: SupabaseCfg | null): cfg is SupabaseCfg {
  return !!cfg && !!cfg.url && cfg.url.startsWith("http") && !!cfg.key;
}

function headers(cfg: SupabaseCfg, extra: Record<string, string> = {}) {
  return {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** 访问计数（localStorage 按天去重后调用，匿名可执行） */
export async function bumpVisits(cfg: SupabaseCfg): Promise<{ today: number; total: number } | null> {
  try {
    const rows = await fetcht<{ today: number; total: number }[]>(
      `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/bump_visits`, 6000,
      { method: "POST", headers: headers(cfg, { Prefer: "return=representation" }), body: "{}" },
    );
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

/** 读取云端站点文案覆盖层（所有设备共享，匿名可读） */
export async function textsGet(cfg: SupabaseCfg): Promise<Record<string, string> | null> {
  try {
    const rows = await fetcht<{ texts: Record<string, string> }[]>(
      `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/texts_get`, 6000,
      { method: "POST", headers: headers(cfg), body: "{}" },
    );
    const t = rows?.[0]?.texts;
    return t && typeof t === "object" ? t : null;
  } catch {
    return null;
  }
}

/** 清空云端全部访问记录（管理员口令令牌校验，管理员在系统面板调用） */
export async function visitsReset(cfg: SupabaseCfg, token: string): Promise<boolean> {
  try {
    await fetcht(
      `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/visits_reset`, 6000,
      { method: "POST", headers: headers(cfg), body: JSON.stringify({ p_token: token }) },
    );
    return true;
  } catch {
    return false;
  }
}

/** 写入云端站点文案覆盖层（管理员口令令牌校验，管理员编辑后调用） */
export async function textsSet(cfg: SupabaseCfg, texts: Record<string, string>, token: string): Promise<boolean> {
  try {
    await fetcht(
      `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/texts_set`, 6000,
      { method: "POST", headers: headers(cfg), body: JSON.stringify({ p_texts: texts, p_token: token }) },
    );
    return true;
  } catch {
    return false;
  }
}

/** 读取云端全站数据（分类/站点/公告/推广位/音乐源，所有设备共享，匿名可读） */
export async function siteDataGet(cfg: SupabaseCfg): Promise<Record<string, unknown> | null> {
  try {
    const rows = await fetcht<{ data: Record<string, unknown> }[]>(
      `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/site_data_get`, 8000,
      { method: "POST", headers: headers(cfg), body: "{}" },
    );
    const d = rows?.[0]?.data;
    return d && typeof d === "object" ? d : null;
  } catch {
    return null;
  }
}

/** 写入云端全站数据（管理员口令令牌校验，管理员编辑后调用） */
export async function siteDataSet(cfg: SupabaseCfg, data: Record<string, unknown>, token: string): Promise<boolean> {
  try {
    await fetcht(
      `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/site_data_set`, 8000,
      { method: "POST", headers: headers(cfg), body: JSON.stringify({ p_data: data, p_token: token }) },
    );
    return true;
  } catch {
    return false;
  }
}

/** 初始化/同步管理员令牌到数据库（首次设置无需旧令牌，后续需旧令牌） */
export async function adminTokenInit(cfg: SupabaseCfg, token: string, oldToken?: string): Promise<boolean> {
  try {
    await fetcht(
      `${cfg.url.replace(/\/$/, "")}/rest/v1/rpc/admin_token_init`, 6000,
      { method: "POST", headers: headers(cfg), body: JSON.stringify({ p_token: token, p_old_token: oldToken ?? null }) },
    );
    return true;
  } catch {
    return false;
  }
}
