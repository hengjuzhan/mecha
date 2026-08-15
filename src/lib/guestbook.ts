/**
 * 访客对话留言板（v2 · 云端权威）。
 * 云端可用时所有留言读写走数据库（cloud.guest.*），全部设备实时一致；
 * 云端不可用时回退 localStorage 本地模式（每 30 天自动清空）。
 */
import { useSyncExternalStore } from "react";
import { uid } from "./utils";
import { cloud, type GuestRow } from "./cloud";
import { getAdminHash } from "../components/admin/AdminLogin";

export interface GuestMessage extends GuestRow {}

const LS = "mechanav.guestbook.v2";
const CLEAR_KEY = "mechanav.guestbook.lastClear.v2";
const CLEAR_DAYS = 30;
const CLEAR_MS = CLEAR_DAYS * 24 * 60 * 60 * 1000;

function cloudOn(): boolean {
  return cloud.configured();
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

/** 启动 / 保存数据库连接后从云端拉取留言，成功则进入云端模式 */
export async function initGuestbook(): Promise<void> {
  if (!cloudOn()) return;
  const rows = await cloud.guest.list();
  if (!rows) return; // 云端不可用：保持当前模式
  list = rows;
  setBackend(true);
  emit();
}

/** 访客发言 / 回复其他人：parentId 为空表示发起新对话，否则为回复 */
export async function addGuestMessage(name: string, content: string, parentId: string | null = null): Promise<boolean> {
  const n = name.trim();
  const c = content.trim();
  if (!c) return false;
  if (cloudOn()) {
    const ok = await cloud.guest.add(parentId, n, c);
    if (ok) {
      await initGuestbook(); // 重新拉取保持最新顺序
      return true;
    }
    return false;
  }
  list = [{ id: uid("g"), parentId, name: n || "匿名访客", content: c, ts: Date.now() }, ...list];
  persist();
  emit();
  return true;
}

/** 管理员删除单条留言 */
export async function deleteGuestMessage(id: string): Promise<boolean> {
  if (cloudOn()) {
    const ok = await cloud.guest.del(id, getAdminHash());
    if (ok) {
      await initGuestbook();
      return true;
    }
    return false;
  }
  // 删除该留言及其全部回复
  list = list.filter((m) => m.id !== id && m.parentId !== id);
  persist();
  emit();
  return true;
}

/** 管理员清空全部留言 */
export async function clearGuestbook(): Promise<boolean> {
  if (cloudOn()) {
    const ok = await cloud.guest.clear(getAdminHash());
    if (!ok) return false;
    list = [];
    setBackend(true);
    emit();
    return true;
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
