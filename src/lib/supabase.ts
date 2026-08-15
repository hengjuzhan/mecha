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
