import { useSyncExternalStore } from "react";
import { uid } from "./utils";

/**
 * 访客对话留言板（访客可自由互聊，非单一留言）。
 * 数据结构面向后续数据库接入：id 全局唯一、ts 为 epoch 毫秒时间戳、
 * parentId 表示对某条留言的回复（形成楼中楼对话）。
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

function load(): GuestMessage[] {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return [];
    const arr = JSON.parse(raw) as GuestMessage[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

let list: GuestMessage[] = [];
try {
  // 每 30 天自动清空全部留言：距上次清空满 30 天后清空并记录本次清空时间
  const now = Date.now();
  let lastClear = 0;
  try { lastClear = parseInt(localStorage.getItem(CLEAR_KEY) || "0", 10) || 0; } catch { /* ignore */ }
  if (now - lastClear >= CLEAR_MS) {
    list = [];
    try { localStorage.setItem(CLEAR_KEY, String(now)); } catch { /* ignore */ }
  } else {
    list = load();
  }
} catch { list = load(); }

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getGuestbook = (): GuestMessage[] => list;
export function useGuestbook(): GuestMessage[] { return useSyncExternalStore(subscribe, getGuestbook); }

function persist() {
  try { localStorage.setItem(LS, JSON.stringify(list)); } catch { /* ignore */ }
}

/** 距下次自动清空还剩余的天数（用于展示倒计时） */
export function nextClearInDays(): number {
  try {
    const lastClear = parseInt(localStorage.getItem(CLEAR_KEY) || "0", 10) || 0;
    const remain = CLEAR_MS - (Date.now() - lastClear);
    return Math.ceil(remain / (24 * 60 * 60 * 1000));
  } catch { return CLEAR_DAYS; }
}

/** 访客发言 / 回复其他人：parentId 为空表示发起新对话，否则为回复 */
export function addGuestMessage(name: string, content: string, parentId: string | null = null): boolean {
  const n = name.trim();
  const c = content.trim();
  if (!c) return false;
  list = [{ id: uid("g"), parentId, name: n || "匿名访客", content: c, ts: Date.now() }, ...list];
  persist();
  emit();
  return true;
}

/** 管理员删除单条留言 */
export function deleteGuestMessage(id: string) {
  // 删除该留言及其全部回复
  list = list.filter((m) => m.id !== id && m.parentId !== id);
  persist();
  emit();
}

export const guestbookStats = () => {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return {
    count: list.length,
    today: list.filter((m) => m.ts >= day.getTime()).length,
  };
};