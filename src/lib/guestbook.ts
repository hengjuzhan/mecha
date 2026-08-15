import { useSyncExternalStore } from "react";
import { uid } from "./utils";
import { getSettings } from "./dataService";
import { isSupabaseConfigured } from "./supabase";
import { getAdminHash } from "../components/admin/AdminLogin";

/**
 * 访客对话留言板（访客可自由互聊，非单一留言）。
 * 配置了 Supabase 时读写数据库（guest_messages 表 + guest_* RPC），
 * 否则回退 localStorage（每 30 天自动清空）。
 */
export interface GuestMessage {
  id: string;
  parentId: string | null; // 顶层留言为 null，回复指向其 id
  name: string;
  content: string;
  ts: number; // epoch 毫秒，便于入库与排序
}

const LS = "mechanav.guestbook.v2";
const CLEAR_KEY = "mechanav.guestbook.lastClear.v2";
const CLEAR_DAYS = 30;
const CLEAR_MS = CLEAR_DAYS * 24 * 60 * 60 * 1000;

function cfg() {
  const s = getSettings().supabase;
  return isSupabaseConfigured(s) ? s : null;
}

function loadLocal(): GuestMessage[] {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return [];
    const arr = JSON.parse(raw) as GuestMessage[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

let list: GuestMessage[] = [];
let backend = false;
try {
  // 每 30 天自动清空本地留言：距上次清空满 30 天后清空并记录本次清空时间
  const now = Date.now();
  let lastClear = 0;
  try { lastClear = parseInt(localStorage.getItem(CLEAR_KEY) || "0", 10) || 0; } catch { /* ignore */ }
  if (now - lastClear >= CLEAR_MS) {
    list = [];
    try { localStorage.setItem(CLEAR_KEY, String(now)); } catch { /* ignore */ }
  } else {
    list = loadLocal();
  }
} catch { list = loadLocal(); }

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getGuestbook = (): GuestMessage[] => list;
export function useGuestbook(): GuestMessage[] { return useSyncExternalStore(subscribe, getGuestbook); }

function persist() {
  try { localStorage.setItem(LS, JSON.stringify(list)); } catch { /* ignore */ }
}

function setBackend(v: boolean) {
  backend = v;
  window.dispatchEvent(new CustomEvent("mecha:guestbook-backend", { detail: { on: v } }));
}

/** 是否已接入数据库（供 UI 显示提示） */
export function isGuestbookBackend(): boolean { return backend; }

/** 距下次自动清空还剩余的天数（仅本地模式展示；数据库模式无清空） */
export function nextClearInDays(): number {
  if (backend) return Infinity;
  try {
    const lastClear = parseInt(localStorage.getItem(CLEAR_KEY) || "0", 10) || 0;
    const remain = CLEAR_MS - (Date.now() - lastClear);
    return Math.ceil(remain / (24 * 60 * 60 * 1000));
  } catch { return CLEAR_DAYS; }
}

/** 启动时从数据库拉取留言（仅当配置了 Supabase）。页面加载后调用一次。 */
export async function initGuestbook(): Promise<void> {
  const c = cfg();
  if (!c) return;
  try {
    const rows = await fetch(
      `${c.url.replace(/\/$/, "")}/rest/v1/rpc/guest_list`,
      { method: "POST", headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" }, body: "{}" },
    );
    if (!rows.ok) throw new Error(String(rows.status));
    const data = (await rows.json()) as { id: string; parent_id: string | null; name: string; content: string; ts: number }[];
    list = (data ?? []).map((m) => ({
      id: m.id, parentId: m.parent_id || null, name: m.name, content: m.content, ts: Number(m.ts),
    }));
    setBackend(true);
    emit();
  } catch { /* 后端不可用时保持本地模式 */ }
}

/** 访客发言 / 回复其他人：parentId 为空表示发起新对话，否则为回复 */
export async function addGuestMessage(name: string, content: string, parentId: string | null = null): Promise<boolean> {
  const n = name.trim();
  const c = content.trim();
  if (!c) return false;
  const c2 = cfg();
  if (c2) {
    try {
      const r = await fetch(
        `${c2.url.replace(/\/$/, "")}/rest/v1/rpc/guest_add`,
        { method: "POST", headers: { apikey: c2.key, Authorization: `Bearer ${c2.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_id: parentId, p_name: n, p_content: c }) },
      );
      if (!r.ok) throw new Error(String(r.status));
      // 写库成功后重新拉取，保持最新顺序
      await initGuestbook();
      return true;
    } catch {
      return false;
    }
  }
  list = [{ id: uid("g"), parentId, name: n || "匿名访客", content: c, ts: Date.now() }, ...list];
  persist();
  emit();
  return true;
}

/** 管理员删除单条留言（数据库模式需口令 hash 作为 token） */
export async function deleteGuestMessage(id: string): Promise<boolean> {
  const c = cfg();
  if (c) {
    try {
      const r = await fetch(
        `${c.url.replace(/\/$/, "")}/rest/v1/rpc/guest_delete`,
        { method: "POST", headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_id: id, token: getAdminHash() }) },
      );
      if (!r.ok) throw new Error(String(r.status));
      await initGuestbook();
      return true;
    } catch {
      return false;
    }
  }
  // 删除该留言及其全部回复
  list = list.filter((m) => m.id !== id && m.parentId !== id);
  persist();
  emit();
  return true;
}

/** 管理员清空全部留言（数据库模式需口令 hash 作为 token） */
export async function clearGuestbook(): Promise<boolean> {
  const c = cfg();
  if (c) {
    try {
      const r = await fetch(
        `${c.url.replace(/\/$/, "")}/rest/v1/rpc/guest_clear`,
        { method: "POST", headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_token: getAdminHash() }) },
      );
      if (!r.ok) throw new Error(String(r.status));
      list = [];
      setBackend(true);
      emit();
      return true;
    } catch {
      return false;
    }
  }
  list = [];
  persist();
  emit();
  return true;
}

export const guestbookStats = () => {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return {
    count: list.length,
    today: list.filter((m) => m.ts >= day.getTime()).length,
  };
};