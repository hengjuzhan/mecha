import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion, jumpToId } from "../../lib/utils";
import { searchAll } from "../../lib/dataService";
import { prepareLocate, waitForId } from "../../lib/locate";
import type { Announcement, Category, LinkItem } from "../../data/types";

/**
 * 桌面机甲宠物：程序化像素精灵（16×14 像素矩阵 → canvas）。
 * 性能优化：idle 时 setInterval(300ms)，active 时 RAF(20fps)，仅帧变化时重绘 canvas。
 */
type PetState = "idle" | "walk" | "fly" | "chase" | "scared" | "happy";

const PAL: Record<string, string> = {
  K: "#0a1220", C: "#00e5ff", M: "#ff2ed9", W: "#eaffff", O: "#ffb020", G: "#33415c", Y: "#fff6a8",
};
const W = 16, H = 14, SCALE = 5;

const F = (rows: string[]): string[][] =>
  rows.map((r) => { const a = r.slice(0, W).split(""); while (a.length < W) a.push("."); return a; });

const IDLE0 = F([
  "...KK.....KK....",
  "..KCCK...KCCK...",
  "..KCCK...KCCK...",
  "...KKKKKKKKKK...",
  "..KCCCCCCCCCCK..",
  ".KCWWCCCCCCWWCK.",
  ".KCWWCCCCCCWWCK.",
  ".KCCCCCCCCCCCCK.",
  "..KKKKKKKKKKKK..",
  "...KKMMMMMMKK...",
  "..KKCMMMMMMCKK..",
  "..KKCMMMMMMCKK..",
  "...KMMMGGMMMK...",
  "....KKKKKKKK....",
]);
const IDLE1 = F([
  "...KK.....KK....",
  "..KCCK...KCCK...",
  "..KCCK...KCCK...",
  "...KKKKKKKKKK...",
  "..KCCCCCCCCCCK..",
  ".KCCCCCCCCCCCK..",
  ".KCWWCCCCCCWWCK.",
  ".KCCCCCCCCCCCCK.",
  "..KKKKKKKKKKKK..",
  "...KKMMMMMMKK...",
  "..KKCMMMMMMCKK..",
  "..KKCMMMMMMCKK..",
  "...KMMMGGMMMK...",
  "....KKKKKKKK....",
]);
const WALK0 = F([
  "...KK.....KK....",
  "..KCCK...KCCK...",
  "..KCCK...KCCK...",
  "...KKKKKKKKKK...",
  "..KCCCCCCCCCCK..",
  ".KCWWCCCCCCWWCK.",
  ".KCWWCCCCCCWWCK.",
  ".KCCCCCCCCCCCCK.",
  "..KKKKKKKKKKKK..",
  "...KKMMMMMMKK...",
  "..KKCMMMMMMCKK..",
  "..KKCMMMMMMCKK..",
  "...KMMMG..GMMK..",
  "...KKKK....KKK..",
]);
const WALK1 = F([
  "...KK.....KK....",
  "..KCCK...KCCK...",
  "..KCCK...KCCK...",
  "...KKKKKKKKKK...",
  "..KCCCCCCCCCCK..",
  ".KCWWCCCCCCWWCK.",
  ".KCWWCCCCCCWWCK.",
  ".KCCCCCCCCCCCCK.",
  "..KKKKKKKKKKKK..",
  "...KKMMMMMMKK...",
  "..KKCMMMMMMCKK..",
  "..KKCMMMMMMCKK..",
  "..KMMG....GMMK..",
  "..KKKK....KKKK..",
]);
const FLY0 = F([
  "...KK.....KK....",
  ".KKCCK...KCCKK..",
  ".KKCCK...KCCKK..",
  "...KKKKKKKKKK...",
  "..KCCCCCCCCCCK..",
  ".KCWWCCCCCCWWCK.",
  ".KCWWCCCCCCWWCK.",
  ".KCCCCCCCCCCCCK.",
  "..KKKKKKKKKKKK..",
  "...KKMMMMMMKK...",
  "..KKCMMMMMMCKK..",
  "...KMMMMMMMMK...",
  ".....OOOOOO.....",
  "......OOOO......",
]);
const FLY1 = F([
  "....KK...KK.....",
  "...KCCK.KCCK....",
  "...KCCK.KCCK....",
  "....KKKKKKKK....",
  "...KCCCCCCCCK...",
  "..KCWWCCCCWWCK..",
  "..KCWWCCCCWWCK..",
  "..KCCCCCCCCCCK..",
  "...KKKKKKKKKK...",
  "....KKMMMMKK....",
  "...KKCMMMMCKK...",
  "....KMMMMMMK....",
  "....OOOOOOOO....",
  ".....OOOOOO.....",
]);
const SCARED = F([
  "....KK...KK.....",
  "...KCCK.KCCK....",
  "...KCCK.KCCK....",
  "....KKKKKKKK....",
  "...KCCCCCCCCK...",
  "..KCOOOCCCOOOK..",
  "..KCOOOCCCOOOK..",
  "...KCCCKKCCCK...",
  "....KKKKKKKK....",
  ".....KKMMKK.....",
  "....KKCMMCKK....",
  "....KKCMMCKK....",
  ".....KMMGGK.....",
  "......KKKK......",
]);
const HAPPY = F([
  "...KK.....KK....",
  "..KCCK...KCCK...",
  "..KCCK...KCCK...",
  "...KKKKKKKKKK...",
  "..KCCCCCCCCCCK..",
  ".KCCCCCCCCCCCK..",
  ".KCYYCCCCCCYYCK.",
  ".KCCCCCCCCCCCCK.",
  "..KKKKKKKKKKKK..",
  "...KKMMMMMMKK...",
  "..KKCMMMMMMCKK..",
  "..KKCMMMMMMCKK..",
  "...KMMMGGMMMK...",
  "....KKKKKKKK....",
]);
const FRAMES: Record<PetState, string[][][]> = {
  idle: [IDLE0, IDLE1],
  walk: [WALK0, WALK1],
  fly: [FLY0, FLY1],
  chase: [WALK0, WALK1],
  scared: [SCARED, FLY1],
  happy: [HAPPY, IDLE0],
};
const FPS: Record<PetState, number> = { idle: 2.2, walk: 8, fly: 10, chase: 11, scared: 12, happy: 6 };

/** 互动字幕 */
const ENTRY_MSG = "双击我，有惊喜哦！";
const REST_MSGS = [
  "你为什么不理我呀？",
  "好无聊，陪我玩会儿嘛～",
  "我在这里等你许久了…",
  "哼，都不点点我～",
  "机甲能量有点低，歇会儿…",
  "你忙你的，我歇我的～",
];
const TAP_MSGS = [
  "嘿嘿，今天心情不错！",
  "双击我有惊喜哦！",
  "机甲机修师在此！",
  "找我旁边的小家伙，可以帮你找东西～",
];

const REST_INTERVAL = 60000;

type Task = { type: "rest" | "go"; target: { x: number; y: number } };

export function MechaPet() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const babyRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mainElRef = useRef<HTMLDivElement>(null);
  const babyElRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 70, y: 130 });
  const st = useRef<PetState>("idle");
  const dir = useRef(1);
  const task = useRef<Task | null>(null);
  const nextRest = useRef(performance.now() + REST_INTERVAL);
  const nextWander = useRef(performance.now() + 12000);
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const mouse = useRef({ x: 0, y: 0 });
  const staticMode = useRef(prefersReducedMotion());
  const mobile = useRef(window.innerWidth < 768);
  const initSize0 = window.innerWidth < 768 ? 56 : 80;
  const babyPos = useRef({ x: 70 + initSize0 + 6, y: 130 + initSize0 * 0.45 });
  const babyMode = useRef<"free" | "follow">("free");
  const babyTarget = useRef<{ x: number; y: number } | null>(null);
  const babyWanderAt = useRef(performance.now() + 2500);
  const babyNextFollow = useRef(performance.now() + 6000);
  const babyFollowUntil = useRef(0);
  const bubbleTimer = useRef(0);
  const untilNow = useRef(0);
  const startActiveRef = useRef<() => void>(() => {});
  const [bubble, setBubble] = useState<{ text: string; k: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const [centerHint, setCenterHint] = useState<{ text: string; k: number } | null>(null);

  const showBubble = (text: string, hold = 3200) => {
    setBubble({ text, k: Date.now() });
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), hold);
  };

  useEffect(() => {
    showBubble(ENTRY_MSG, 5000);
    return () => window.clearTimeout(bubbleTimer.current);
  }, []);

  const openSearch = () => {
    setSearchVal("");
    setSearchOpen(true);
  };

  const submitSearch = (raw: string) => {
    const q = raw.trim();
    setSearchOpen(false);
    if (!q) return;
    // 管理员口令属于保密信息，一律不回答、不定位
    if (/管理员\s*(密码|口令)|后台\s*(密码|口令)|admin\s*(password|pwd)|(密码|口令)\s*(是多少|是什么|怎么|哪里)/i.test(q)) {
      showBubble("这个我不能告诉你哦～口令是保密哒！", 3800);
      return;
    }
    const hits = searchAll(q);
    if (hits.length === 0) {
      showBubble(`没找到「${q}」，换个关键词试试～`, 3800);
      return;
    }
    const h = hits[0];
    const ref = h.ref as LinkItem | Category | Announcement;
    const id = prepareLocate(h);
    const name = (ref as { name?: string; title?: string }).name || (ref as { title?: string }).title || "";
    locateAndGo(id, name);
  };

  const locateAndGo = (id: string, name: string) => {
    // 目标元素可能因懒加载尚未渲染，轮询等待其出现（最长约 2.5s）
    waitForId(id, () => {
      if (!jumpToId(id)) {
        showBubble(name ? `「${name}」加载中，稍后再试～` : "目标还在路上，稍后再试～", 3000);
        return;
      }
      window.setTimeout(() => {
        const el = document.getElementById(id);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const w = window.innerWidth;
        const docH = Math.max(document.body.scrollHeight, window.innerHeight);
        const size = mobile.current ? 56 : 80;
        const tx = Math.max(20, Math.min(w - size - 20, r.left + r.width / 2 - size / 2));
        const ty = Math.max(60, Math.min(docH - size - 60, r.top - size - 12));
        task.current = { type: "go", target: { x: tx, y: ty } };
        st.current = "walk";
        startActiveRef.current();
        showBubble(name ? `已带你去「${name}」，就是这里！` : "找到了，就在这里！", 4200);
      }, 700);
    });
  };

  // 主循环：idle 时 setInterval(300ms)，active 时 RAF(20fps)
  useEffect(() => {
    let raf = 0;
    let intervalId: number | null = null;
    let frame = 0;
    let lastDrawnFrame = -1;
    let lastDrawnState: PetState | "" = "";
    let last = performance.now();
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    const bv = babyRef.current;
    const btx = bv?.getContext("2d");

    const draw = (state: PetState) => {
      if (!cv || !ctx) return;
      ctx.clearRect(0, 0, W * SCALE, H * SCALE);
      ctx.save();
      ctx.translate((W * SCALE) / 2, 0);
      ctx.scale(dir.current, 1);
      ctx.translate(-(W * SCALE) / 2, 0);
      const frames = FRAMES[state];
      const f = (frames && frames[Math.floor(frame) % frames.length]) || FRAMES.idle[0];
      if (!f) return;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const c = f[y]?.[x];
          if (!c || c === ".") continue;
          ctx.fillStyle = PAL[c] || "#00e5ff";
          ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
      }
      ctx.restore();
    };

    const drawBaby = () => {
      if (!bv || !btx) return;
      const bScale = SCALE * 0.6;
      btx.clearRect(0, 0, W * bScale, H * bScale);
      const f = FRAMES.idle[Math.floor(frame / 2) % 2] || FRAMES.idle[0];
      if (!f) return;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const c = f[y]?.[x];
          if (!c || c === ".") continue;
          btx.fillStyle = PAL[c] || "#00e5ff";
          btx.fillRect(Math.round(x * bScale), Math.round(y * bScale), Math.ceil(bScale), Math.ceil(bScale));
        }
      }
    };

    const drawIfChanged = (state: PetState) => {
      const f = Math.floor(frame);
      if (f !== lastDrawnFrame || state !== lastDrawnState) {
        lastDrawnFrame = f;
        lastDrawnState = state;
        draw(state);
        drawBaby();
      }
    };

    const updateTransforms = () => {
      if (mainElRef.current) mainElRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
      if (babyElRef.current) babyElRef.current.style.transform = `translate(${babyPos.current.x}px, ${babyPos.current.y}px)`;
    };

    const updateBaby = (now: number, _dt: number) => {
      const w = window.innerWidth;
      const docH = Math.max(document.body.scrollHeight, window.innerHeight);
      const size = mobile.current ? 56 : 80;
      const bSize = Math.round(size * 0.6);

      if (babyMode.current === "follow") {
        const fx = pos.current.x + size + 6;
        const fy = pos.current.y + size * 0.45;
        const bdx = fx - babyPos.current.x, bdy = fy - babyPos.current.y;
        const bd = Math.hypot(bdx, bdy);
        if (bd > 4) {
          babyPos.current = { x: babyPos.current.x + (bdx / bd) * 2, y: babyPos.current.y + (bdy / bd) * 2 };
        } else {
          babyPos.current = { x: fx, y: fy };
        }
        if (now > babyFollowUntil.current) babyMode.current = "free";
      } else {
        if (now > babyNextFollow.current) {
          babyMode.current = "follow";
          babyFollowUntil.current = now + 5000 + Math.random() * 5000;
          babyNextFollow.current = now + 8000 + Math.random() * 12000;
        }
        if (now > babyWanderAt.current) {
          babyWanderAt.current = now + 2500 + Math.random() * 4500;
          babyTarget.current = {
            x: 20 + Math.random() * (w - bSize - 40),
            y: 55 + Math.random() * (docH - bSize - 90),
          };
        }
        if (babyTarget.current) {
          const bdx = babyTarget.current.x - babyPos.current.x, bdy = babyTarget.current.y - babyPos.current.y;
          const bd = Math.hypot(bdx, bdy);
          if (bd > 6) {
            babyPos.current = { x: babyPos.current.x + (bdx / bd) * 2.2, y: babyPos.current.y + (bdy / bd) * 2.2 };
          } else {
            babyTarget.current = null;
          }
        }
      }
      babyPos.current = {
        x: Math.max(6, Math.min(w - bSize - 6, babyPos.current.x)),
        y: Math.max(50, Math.min(docH - bSize - 60, babyPos.current.y)),
      };
    };

    const checkTimers = (now: number): boolean => {
      if (now < (window as any).__summonHold) return false; // 召唤后抑制阶段不触发自动漫游/休息
      const w = window.innerWidth;
      const docH = Math.max(document.body.scrollHeight, window.innerHeight);
      const size = mobile.current ? 56 : 80;

      if (now > nextRest.current && !task.current) {
        task.current = {
          type: "rest",
          target: { x: Math.max(20, w - size - 40), y: Math.max(50, docH - size - 90) },
        };
        st.current = "walk";
        nextRest.current = now + REST_INTERVAL;
        return true;
      }
      if (now > nextWander.current && !task.current && !dragging.current) {
        task.current = {
          type: "go",
          target: { x: 30 + Math.random() * (w - size - 60), y: 60 + Math.random() * (docH - size - 120) },
        };
        st.current = "walk";
        nextWander.current = now + 14000 + Math.random() * 16000;
        return true;
      }
      return false;
    };

    // ---- idle 心跳：200ms 低频，仅检查计时器 + 更新小桌宠 ----
    const idleTick = () => {
      const now = performance.now();
      if (staticMode.current) return;

      // 召唤后抑制期：强制复位到顶部
      if (now < (window as any).__summonHold) {
        pos.current = { x: 70, y: 60 };
        task.current = null;
        st.current = "idle";
        updateBaby(now, 0.2);
        frame += 0.2 * FPS.idle;
        drawIfChanged("idle");
        updateTransforms();
        return;
      }

      if (checkTimers(now)) { startActive(); return; }
      if (st.current !== "idle" || task.current || dragging.current) { startActive(); return; }

      updateBaby(now, 0.2);
      frame += 0.2 * FPS.idle;
      drawIfChanged("idle");
      updateTransforms();
    };

    // ---- active 循环：RAF 20fps，完整运动逻辑 ----
    const activeLoop = (now: number) => {
      raf = requestAnimationFrame(activeLoop);
      if (now - last < 33) return; // 30fps
      const dt = (now - last) / 1000;
      last = now;

      if (staticMode.current) {
        updateTransforms();
        draw("idle"); drawBaby();
        return;
      }

      // 召唤后抑制期：每帧强制复位到顶部，杜绝自动漫游/其他机制把桌宠带走
      if (now < (window as any).__summonHold) {
        pos.current = { x: 70, y: 60 };
        task.current = null;
        st.current = "idle";
        updateBaby(now, dt);
        updateTransforms();
        draw("idle"); drawBaby();
        return;
      }

      const w = window.innerWidth;
      const docH = Math.max(document.body.scrollHeight, window.innerHeight);
      const size = mobile.current ? 56 : 80;

      checkTimers(now);

      if (st.current === "happy" && now > untilNow.current) st.current = "walk";
      if (st.current === "scared" && now > untilNow.current) st.current = "idle";

      let dx = 0, dy = 0;
      if (task.current) {
        const tgt = task.current.target;
        dx = tgt.x - pos.current.x;
        dy = tgt.y - pos.current.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 8) {
          const t = task.current;
          task.current = null;
          st.current = "idle";
          if (t.type === "rest") showBubble(REST_MSGS[Math.floor(Math.random() * REST_MSGS.length)], 3600);
        }
      } else if (st.current === "idle") {
        frame += dt * FPS.idle;
      } else if (st.current === "chase") {
        const tgt = mouse.current;
        dx = tgt.x - pos.current.x;
        dy = tgt.y - pos.current.y;
        if (Math.hypot(dx, dy) > 90) { const m = Math.hypot(dx, dy); dx = (dx / m) * 3; dy = (dy / m) * 3; }
        if (now > untilNow.current) st.current = "idle";
      } else if (st.current === "scared") {
        const corners = [{ x: 40, y: 60 }, { x: w - 120, y: 60 }, { x: 40, y: docH - size - 60 }, { x: w - 120, y: docH - size - 60 }];
        corners.sort((a, b) => (Math.hypot(b.x - mouse.current.x, b.y - mouse.current.y) - Math.hypot(a.x - mouse.current.x, a.y - mouse.current.y)));
        const t = corners[0];
        dx = (t.x - pos.current.x) / 18;
        dy = (t.y - pos.current.y) / 18;
        if (now > untilNow.current) st.current = "idle";
      } else if (st.current === "fly" && dragging.current) {
        dx = (mouse.current.x - pos.current.x) * 0.35;
        dy = (mouse.current.y - pos.current.y) * 0.35;
      }

      const speed = st.current === "walk" ? 1.4 : st.current === "chase" ? 2.6 : st.current === "scared" ? 6 : 1;
      const px = pos.current.x + (dx || dy ? (dx / (Math.hypot(dx, dy) || 1)) * speed : dx);
      const py = pos.current.y + (dx || dy ? (dy / (Math.hypot(dx, dy) || 1)) * speed : dy);
      pos.current = {
        x: Math.max(6, Math.min(w - size - 6, px || pos.current.x)),
        y: Math.max(50, Math.min(docH - size - 60, py || pos.current.y)),
      };
      if (dx > 0.4) dir.current = 1;
      if (dx < -0.4) dir.current = -1;

      updateBaby(now, dt);

      if (st.current !== "idle") frame += dt * FPS[st.current];
      draw(st.current);
      drawBaby();
      updateTransforms();

      // 回到 idle → 切回低频心跳
      if (st.current === "idle" && !task.current && !dragging.current) {
        stopActive();
        startIdle();
      }
    };

    const startIdle = () => {
      if (intervalId === null) intervalId = window.setInterval(idleTick, 200);
    };
    const stopIdle = () => {
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
    };
    const startActive = () => {
      stopIdle();
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(activeLoop);
    };
    const stopActive = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };

    startActiveRef.current = startActive;

    if (staticMode.current) {
      draw("idle"); drawBaby();
      updateTransforms();
    } else {
      startIdle();
    }

    return () => {
      stopIdle();
      stopActive();
    };
  }, []);

  // 桌宠召唤器：收到事件后立即回到最上方并说"我回来了"
  useEffect(() => {
    const onSummon = () => {
      if (staticMode.current) { showBubble("我回来了！", 3000); return; }
      const sz = mobile.current ? 56 : 80;
      const topX = 70, topY = 60;
      // 主桌宠瞬移到顶部
      pos.current = { x: topX, y: topY };
      task.current = null;
      st.current = "idle";
      // 抑制召唤后的自动漫游/休息，让桌宠在顶部停留，避免瞬移后立刻被带走
      nextRest.current = performance.now() + 10000;
      nextWander.current = performance.now() + 10000;
      (window as any).__summonHold = performance.now() + 8000; // 8 秒内禁止自动漫游/休息
      if (mainElRef.current) mainElRef.current.style.transform = `translate(${topX}px, ${topY}px)`;
      // 小桌宠也瞬移到最上方，紧贴主桌宠右侧
      babyPos.current = { x: topX + sz + 6, y: topY };
      babyMode.current = "free";
      babyTarget.current = null;
      babyWanderAt.current = performance.now() + 8000;
      babyNextFollow.current = performance.now() + 9000;
      if (babyElRef.current) babyElRef.current.style.transform = `translate(${babyPos.current.x}px, ${babyPos.current.y}px)`;
      startActiveRef.current();
      showBubble("我回来了！", 3000);
    };
    window.addEventListener("mecha:pet-summon", onSummon);
    return () => window.removeEventListener("mecha:pet-summon", onSummon);
  }, []);

  // 页面正中央提示：音乐未播放等场景由外部事件触发，居中显示气泡并自动消失
  useEffect(() => {
    const onHint = (e: Event) => {
      const { text = "", duration = 4000 } = ((e as CustomEvent).detail ?? {}) as { text?: string; duration?: number };
      if (!text) return;
      setCenterHint({ text, k: Date.now() });
      window.clearTimeout((window as any).__centerHintTimer);
      (window as any).__centerHintTimer = window.setTimeout(() => setCenterHint(null), duration);
    };
    window.addEventListener("mecha:pet-hint", onHint);
    return () => {
      window.removeEventListener("mecha:pet-hint", onHint);
      window.clearTimeout((window as any).__centerHintTimer);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (staticMode.current) return;
    dragging.current = true;
    dragMoved.current = false;
    st.current = "fly";
    startActiveRef.current();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 4) dragMoved.current = true;
    mouse.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => {
    if (staticMode.current) return;
    const wasDrag = dragMoved.current;
    dragging.current = false;
    if (wasDrag) { st.current = "idle"; return; }
    untilNow.current = performance.now() + 900;
    st.current = "chase";
    startActiveRef.current();
    showBubble(TAP_MSGS[Math.floor(Math.random() * TAP_MSGS.length)]);
  };

  const size = mobile.current ? 56 : 80;
  const babySize = Math.round(size * 0.6);

  return (
    <>
      <div
        ref={wrapRef}
        className="fixed left-0 top-0 z-[9500]"
        style={{ position: "absolute", pointerEvents: "none" }}
      >
        <div
          ref={mainElRef}
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "auto" }}
        >
          {bubble && (
            <div
              key={bubble.k}
              className="pet-bubble absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 text-[11px]"
            >
              {bubble.text}
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={W * SCALE}
            height={H * SCALE}
            aria-hidden="true"
            className="pixelated cursor-grab touch-none"
            style={{
              width: size,
              height: size * (H / W),
              display: "block",
            }}
            onPointerDown={(e) => { onPointerDown(e); }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
        <div
          ref={babyElRef}
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "auto" }}
          onClick={openSearch}
          title="有问题可以询问我"
          className="cursor-grab"
        >
          <div className="pet-bubble-baby whitespace-nowrap px-2 py-0.5 text-[10px]" style={{ marginBottom: 2 }}>
            有问题可以询问我？
          </div>
          <canvas
            ref={babyRef}
            width={Math.ceil(W * SCALE * 0.6)}
            height={Math.ceil(H * SCALE * 0.6)}
            aria-hidden="true"
            className="pixelated"
            style={{
              width: babySize,
              height: babySize * (H / W),
              display: "block",
            }}
          />
        </div>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-[9600] flex items-start justify-center bg-black/70 pt-[28vh]"
          onClick={() => setSearchOpen(false)}>
          <div className="panel-glow w-[min(92vw,420px)] border border-[var(--c-cyan)] p-3"
            style={{ background: "var(--c-panel)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="num mb-1.5 flex items-center gap-2 text-[10px] tracking-[0.3em] text-[var(--c-cyan)]">
              <span className="blink">▸</span> 机甲询问 · 你想找什么？
            </div>
            <input
              autoFocus
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch(searchVal);
                if (e.key === "Escape") setSearchOpen(false);
              }}
              placeholder="输入关键词，回车我带你去…"
              className="h-10 w-full rounded-sm border border-[var(--c-cyan)] bg-transparent px-3 text-sm outline-none placeholder:text-[var(--c-dim)]"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-[var(--c-dim)]">回车确认 · Esc 取消</span>
              <button type="button" onClick={() => submitSearch(searchVal)} className="btn-mech h-8 px-3 text-xs">出发</button>
            </div>
          </div>
        </div>
      )}

      {/* 页面正中央桌宠提示（音乐未播放等） */}
      {centerHint && (
        <div
          key={centerHint.k}
          className="pet-center-hint fixed left-1/2 top-1/2 z-[9700] -translate-x-1/2 -translate-y-1/2"
          role="status"
        >
          <span className="pet-bubble-center">{centerHint.text}</span>
        </div>
      )}
    </>
  );
}
