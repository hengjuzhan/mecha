import { PLAYLIST, DEFAULT_MUSIC_SOURCES } from "../data/navData";
import type { MusicSource } from "../data/types";
import { fetcht, toastMsg } from "./utils";

export interface LyricLine { time: number; text: string }

export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const line of lrc.split(/\r?\n/)) {
    const m = line.match(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]\s*(.*)/);
    if (m) {
      const t = Number(m[1]) * 60 + Number(m[2]) + Number(m[3] ?? 0) / 1000;
      out.push({ time: t, text: (m[4] || "").trim() || "♪" });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * 按网易云 id 获取标准 LRC 歌词文本。
 * 依次尝试多个 meting 代理（injahow / i-meto），任一成功即返回；
 * 超时用 AbortController 兜底，避免卡死切歌流程。
 */
async function fetchLyricText(neteaseId: string): Promise<string | undefined> {
  const endpoints = [
    `https://api.injahow.cn/meting/?type=lrc&id=${neteaseId}`,
    `https://api.i-meto.com/meting/api?type=lrc&id=${neteaseId}`,
  ];
  for (const url of endpoints) {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) continue;
        const text = await res.text();
        // 有效歌词：含时间轴标签，且不是"暂无歌词/纯音乐"占位
        if (text && text.includes("[") && !/暂无歌词|纯音乐，?没有歌词|没有歌词/.test(text)) return text;
      } finally { window.clearTimeout(timer); }
    } catch { /* 尝试下一个代理 */ }
  }
  return undefined;
}

/** 过滤歌词里的元数据行（作词/作曲/编曲等），只保留真正的演唱歌词 */
const LRC_META = /^(作词|作曲|编曲|制作人?|作词者?|作曲者?|和声|和音|混音|录音|吉他|贝斯|鼓|键盘|监制|出品|发行|编辑|母带|原唱|翻唱|演唱|编曲者?)\s*[:：]/;
function isTrueLyricLine(l: LyricLine): boolean {
  const t = l.text.trim();
  return t.length > 0 && !LRC_META.test(t);
}

/* ============ 音效合成（WebAudio，无音频文件） ============ */
const SFX_CONF: Record<string, { type: OscillatorType; f1: number; f2: number; dur: number }> = {
  film: { type: "square", f1: 82, f2: 55, dur: 0.13 }, // 影视=低频方波
  acg: { type: "triangle", f1: 880, f2: 1318, dur: 0.09 }, // 二次元=明亮琶音
  music: { type: "sine", f1: 520, f2: 780, dur: 0.2 }, // 音乐=正弦滑音
  game: { type: "sawtooth", f1: 240, f2: 420, dur: 0.1 },
  dev: { type: "square", f1: 1100, f2: 1400, dur: 0.05 }, // 短促滴声
  ai: { type: "sine", f1: 980, f2: 620, dur: 0.13 },
  design: { type: "triangle", f1: 600, f2: 900, dur: 0.08 },
  tools: { type: "square", f1: 1600, f2: 1200, dur: 0.04 }, // 工具=短促滴声
  news: { type: "sine", f1: 440, f2: 540, dur: 0.1 },
  life: { type: "triangle", f1: 350, f2: 470, dur: 0.1 },
};

class Sfx {
  vol = 0.7;
  private ctx: AudioContext | null = null;
  private last = new Map<string, number>();

  setVolume(v: number) { this.vol = v; }
  private ensure(): AudioContext | null {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch { return null; }
  }
  play(kind: string, mode: "hover" | "click") {
    if (this.vol <= 0.001) return;
    const now = Date.now();
    const key = `${kind}:${mode}`;
    if (now - (this.last.get(key) ?? 0) < 800) return; // 同元素 800ms 防抖
    this.last.set(key, now);
    const ctx = this.ensure();
    if (!ctx) return;
    const conf = SFX_CONF[kind] ?? SFX_CONF.tools;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const mult = mode === "click" ? 1.3 : 0.8;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.2, 0.13 * this.vol * mult), t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + conf.dur);
    const note = (f1: number, f2: number, start: number, dur: number) => {
      const o = ctx.createOscillator();
      o.type = conf.type;
      o.frequency.setValueAtTime(f1, t + start);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + start + dur);
      o.connect(gain);
      o.start(t + start);
      o.stop(t + start + dur + 0.03);
    };
    if (kind === "acg") {
      note(880, 880, 0, 0.07);
      note(1108, 1108, 0.08, 0.07);
      note(1318, 1318, 0.16, 0.1);
    } else note(conf.f1, conf.f2, 0, conf.dur);
  }
}
export const sfx = new Sfx();

/* ============ 音乐引擎：GD 聚点音源 + 随机播放 + 卡顿监测 + 歌曲验证 ============ */
export interface MusicState {
  started: boolean;
  playing: boolean;
  waiting: boolean;
  trackIdx: number;
  title: string;
  artist: string;
  srcName: string;
  activeSrcId: string;
  lyric: LyricLine[];
  lyricIdx: number;
  duration: number;
  currentTime: number;
  volume: number;
  autoSwitch: boolean;
}

/** 最小有效歌曲时长（秒），低于等于此值视为非歌曲/预热片段自动跳过 */
const MIN_SONG_DURATION = 30;

class MusicEngine {
  private audio = new Audio();
  private probe = new Audio(); // 频谱探头（仅 CORS 音源，静音走 AnalyserNode）
  private preloader = new Audio(); // 预加载下一首
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private listeners = new Set<() => void>();
  private sources: MusicSource[] = [...DEFAULT_MUSIC_SOURCES];
  private token = 0;
  private stallTimer: number | null = null;
  private lastProgress = 0;
  private stallMark = 0;
  private recentIds: number[] = []; // 最近播放过的曲目 idx，避免短时重复
  private prewarm: { idx: number; url: string; title: string; artist: string; netId?: string; srcId: string } | null = null; // 预热缓存：切歌秒开
  userActivated = false;
  private wantPlay = false; // 用户期望播放：canplay 时据此自动补播，暂停后置 false，避免误自动播放

  private state: MusicState = {
    started: false, playing: false, waiting: false, trackIdx: 0,
    title: "", artist: "", srcName: "",
    activeSrcId: DEFAULT_MUSIC_SOURCES[0]?.id ?? "",
    lyric: [], lyricIdx: 0, duration: 0, currentTime: 0,
    volume: 0.8, autoSwitch: true,
  };

  constructor() {
    this.audio.preload = "none";
    this.audio.volume = this.state.volume;
    this.audio.addEventListener("timeupdate", () => {
      const t = this.audio.currentTime;
      // 播放回退（切歌/seek 回退）时强制刷新，避免歌词与进度卡在旧句
      if (t < this.state.currentTime - 0.15) {
        let idx = 0;
        for (let i = 0; i < this.state.lyric.length; i++) if (this.state.lyric[i].time <= t) idx = i;
        this.setState({ currentTime: t, lyricIdx: idx });
        return;
      }
      if (Math.abs(t - this.state.currentTime) < 0.15) return;
      let idx = 0;
      for (let i = 0; i < this.state.lyric.length; i++) if (this.state.lyric[i].time <= t) idx = i;
      this.setState({ currentTime: t, lyricIdx: idx });
    });
    this.audio.addEventListener("loadedmetadata", () => this.setState({ duration: this.audio.duration || 0 }));
    this.audio.addEventListener("play", () => this.setState({ playing: true }));
    this.audio.addEventListener("playing", () => this.setState({ playing: true })); // 实际开始出声时也校正
    this.audio.addEventListener("pause", () => this.setState({ playing: false }));
    this.audio.addEventListener("ended", () => this.next());
    // 兜底：用户期望播放但音源此刻才加载完成 → canplay 时立即补播，修复"进站/切歌不自动播放"
    this.audio.addEventListener("canplay", () => {
      if (this.wantPlay && !this.state.playing && !this.state.waiting && this.audio.src) {
        try { void this.audio.play().catch(() => {}); } catch { /* ignore */ }
      }
    });
    // 周期性对齐 playing 状态与真实 audio 播放状态：
    // 修复 play() 与 pause() 竞态（play 挂起时被 pause 打断 → 只触发 pause 不触发 play）导致
    // "明明有声音却显示未播放 / 不显示歌词" 的问题，从而避免检测器一直误弹窗。
    window.setInterval(() => {
      const a = this.audio;
      // 用 readyState 而非 duration>0 判断：部分音源为流式播放（duration 为 NaN/Infinity），
      // 此时 duration>0 恒为 false 会导致"有声音却显示未播放"，进而让检测器一直误弹窗。
      const actuallyPlaying = !!a.src && !a.paused && !a.ended && a.readyState >= 2;
      if (!this.state.waiting && this.state.playing !== actuallyPlaying) {
        this.setState({ playing: actuallyPlaying });
      }
    }, 1000);
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getState = (): MusicState => this.state;
  private setState(patch: Partial<MusicState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((l) => l()); }

  setSources(srcs: MusicSource[]) { this.sources = srcs; }
  setVolume(v: number) { this.state.volume = v; this.audio.volume = v; this.setState({ volume: v }); }
  setAutoSwitch(v: boolean) { this.setState({ autoSwitch: v }); }
  getAnalyser() { return this.analyser; }

  /** 当前用户选择的播放源（优先；不可用时回退首个可用源） */
  private getActiveSource(): MusicSource | null {
    return this.sources.find((s) => s.id === this.state.activeSrcId && s.enabled && s.baseUrl?.startsWith("http"))
      ?? this.sources.find((s) => s.enabled && s.baseUrl?.startsWith("http")) ?? null;
  }

  /** 访客手动选择播放源：立即用新源重放当前曲目 */
  selectSource(id: string) {
    const src = this.sources.find((s) => s.id === id);
    if (!src) return;
    this.setState({ activeSrcId: id });
    this.prewarm = null; // 换源后旧预热作废
    if (!this.state.started) return;
    void this.switchTo(this.state.trackIdx);
  }

  private initGraph() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      const src = ctx.createMediaElementSource(this.probe);
      src.connect(analyser);
      this.ctx = ctx; this.analyser = analyser;
    } catch { /* 频谱不可用时走伪动画 */ }
  }
  private ensureProbe(url: string) {
    this.initGraph();
    if (!this.ctx || !this.analyser) return;
    try {
      this.probe.crossOrigin = "anonymous";
      this.probe.src = url;
      void this.probe.play().catch(() => {});
    } catch { /* ignore */ }
  }
  private stopProbe() { try { this.probe.pause(); this.probe.removeAttribute("src"); } catch { /* ignore */ } }

  /** 预热下一首：提前 resolve URL + 加载到隐藏 audio，切歌时秒开 */
  private async prewarmNext() {
    try {
      const n = this.pickRandomIdx(this.state.trackIdx);
      const track = PLAYLIST[n % PLAYLIST.length];
      const src = this.getActiveSource();
      if (!src) return;
      const res = await this.resolve(src, track);
      if (!res?.url) return;
      const p = this.preloader;
      p.preload = "auto";
      p.src = "";
      // 加载到可播放，确认预热有效
      await new Promise<void>((resolve) => {
        const done = () => { p.removeEventListener("canplay", done); p.removeEventListener("error", done); resolve(); };
        p.addEventListener("canplay", done, { once: true });
        p.addEventListener("error", done, { once: true });
        p.src = res.url;
        p.load();
      });
      // 预热时校验时长：过短/异常的曲目不缓存为预热，切歌时走实时校验并跳过
      const pdur = p.duration;
      if (!isFinite(pdur) || pdur < MIN_SONG_DURATION) {
        try { p.removeAttribute("src"); } catch { /* ignore */ }
        this.prewarm = null;
        return;
      }
      this.prewarm = { idx: n, url: res.url, title: res.title, artist: res.artist, netId: res.netId, srcId: src.id };
    } catch { /* 预热失败不影响当前播放 */ }
  }

  /** 切歌：优先使用预热缓存，否则实时 resolve */
  private async switchTo(idx: number, forceReload?: boolean) {
    const token = ++this.token;
    this.stopStallMonitor();
    this.setState({ waiting: true, trackIdx: idx, playing: false });
    this.audio.pause();

    // 优先使用预热缓存
    const pw = this.prewarm;
    if (pw && pw.idx === idx && !forceReload) {
      this.prewarm = null;
      // 预热场景：preloader 已加载好，直接挂到主 audio
      this.audio.src = pw.url;
      this.audio.currentTime = 0;
      // 防御：预热曲目时长过低 → 立即跳过切下一首
      const pdur = this.audio.duration;
      if (!isFinite(pdur) || pdur < MIN_SONG_DURATION) {
        toastMsg(`「${pw.title}」时长过短，自动跳过`, "warn");
        try { this.audio.removeAttribute("src"); } catch { /* ignore */ }
        window.setTimeout(() => { if (token === this.token) this.next(); }, 60);
        return;
      }
      this.setState({
        waiting: false, playing: false, title: pw.title, artist: pw.artist,
        srcName: this.sources.find((s) => s.id === pw.srcId)?.name ?? "",
        lyric: [], lyricIdx: 0, currentTime: 0, duration: pdur,
      });
      if (this.userActivated) this.wantPlay = true;
      await this.playWait(token);
      void this.loadLyrics(pw.netId, token); // 后台加载歌词，不阻塞播放
      this.startStallMonitor();
      void this.prewarmNext(); // 继续预热下一首
      return;
    }
    this.prewarm = null;
    if (this.userActivated) this.wantPlay = true;

    // 无预热 → 逐源尝试
    const track = PLAYLIST[idx % PLAYLIST.length];
    const candidates = this.sources.filter((s) => s.enabled && s.baseUrl?.startsWith("http"));
    // 用户选择的源优先
    const active = this.getActiveSource();
    if (active) {
      const ok = await this.trySource(active, track, token);
      if (ok) return;
    }
    for (const src of candidates) {
      if (src.id === active?.id) continue;
      if (token !== this.token) return;
      const ok = await this.trySource(src, track, token);
      if (ok) return;
    }
    // 全失败 → 随机切下一首
    if (token !== this.token) return;
    window.setTimeout(() => { if (token === this.token) this.next(); }, 600);
  }

  /** 尝试用单个音源解析并播放曲目 */
  private async trySource(
    src: MusicSource, track: { title: string; artist: string }, token: number,
  ): Promise<boolean> {
    const res = await this.resolve(src, track);
    if (token !== this.token || !res) return false;
    const ok = await this.loadUrl(res.url, token);
    if (token !== this.token) return ok && false;
    if (!ok) return false;
    // 验证歌曲时长：≤30 秒视为非歌曲/预热片段，立即跳过切下一首，不再逐个音源重试同一首
    const dur = this.audio.duration;
    if (!isFinite(dur) || dur < MIN_SONG_DURATION) {
      toastMsg(`「${res.title}」时长过短（${isFinite(dur) ? dur.toFixed(1) : "—"}秒），自动跳过`, "warn");
      try { this.audio.removeAttribute("src"); } catch { /* ignore */ }
      window.setTimeout(() => { if (token === this.token) this.next(); }, 60);
      return true; // 终止当前 switchTo 的逐源重试
    }
    this.stopProbe();
    this.ensureProbe(res.url);
    this.setState({
      waiting: false, playing: false, title: res.title, artist: res.artist,
      srcName: src.name, lyric: [], lyricIdx: 0, currentTime: 0,
    });
    await this.playWait(token);
    void this.loadLyrics(res.netId, token); // 后台加载歌词，不阻塞播放
    this.startStallMonitor();
    void this.prewarmNext(); // 预热下一首
    return true;
  }

  /** 后台按网易云 id 拉取歌词并更新到当前曲目（不阻塞播放，失败保持空态） */
  private async loadLyrics(netId: string | undefined, token: number) {
    if (!netId) return;
    const lrc = await fetchLyricText(netId);
    if (token !== this.token || !lrc) return;
    const parsed = parseLrc(lrc).filter(isTrueLyricLine);
    if (parsed.length) this.setState({ lyric: parsed, lyricIdx: 0 });
  }

  /** 随机选一首歌（避免短时间内重复同一首） */
  private pickRandomIdx(exclude?: number): number {
    const n = PLAYLIST.length;
    if (n <= 1) return 0;
    let idx: number;
    let tries = 0;
    do {
      idx = Math.floor(Math.random() * n);
      tries++;
    } while (idx === exclude && tries < 10);
    // 清理过旧的播放记录（保留最近 n-1 首）
    this.recentIds.push(idx);
    if (this.recentIds.length > Math.max(3, n - 1)) this.recentIds.shift();
    return idx;
  }

  /** 进站自动随机播放（尽量在进入就播；被浏览器拦截则首次交互时恢复播放） */
  async activate() {
    this.userActivated = true;
    this.wantPlay = true;
    // 音源已加载（autoplay 被拦截）但未播放 → 借首次交互的浏览器手势恢复播放
    if (this.audio.src && this.audio.paused) {
      await this.playWait();
      return;
    }
    if (this.state.started) {
      // 音源仍在加载（网络请求未完成）：立即后台重试，命中本次手势的瞬态激活
      void this.playWait();
      return;
    }
    this.setState({ started: true });
    void this.switchTo(this.pickRandomIdx());
  }

  /** 进入页面即尝试播放（autoplay 政策可能拦截，失败留给 activate 的交互兜底） */
  autoplay() {
    if (this.state.started || this.audio.src) return;
    this.setState({ started: true });
    this.wantPlay = true;
    void this.switchTo(this.pickRandomIdx());
  }

  /** 带重试的播放：加载完成后持续尝试，命中用户交互的瞬态激活，修复"进站不自动播放" */
  private async playWait(token?: number) {
    const tk = token ?? this.token;
    for (let i = 0; i < 30; i++) {
      if (tk !== this.token) return; // 已被更新的切歌取代，放弃补播，避免误 play()
      try { await this.audio.play(); return; } catch { /* 仍被拦截，等待下轮 */ }
      await new Promise((r) => window.setTimeout(r, 100));
    }
  }

  async toggle() {
    if (!this.state.started) { await this.activate(); return; }
    if (!this.audio.src) { void this.switchTo(this.pickRandomIdx(this.state.trackIdx)); return; }
    if (this.audio.paused) await this.play(); else this.pause();
  }
  async play() { this.wantPlay = true; try { await this.audio.play(); } catch { /* ignore */ } }
  pause() { this.wantPlay = false; this.audio.pause(); }
  /** 供实时监测读取：访客当前是否期望播放（手动暂停后为 false） */
  getDesiredPlay(): boolean { return this.wantPlay; }
  /** 真实 audio 是否在出声（供检测器/面板对齐，避免竞态导致误判） */
  isActuallyPlaying(): boolean {
    const a = this.audio;
    return !!a.src && !a.paused && !a.ended && a.readyState >= 2;
  }
  /** 实时监测兜底：期望播放却未在播时，尝试恢复播放；无音源则后台切一首 */
  ensurePlaying(): void {
    if (this.state.playing || this.state.waiting) return;
    if (!this.state.started) this.setState({ started: true });
    if (!this.audio.src) {
      void this.switchTo(this.pickRandomIdx(this.state.trackIdx));
      return;
    }
    this.wantPlay = true;
    this.setState({ playing: this.isActuallyPlaying() }); // 先校正可见状态
    if (this.isActuallyPlaying()) return; // 实际已在出声，仅补状态，不再重复 play
    try { void this.audio.play().catch(() => {}); } catch { /* ignore */ }
  }
  stop() {
    this.wantPlay = false;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.stopProbe();
    this.stopStallMonitor();
    this.setState({ playing: false, waiting: false, currentTime: 0, duration: 0 });
  }
  next() { void this.switchTo(this.pickRandomIdx(this.state.trackIdx)); }
  prev() { void this.switchTo(this.pickRandomIdx(this.state.trackIdx)); }
  seek(t: number) { if (isFinite(this.audio.duration)) this.audio.currentTime = t; }

  /* ---- 播放卡顿监测：超过 5 秒无进度 → 自动切下一首 ---- */
  private startStallMonitor() {
    this.stopStallMonitor();
    this.lastProgress = this.audio.currentTime || 0;
    this.stallMark = Date.now();
    this.stallTimer = window.setInterval(() => {
      const a = this.audio;
      if (a.paused || a.ended || !a.duration || this.state.waiting) {
        this.lastProgress = a.currentTime || 0;
        this.stallMark = Date.now();
        return;
      }
      const t = a.currentTime || 0;
      if (Math.abs(t - this.lastProgress) >= 0.01) {
        this.lastProgress = t;
        this.stallMark = Date.now();
        return;
      }
      if (Date.now() - this.stallMark >= 5000) {
        this.stopStallMonitor();
        if (!this.state.autoSwitch) {
          // 访客关闭自动切换：仅提示，不切歌
          toastMsg("当前音源卡顿，已开启自动切换可自动换歌", "warn");
          return;
        }
        toastMsg("播放卡顿，自动切换下一首", "warn");
        this.next();
      }
    }, 1000);
  }
  private stopStallMonitor() {
    if (this.stallTimer !== null) { window.clearInterval(this.stallTimer); this.stallTimer = null; }
  }

  private async resolve(
    src: MusicSource,
    track: { title: string; artist: string },
  ): Promise<{ url: string; title: string; artist: string; netId?: string } | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type J = any;
    // 随机热歌源：从 Meting(网易云) 多个热门歌单随机拉取一首，实时来自 API，不缓存歌单
    if (src.kind === "random") {
      const ids = src.playlists && src.playlists.length ? src.playlists : ["3779629"];
      // 打乱歌单顺序，避免总从同一歌单开始
      const shuffled = [...ids].sort(() => Math.random() - 0.5);
      for (const pid of shuffled) {
        try {
          const arr = await fetcht<J[]>(`${src.baseUrl}?server=netease&type=playlist&id=${encodeURIComponent(pid)}`, 8000);
          if (!Array.isArray(arr) || !arr.length) continue;
          const item = arr[Math.floor(Math.random() * arr.length)];
          if (!item?.url) continue;
          // 从 url 中提取网易云歌曲 id，供后台加载歌词
          const idMatch = String(item.url).match(/[?&]id=(\d+)/);
          return {
            url: String(item.url),
            title: item.title || "随机歌曲",
            artist: item.author || "随机播放",
            netId: idMatch ? idMatch[1] : undefined,
          };
        } catch { /* 尝试下一个歌单 */ }
      }
      return null;
    }
    if (src.kind === "gdstudio") {
      try {
        const platform = src.platform || "netease";
        const s = await fetcht<J>(`${src.baseUrl}?types=search&source=${platform}&name=${encodeURIComponent(`${track.title} ${track.artist}`)}&count=5`, 6000);
        const arr: J[] = Array.isArray(s) ? s : (s?.data && Array.isArray(s.data) ? s.data : []);
        const best = arr[0];
        if (!best?.id) return null;
        const gdSource = best.source || platform;
        const u = await fetcht<J>(`${src.baseUrl}?types=url&source=${gdSource}&id=${best.id}&br=320`, 6000);
        const url = u?.url || u?.data?.url;
        if (!url) return null;
        // 网易云曲目记录歌曲 id 供后台取歌词；其它平台歌词接口不可靠，跳过
        return { url, title: best.name || track.title, artist: best.artist || track.artist, netId: gdSource === "netease" || platform === "netease" ? String(best.id) : undefined };
      } catch { return null; }
    }
    if (src.kind === "oiapi") {
      const platform = src.platform || "Music_163";
      try {
        if (platform === "Music_163") {
          // 搜索拿 id
          const s = await fetcht<J>(`${src.baseUrl}?name=${encodeURIComponent(`${track.title} ${track.artist}`)}`, 7000);
          const arr: J[] = Array.isArray(s?.data) ? s.data : [];
          const best = arr[0];
          if (!best?.id) return null;
          // 用 id 解析 URL
          const u = await fetcht<J>(`${src.baseUrl}?id=${best.id}`, 7000);
          const item = Array.isArray(u?.data) ? u.data[0] : u?.data;
          const url = item?.url;
          if (!url) return null;
          const singers = Array.isArray(best.singers) ? best.singers.map((x: J) => x?.name).filter(Boolean).join("、") : "";
          return { url, title: best.name || track.title, artist: singers || track.artist, netId: String(best.id) };
        }
        // Kuwo：msg 直接返回可播放链接
        const r = await fetcht<J>(`${src.baseUrl}?msg=${encodeURIComponent(`${track.title} ${track.artist}`)}&n=1`, 7000);
        if (!r || r.code !== 1 || !r?.data?.url) return null;
        const d = r.data;
        return { url: d.url, title: d.song || track.title, artist: d.singer || track.artist };
      } catch { return null; }
    }
    return null;
  }

  /** 5 秒内未 canplay 或报错 → 判定该音源失败 */
  private loadUrl(url: string, token: number): Promise<boolean> {
    return new Promise((resolve) => {
      const a = this.audio;
      const done = (ok: boolean) => {
        a.removeEventListener("canplay", onCan);
        a.removeEventListener("error", onErr);
        clearTimeout(timer);
        resolve(ok && token === this.token);
      };
      const onCan = () => done(true);
      const onErr = () => done(false);
      const timer = window.setTimeout(onErr, 5000);
      a.addEventListener("canplay", onCan, { once: true });
      a.addEventListener("error", onErr, { once: true });
      a.src = url;
      a.load();
    });
  }
}

export const music = new MusicEngine();
