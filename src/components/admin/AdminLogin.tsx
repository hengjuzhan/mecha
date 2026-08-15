import { useEffect, useState } from "react";
import { Modal } from "../widgets/Modal";
import { sha256Hex, toastMsg } from "../../lib/utils";

/* ============================================================
 * 后台安全验证（单一口令 + 反暴力破解）
 *  口令以 SHA-256 存储；连续失败 → 指数上升锁定；
 *  会话令牌存 sessionStorage（关页即失效）
 * ============================================================ */

const LS_HASH = "mechanav.adminhash";
const LS_LOCK = "mechanav.adminlock";
const SESSION_KEY = "mechanav.admin";
const MAX_FAILS = 5;                     // 连续 5 次失败触发锁定
const SESSION_TTL = 6 * 60 * 60 * 1000;  // 会话有效期 6 小时

interface LockState { fails: number; lockUntil: number }

function readLock(): LockState {
  try {
    const raw = localStorage.getItem(LS_LOCK);
    if (!raw) return { fails: 0, lockUntil: 0 };
    const l = JSON.parse(raw) as { fails?: number; lockUntil?: number };
    return { fails: l.fails || 0, lockUntil: l.lockUntil || 0 };
  } catch { return { fails: 0, lockUntil: 0 }; }
}
function writeLock(l: LockState) {
  try { localStorage.setItem(LS_LOCK, JSON.stringify(l)); } catch { /* ignore */ }
}

export function getAdminHash(): string {
  try { return localStorage.getItem(LS_HASH) || ""; } catch { return ""; }
}

/** 是否已完成初始化（口令已设置） */
export const adminInitialized = () => !!getAdminHash();

/** 初始化口令 */
export async function setupAdmin(pw: string) {
  try { localStorage.setItem(LS_HASH, await sha256Hex(pw)); } catch { /* ignore */ }
}

/** 单一口令校验：返回 ok / bad / locked */
export async function verifyAdmin(pw: string): Promise<"ok" | "bad" | "locked"> {
  const lock = readLock();
  if (lock.lockUntil > Date.now()) return "locked";
  const okPw = (await sha256Hex(pw)) === getAdminHash();
  if (okPw) {
    writeLock({ fails: 0, lockUntil: 0 });
    return "ok";
  }
  const fails = lock.fails + 1;
  if (fails >= MAX_FAILS) {
    // 指数冷却：5 次→30s，10 次→1min，20 次→2min…封顶 1 小时
    const escal = Math.floor(fails / MAX_FAILS);
    const cooldown = Math.min(30_000 * Math.pow(2, escal), 3_600_000);
    writeLock({ fails: 0, lockUntil: Date.now() + cooldown });
  } else {
    writeLock({ fails, lockUntil: lock.lockUntil });
  }
  return "bad";
}

/** 剩余锁定秒数（0 表示未锁定） */
export const lockRemaining = (): number => {
  const remain = readLock().lockUntil - Date.now();
  return remain > 0 ? Math.ceil(remain / 1000) : 0;
};

/* ============ 会话 ============ */
export const isAdminSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const { exp } = JSON.parse(raw) as { exp?: number };
    return !!exp && exp > Date.now();
  } catch { return false; }
};
export const setAdminSession = (v: boolean) => {
  try {
    if (v) {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, exp: Date.now() + SESSION_TTL }));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
    window.dispatchEvent(new CustomEvent("mecha:adminsession", { detail: { on: v } }));
  } catch { /* ignore */ }
};

/* ============ 验证弹窗：单一口令登录（首次输入即作为口令并进入） ============ */
export function AdminLogin({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess?: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [lockLeft, setLockLeft] = useState(lockRemaining());

  useEffect(() => {
    if (lockLeft <= 0) return;
    const iv = window.setInterval(() => setLockLeft(lockRemaining()), 1000);
    return () => window.clearInterval(iv);
  }, [lockLeft]);

  const enter = async () => {
    if (!pw) { setErr("请输入口令"); return; }
    // 首次进入（尚未设置口令）：本次输入即设为口令并进入后台
    if (!adminInitialized()) {
      await setupAdmin(pw);
      setAdminSession(true);
      toastMsg("口令已设置，进入后台模式", "ok");
      setPw(""); setErr("");
      onClose();
      onSuccess?.();
      return;
    }
    const r = await verifyAdmin(pw);
    if (r === "ok") {
      setAdminSession(true);
      toastMsg("验证通过，进入后台模式", "ok");
      setPw(""); setErr("");
      onClose();
      onSuccess?.();
    } else if (r === "locked") {
      setLockLeft(lockRemaining());
      setErr(`连续失败过多，已锁定，请 ${Math.ceil(lockRemaining() / 60)} 分钟后再试`);
      setPw("");
    } else {
      setErr("口令错误，请重试");
      setPw("");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={<span>◉ 后台安全验证</span>} width={340} z={9000}>
      <div className="flex flex-col gap-3">
        {lockLeft > 0 ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <span className="text-3xl">🔒</span>
            <p className="text-sm text-[var(--c-orange)]">验证已锁定</p>
            <p className="num text-xs text-[var(--c-dim)]">剩余 {Math.floor(lockLeft / 60)} 分 {lockLeft % 60} 秒</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-[var(--c-dim)]">
              {adminInitialized() ? "请输入访问口令后进入后台" : "首次进入：输入并设置后台访问口令（SHA-256 存储）"}
            </p>
            <input
              type="password"
              value={pw}
              autoComplete="current-password"
              placeholder="访问口令"
              className="h-10 rounded-sm px-3 text-sm tracking-[0.2em]"
              onChange={(e) => { setPw(e.target.value); setErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") void enter(); }}
            />
            {err && <p className="text-xs text-[var(--c-orange)]">{err}</p>}
            <button type="button" className="btn-mech h-10 text-sm" onClick={() => void enter()}>
              {adminInitialized() ? "验证并进入后台" : "设置口令并进入后台"}
            </button>
            <p className="text-right text-[10px] text-[var(--c-dim)]">连续失败 5 次将触发锁定</p>
          </>
        )}
      </div>
    </Modal>
  );
}