import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { music } from "../../lib/audio";
import { getSettings, setSettings, t, useSettings, useStore } from "../../lib/dataService";
import { pad2 } from "../../lib/utils";
import { RangeInput } from "../ui/RangeInput";

const fmt = (s: number) => (isFinite(s) ? `${pad2(Math.floor(s / 60))}:${pad2(Math.floor(s % 60))}` : "--:--");

/**
 * 音乐模块：静态矩形霓虹灯管边框、频谱、卡拉OK逐句歌词、完整控件。
 */
export function MusicPlayer({ variant }: { variant: "rail" | "sheet" }) {
  const st = useSyncExternalStore(music.subscribe, music.getState);
  const { musicSources } = useStore(); // 音源变化触发重渲染
  useSettings(); // 设置变化（音量/霓虹/频谱）触发重渲染
  const s = getSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lyricBarRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const curTimeRef = useRef(0);

  useEffect(() => { music.setVolume(s.musicVol); }, [s.musicVol]);
  useEffect(() => { curTimeRef.current = st.currentTime; }, [st.currentTime]);

  // 音乐未启动时，用桌宠在页面正中央提示；不再在播放器内显示文字提示
  // 延迟派发：确保 MechaPet 的监听器已注册，且此刻仍未开始播放（避免 autoplay 成功后误弹）
  useEffect(() => {
    if (st.started) return;
    const t = window.setTimeout(() => {
      if (!music.getState().started) {
        window.dispatchEvent(new CustomEvent("mecha:pet-hint", {
          detail: { text: "点击页面任意处开始播放音乐哦～ ♪", duration: 5000 },
        }));
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [st.started]);

  // 8 向伸缩：四边 + 四角手柄，window 监听 pointer+mouse 保证真实拖拽可靠跟手
  const RESIZE_MIN = 200;
  const RESIZE_MAX_H = 620;

  const onResizeDown = (dir: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const frame = frameRef.current;
    const baseW = frame?.clientWidth ?? 260;
    const baseH = frame?.clientHeight ?? 320;
    const maxW = frame?.parentElement?.clientWidth ?? 400;
    const sx = e.clientX, sy = e.clientY;
    const apply = (cx: number, cy: number) => {
      const dx = cx - sx, dy = cy - sy;
      let w = baseW, h = baseH;
      if (dir.includes("e")) w = baseW + dx;
      if (dir.includes("w")) w = baseW - dx;
      if (dir.includes("s")) h = baseH + dy;
      if (dir.includes("n")) h = baseH - dy;
      w = Math.max(RESIZE_MIN, Math.min(maxW, w));
      h = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX_H, h));
      setSettings({ musicHeight: Math.round(h), musicWidth: Math.round(w) });
    };
    const pMove = (ev: PointerEvent) => apply(ev.clientX, ev.clientY);
    const mMove = (ev: MouseEvent) => apply(ev.clientX, ev.clientY);
    const stop = () => {
      window.removeEventListener("pointermove", pMove);
      window.removeEventListener("mousemove", mMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", pMove);
    window.addEventListener("mousemove", mMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("mouseup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const RESIZE_HANDLES: { d: string; st: React.CSSProperties }[] = [
    { d: "n", st: { top: 0, left: "50%", transform: "translateX(-50%)", width: 40, height: 8, cursor: "ns-resize" } },
    { d: "s", st: { bottom: 0, left: "50%", transform: "translateX(-50%)", width: 40, height: 8, cursor: "ns-resize" } },
    { d: "e", st: { right: 0, top: "50%", transform: "translateY(-50%)", width: 8, height: 40, cursor: "ew-resize" } },
    { d: "w", st: { left: 0, top: "50%", transform: "translateY(-50%)", width: 8, height: 40, cursor: "ew-resize" } },
    { d: "ne", st: { top: 0, right: 0, width: 14, height: 14, cursor: "nesw-resize" } },
    { d: "nw", st: { top: 0, left: 0, width: 14, height: 14, cursor: "nwse-resize" } },
    { d: "se", st: { bottom: 0, right: 0, width: 14, height: 14, cursor: "nwse-resize" } },
    { d: "sw", st: { bottom: 0, left: 0, width: 14, height: 14, cursor: "nesw-resize" } },
  ];

  // 频谱绘制：仅在可见时运行 RAF，30fps 节流
  const [canvasVisible, setCanvasVisible] = useState(false);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const io = new IntersectionObserver(([e]) => setCanvasVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(cv);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasVisible || !st.playing) return;
    const css = getComputedStyle(document.documentElement);
    const cyan = css.getPropertyValue("--c-cyan").trim() || "#00e5ff";
    const magenta = css.getPropertyValue("--c-magenta").trim() || "#ff2ed9";
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return; // ~30fps
      last = now;
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const { width, height } = cv;
      ctx.clearRect(0, 0, width, height);
      const bars = variant === "rail" ? 18 : 26;
      const bw = width / bars;
      const analyser = music.getAnalyser();
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < bars; i++) {
          const v = data[Math.floor((i * data.length) / bars)] / 255;
          const h = Math.max(2, v * height * 0.92);
          ctx.globalAlpha = 0.35 + v * 0.65;
          ctx.fillStyle = i % 3 === 0 ? magenta : cyan;
          ctx.fillRect(i * bw + 1, height - h, bw - 2, h);
        }
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [canvasVisible, variant, st.playing]);

  // 卡拉OK歌词：逐句进度条 + 切句动画
  const nowLyric = st.lyric[st.lyricIdx];
  const nextLyricTime = st.lyric[st.lyricIdx + 1]?.time ?? (st.duration || 0);
  const lyricStart = nowLyric?.time ?? 0;
  // 一次展示多句歌词：当前句居中，前后各 2 句
  const LINES = 5;
  const half = Math.floor(LINES / 2);
  const winStart = Math.max(0, st.lyricIdx - half);
  const winEnd = Math.min(st.lyric.length, winStart + LINES);
  const lyricWin = st.lyric.slice(winStart, winEnd);

  // 歌词进度条：20fps 节流，仅可见时运行
  useEffect(() => {
    if (!canvasVisible || !nowLyric) return;
    const dur = nextLyricTime - lyricStart;
    if (dur <= 0) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 50) return;
      last = now;
      const elapsed = (music.getState().currentTime ?? 0) - lyricStart;
      const pct = Math.max(0, Math.min(1, elapsed / dur));
      if (lyricBarRef.current) lyricBarRef.current.style.transform = `scaleX(${pct})`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasVisible, nowLyric, nextLyricTime, lyricStart]);

  const ctrl = "flex h-8 items-center justify-center rounded-sm border border-[var(--c-border)] text-sm hover:border-[var(--c-cyan)] hover:text-[var(--c-cyan)] transition-colors";

  return (
    <div
      ref={frameRef}
      className={`neon-frame relative w-full max-w-full ${st.playing ? "neon-live" : ""}`}
      style={{
        ...(s.musicHeight > 0 ? { height: s.musicHeight } : {}),
        ...(s.musicWidth > 0 ? { width: s.musicWidth } : {}),
      }}
    >
      <div className="music-body">
        <div className="flex items-center justify-between gap-2">
        <span className="num shrink-0 text-[10px] font-bold tracking-[0.25em] neon-text">🎧 MUSIC BAY</span>
        <span className="min-w-0 truncate text-right text-[9px] tracking-wider text-[var(--c-dim)]">
          {st.srcName || t("music.idle")}
        </span>
      </div>

      {/* 手动选择播放源 */}
      {musicSources.filter((src) => src.enabled).length > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="num shrink-0 text-[9px] tracking-widest text-[var(--c-dim)]">源</span>
          <select
            value={st.activeSrcId}
            onChange={(e) => music.selectSource(e.target.value)}
            title="选择播放源"
            className="num h-6 min-w-0 flex-1 cursor-pointer rounded-sm border border-[var(--c-border)] bg-transparent px-1.5 text-[9px] tracking-wider text-[var(--c-cyan)] outline-none hover:border-[var(--c-cyan)] focus:border-[var(--c-cyan)]"
          >
            {musicSources.filter((src) => src.enabled).map((src) => (
              <option key={src.id} value={src.id} className="bg-[var(--c-panel)] text-[var(--c-text)]">
                {src.name}
              </option>
            ))}
          </select>
          <span className={`num shrink-0 text-[9px] ${st.waiting ? "blink text-[var(--c-cyan)]" : "text-[var(--c-dim)]"}`}>
            {st.waiting ? "LOAD" : st.playing ? "LIVE" : "STBY"}
          </span>
        </div>
      )}

      {!st.started ? (
        <div className="mt-2 flex flex-col items-center gap-2 pb-1">
          <button type="button" className="btn-mech h-8 px-4 text-xs" onClick={() => void music.toggle()}>▶ 启动电台</button>
        </div>
      ) : (
        <>
          {/* 歌名 / 歌手 */}
          <div className="mt-2 min-w-0">
            <div className="truncate text-[13px] font-medium">
              {st.waiting && <span className="blink mr-1.5 text-[var(--c-cyan)]">◌</span>}
              {st.title || "载入中…"}
            </div>
            <div className="truncate text-[10px] text-[var(--c-dim)]">{st.artist || "MECHA 机库电台"}</div>
          </div>

          {/* 频谱 */}
          <canvas ref={canvasRef} width={variant === "rail" ? 220 : 520} height={34}
            className="mt-1.5 h-[34px] w-full" aria-hidden="true" />

          {/* 卡拉OK歌词：一次展示多句，当前句居中高亮，长句自动换行完整显示 */}
          <div className="kara-lines mt-1.5 text-center">
            {lyricWin.length === 0
              ? <div className="kara-line text-[12px]">♪</div>
              : lyricWin.map((line) =>
                  line === nowLyric
                    ? <div key={`a-${line.time}`} className="kara-line kara-active break-words px-1">{line.text || "♪"}</div>
                    : <div key={`d-${line.time}`} className="kara-dim break-words px-1">{line.text || "♪"}</div>,
                )}
          </div>
          {/* 歌词逐句进度条 */}
          <div className="mx-auto h-[2px] w-3/4 overflow-hidden rounded-full bg-[var(--c-border)]">
            <div
              ref={lyricBarRef}
              className="kara-bar h-full origin-left rounded-full"
              style={{ transform: "scaleX(0)" }}
            />
          </div>

          {/* 控制 */}
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <button type="button" className={ctrl} onClick={() => music.prev()} aria-label="上一首">⏮</button>
            <button type="button" className={`${ctrl} border-[var(--c-cyan)] text-[var(--c-cyan)]`} onClick={() => void music.toggle()} aria-label={st.playing ? "暂停" : "播放"}>
              {st.playing ? "⏸" : "▶"}
            </button>
            <button type="button" className={ctrl} onClick={() => music.stop()} aria-label="停止">⏹</button>
            <button type="button" className={ctrl} onClick={() => music.next()} aria-label="下一首">⏭</button>
          </div>

          {/* 进度条 */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="num text-[9px] text-[var(--c-dim)]">{fmt(st.currentTime)}</span>
            <RangeInput
              min={0} max={st.duration || 1} step={0.5}
              value={Math.min(st.currentTime, st.duration || 0)}
              className="h-1 min-w-0 flex-1"
              ariaLabel="进度"
              onChange={(v) => music.seek(v)}
            />
            <span className="num text-[9px] text-[var(--c-dim)]">{fmt(st.duration)}</span>
          </div>

          {/* 音量 + 霓虹灯管滑杆 */}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="shrink-0 text-[11px]">🔊</span>
            <RangeInput
              min={0} max={1} step={0.05} value={s.musicVol}
              className="h-1 min-w-0 flex-1"
              ariaLabel={t("music.vol")}
              onChange={(v) => setSettings({ musicVol: v })}
            />
            <span className="num shrink-0 text-[9px] text-[var(--c-dim)]">{t("music.vol")}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="num shrink-0 text-[9px] tracking-widest neon-mag">☰ {t("music.neon")}</span>
            <RangeInput
              min={0.3} max={1.6} step={0.05} value={s.neonBright}
              className="h-1 min-w-0 flex-1"
              ariaLabel={t("music.bright")}
              onChange={(v) => setSettings({ neonBright: v })}
            />
            <RangeInput
              min={0.4} max={3} step={0.1} value={s.neonSpeed}
              className="h-1 min-w-0 flex-1"
              ariaLabel={t("music.freq")}
              onChange={(v) => setSettings({ neonSpeed: v })}
            />
          </div>
          {/* 边缘光效调节器 */}
          <div className="mt-1 flex items-center gap-2">
            <span className="num shrink-0 text-[9px] tracking-widest neon-text">✦ {t("music.glow")}</span>
            <RangeInput
              min={0} max={1.6} step={0.05} value={s.musicGlow}
              className="h-1 min-w-0 flex-1"
              ariaLabel={t("music.glow")}
              onChange={(v) => setSettings({ musicGlow: v })}
            />
            <span className="num w-6 shrink-0 text-right text-[9px] text-[var(--c-dim)]">{s.musicGlow.toFixed(2)}</span>
          </div>
        </>
      )}
      </div>
      {/* 8 向伸缩手柄：四边 + 四角，悬停显形 */}
      {RESIZE_HANDLES.map((h) => (
        <div
          key={h.d}
          className="music-rh"
          style={h.st}
          title={t("music.resize")}
          aria-label={t("music.resize")}
          onPointerDown={onResizeDown(h.d)}
        />
      ))}
    </div>
  );
}
