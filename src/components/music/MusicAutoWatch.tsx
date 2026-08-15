import { useEffect, useRef, useState } from "react";
import { music } from "../../lib/audio";

const MAX_AUTO = 4;    // 自动恢复尝试次数上限，超过则弹窗询问
const CHECK_MS = 2000; // 实时检测间隔

/**
 * 音乐自动播放监测器：
 * 进站后实时检测是否在播放；未播放且访客期望播放时自动尝试恢复；
 * 连续多次仍失败 → 弹窗询问访客是否需要开启；访客手动关闭/暂停后停止监测。
 */
export function MusicAutoWatch() {
  const [ask, setAsk] = useState(false);
  const stoppedRef = useRef(false);   // 访客关闭/暂停 → 停止监测
  const notifiedRef = useRef(false);  // 已弹窗，等待访客决策
  const attemptsRef = useRef(0);

  useEffect(() => {
    const iv = window.setInterval(() => {
      if (stoppedRef.current) return;
      const st = music.getState();
      if (!st.started) return;                 // 尚在首次启动等待期（进站 800ms autoplay）
      if (st.playing || music.isActuallyPlaying()) {   // 正在播放（含真实音频出声）→ 一切正常
        attemptsRef.current = 0;
        setAsk(false);
        return;
      }
      if (st.waiting) return;                   // 正在加载 / 切歌
      if (!music.getDesiredPlay()) {            // 访客已手动暂停/关闭 → 停止实时监测
        stoppedRef.current = true;
        setAsk(false);
        return;
      }
      if (notifiedRef.current) return;          // 已弹窗，等访客点"开启"或"不再提醒"
      attemptsRef.current += 1;
      music.ensurePlaying();
      if (attemptsRef.current >= MAX_AUTO) {
        notifiedRef.current = true;
        setAsk(true);
      }
    }, CHECK_MS);
    return () => window.clearInterval(iv);
  }, []);

  if (!ask) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[999] w-64 rounded-md border border-[var(--c-cyan)] bg-[var(--c-panel)]/95 p-3 shadow-[0_0_24px_rgba(0,229,255,0.3)]">
      <div className="flex items-center justify-between">
        <span className="num text-[10px] font-bold tracking-[0.25em] neon-text">♪ AUTO-PLAY</span>
        <span className="num animate-pulse text-[9px] tracking-widest text-[var(--c-magenta)]">ATTENTION</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed">检测到音乐未能自动播放，是否需要点击开启？</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn-mech h-7 flex-1 text-[10px]"
          onClick={() => {
            notifiedRef.current = false;
            attemptsRef.current = 0;
            setAsk(false);
            void music.activate();
          }}
        >
          ▶ 开启音乐
        </button>
        <button
          type="button"
          className="h-7 flex-1 rounded-sm border border-[var(--c-border)] text-[10px] text-[var(--c-dim)] transition-colors hover:border-[var(--c-magenta)] hover:text-[var(--c-magenta)]"
          onClick={() => {
            stoppedRef.current = true;
            notifiedRef.current = true;
            setAsk(false);
          }}
        >
          ✕ 不再提醒
        </button>
      </div>
    </div>
  );
}