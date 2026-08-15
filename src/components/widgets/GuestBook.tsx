import { useMemo, useState } from "react";
import { addGuestMessage, deleteGuestMessage, guestbookStats, nextClearInDays, useGuestbook } from "../../lib/guestbook";
import type { GuestMessage } from "../../lib/guestbook";
import { toast } from "./Toast";
import { isAdminSession } from "../admin/AdminLogin";

/** 根据昵称生成稳定的头像渐变色 */
const AVATAR_PALETTE = [
  ["#00e5ff", "#ff2ed9"],
  ["#ffb020", "#ff2ed9"],
  ["#2dd4bf", "#a78bfa"],
  ["#38bdf8", "#f472b6"],
  ["#34d399", "#fbbf24"],
  ["#a78bfa", "#fb7185"],
];
function avatarGradient(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const c = AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  return (c as [string, string] | undefined) ?? ["#00e5ff", "#ff2ed9"];
}
function nameIcon(name: string): string {
  const s = name.trim();
  return s ? [...s][0].toUpperCase() : "访";
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return hm;
  const y = d.getFullYear() === now.getFullYear() ? "" : `${d.getFullYear()}-`;
  return `${y}${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
}

/** 单条留言（含回复） */
function MessageItem({
  msg,
  replies,
  onReply,
  onDelete,
}: {
  msg: GuestMessage;
  replies: GuestMessage[];
  onReply: (m: GuestMessage) => void;
  onDelete: (id: string) => void;
}) {
  const [g1, g2] = avatarGradient(msg.name);
  const admin = isAdminSession();

  return (
    <div className="guest-msg">
      <div className="flex items-start gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#04121a]"
          style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}
        >
          {nameIcon(msg.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-xs font-semibold" style={{ color: g1 }}>{msg.name}</span>
            <span className="num shrink-0 text-[9px] text-[var(--c-dim)]">{fmtTime(msg.ts)}</span>
            {admin && (
              <button
                type="button"
                className="ml-auto shrink-0 text-[10px] text-[var(--c-dim)] hover:text-[var(--c-orange)]"
                onClick={() => onDelete(msg.id)}
                title="删除该留言及回复"
              >✕</button>
            )}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed">{msg.content}</p>
          <button
            type="button"
            className="mt-1 shrink-0 text-[10px] text-[var(--c-dim)] transition-colors hover:text-[var(--c-cyan)]"
            onClick={() => onReply(msg)}
          >↩ 回复</button>
        </div>
      </div>

      {/* 楼中楼回复 */}
      {replies.length > 0 && (
        <div className="guest-replies">
          {replies.map((r) => {
            const [r1, r2] = avatarGradient(r.name);
            return (
              <div key={r.id} className="flex items-start gap-2">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#04121a]"
                  style={{ background: `linear-gradient(135deg, ${r1}, ${r2})` }}
                >{nameIcon(r.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[11px] font-semibold" style={{ color: r1 }}>{r.name}</span>
                    <span className="num shrink-0 text-[9px] text-[var(--c-dim)]">{fmtTime(r.ts)}</span>
                    {admin && (
                      <button type="button" className="ml-auto shrink-0 text-[10px] text-[var(--c-dim)] hover:text-[var(--c-orange)]" onClick={() => onDelete(r.id)} title="删除该回复">✕</button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed">{r.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 留言输入框 */
function Composer({
  onSend,
  placeholder,
  autoFocus,
  compact,
}: {
  onSend: (name: string, content: string) => boolean;
  placeholder: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  const send = () => {
    if (!content.trim()) { toast("内容不能为空", "warn"); return; }
    if (onSend(name, content)) { setContent(""); }
  };

  return (
    <div className="panel2 shrink-0 p-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        maxLength={300}
        autoFocus={autoFocus}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        className="w-full resize-none rounded-sm border border-[var(--c-border)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[var(--c-cyan)]"
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="昵称（可选）"
          maxLength={20}
          className="h-7 w-24 shrink-0 rounded-sm border border-[var(--c-border)] bg-transparent px-2 text-xs outline-none focus:border-[var(--c-cyan)]"
        />
        <button type="button" className="btn-mech ml-auto h-7 shrink-0 px-3 text-xs" onClick={send}>发送 ⏎</button>
      </div>
    </div>
  );
}

/**
 * 访客对话留言板：所有访客可自由互聊（楼中楼回复），
 * 每 30 天自动清空全部留言，为后续数据库接入预留结构化数据。
 */
export function GuestBook() {
  const list = useGuestbook();
  const stats = guestbookStats();
  const clearIn = nextClearInDays();
  const [replyTo, setReplyTo] = useState<GuestMessage | null>(null);

  // 顶层留言（倒序，最新在上）与各自的回复（正序）
  const { top, byParent } = useMemo(() => {
    const sorted = [...list].sort((a, b) => b.ts - a.ts);
    const parents = new Map<string, GuestMessage[]>();
    const top: GuestMessage[] = [];
    for (const m of sorted) {
      const parent = m.parentId ? list.find((x) => x.id === m.parentId) : null;
      if (parent) {
        const arr = parents.get(parent.id) || [];
        arr.unshift(m);
        parents.set(parent.id, arr);
      } else {
        top.push(m);
      }
    }
    return { top, byParent: parents };
  }, [list]);

  const send = (name: string, content: string, parentId: string | null) => {
    if (addGuestMessage(name, content, parentId)) {
      toast(parentId ? "已回复 TA～" : "留言成功，感谢你的来访！", "ok");
      return true;
    }
    return false;
  };

  const del = (id: string) => {
    deleteGuestMessage(id);
    if (replyTo?.id === id) setReplyTo(null);
    toast("已删除", "ok");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between pb-1.5">
        <span className="num text-[9px] tracking-[0.3em] text-[var(--c-orange)]">
          ◆ 留言板 · {stats.today}今日 / {stats.count}条
        </span>
        <span className="num shrink-0 text-[9px] text-[var(--c-dim)]">♻ {clearIn}天后自动清空</span>
      </div>

      {/* 新留言输入 */}
      <Composer
        onSend={(n, c) => send(n, c, null)}
        placeholder="开启一段新对话，写下你想说的话…（Enter 发送，Shift+Enter 换行）"
      />

      {/* 留言列表 */}
      <div className="thin-scroll mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {top.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-[var(--c-border)] text-xl">💬</div>
            <p className="text-xs text-[var(--c-dim)]">还没有留言，来开启第一段对话吧～</p>
          </div>
        ) : top.map((m) => (
          <MessageItem
            key={m.id}
            msg={m}
            replies={byParent.get(m.id) || []}
            onReply={(m2) => setReplyTo(m2)}
            onDelete={del}
          />
        ))}
      </div>

      {/* 楼中楼回复框 */}
      {replyTo && (
        <div className="mt-2 shrink-0 border-t border-[var(--c-border)] pt-2">
          <div className="mb-1 flex items-center gap-2">
            <span className="num text-[9px] tracking-widest text-[var(--c-magenta)]">↩ 回复 {replyTo.name}</span>
            <button type="button" className="ml-auto text-[10px] text-[var(--c-dim)] hover:text-[var(--c-orange)]" onClick={() => setReplyTo(null)}>取消</button>
          </div>
          <Composer
            autoFocus
            onSend={(n, c) => {
              const ok = send(n, c, replyTo.id);
              if (ok) setReplyTo(null);
              return ok;
            }}
            compact
            placeholder="回复 TA…"
          />
        </div>
      )}
    </div>
  );
}