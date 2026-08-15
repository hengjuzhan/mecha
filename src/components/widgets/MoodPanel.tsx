import { useCallback, useEffect, useRef, useState } from "react";
import { t, useTexts } from "../../lib/dataService";
import { QUOTES } from "../../data/texts";
import { fetcht } from "../../lib/utils";

const HITOKOTO_TYPES: Record<string, string> = {
  a: "动画", b: "漫画", c: "游戏", d: "文学", e: "原创", f: "网络", g: "其他",
  h: "影视", i: "诗词", j: "网易云", k: "哲学", l: "抖机灵",
};

export function MoodPanel() {
  useTexts(); // 文案变化（管理员改字）时重渲染，保证 t() 实时同步
  const [quote, setQuote] = useState<{ text: string; from: string; tag: string } | null>(null);
  const [img, setImg] = useState("");
  const [imgFail, setImgFail] = useState(false);
  const lastFetch = useRef(0);
  const [rev, setRev] = useState(0);
  const imgSrc = useRef(0); // 当前生效的图片来源下标
  const imgAtt = useRef(0); // 连续失败次数（同一来源解析/加载失败时递增）

  const pickLocal = useCallback(() => {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    setQuote({ text: q, from: "本地语料", tag: "兜底" });
  }, []);

  const fetchQuote = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetch.current < 3000) { pickLocal(); return; } // ≤1次/3s
    lastFetch.current = now;
    try {
      const types = Object.keys(HITOKOTO_TYPES);
      const tp = types[Math.floor(Math.random() * types.length)];
      const d = await fetcht<{ hitokoto?: string; from?: string }>(`https://v1.hitokoto.cn/?c=${tp}&encode=json`, 5000);
      if (d?.hitokoto) setQuote({ text: d.hitokoto, from: d.from || "一言", tag: HITOKOTO_TYPES[tp] });
      else pickLocal();
    } catch {
      try {
        const d = await fetcht<{ data?: { content?: string; source?: string } }>("https://v1.alapi.cn/api/yiyan?format=json", 5000);
        if (d?.data?.content) setQuote({ text: d.data.content, from: d.data.source || "ALAPI", tag: "备份源" });
        else pickLocal();
      } catch { pickLocal(); }
    }
  }, [pickLocal]);

  const fetchImg = useCallback(async () => {
    setImgFail(false);
    setImg("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sources: (() => Promise<string | null>)[] = [
      // ① Bing 每日一图（微软官方风景壁纸，国内可直连）
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = await fetcht<{ images?: { url?: string }[] }>(`https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN`, 8000);
        const list = d?.images ?? [];
        if (!list.length) return null;
        const it = list[Math.floor(Math.random() * list.length)];
        return it.url ? `https://cn.bing.com${it.url}` : null;
      },
      // ② picsum 随机摄影（按 seed 保证每次不同，直出图片）
      async () => `https://picsum.photos/seed/mood${Math.floor(Math.random() * 1e6)}/1200/800`,
      // ③ picsum 随机兜底（无 seed，最大限度保证出图）
      async () => `https://picsum.photos/1200/800?r=${Math.random()}`,
    ];
    for (let i = 0; i < sources.length; i++) {
      const idx = (imgSrc.current + i) % sources.length;
      try {
        const url = await sources[idx]();
        if (!url) continue;
        imgSrc.current = idx;
        imgAtt.current = 0;
        setImg(url);
        return;
      } catch { /* 尝试下一来源 */ }
    }
    setImgFail(true);
  }, []);

  /** 统一一键切换：同时刷新一言和风景图 */
  const refresh = useCallback(() => {
    imgSrc.current = 0;
    imgAtt.current = 0;
    setRev((r) => r + 1);
    void fetchQuote();
    void fetchImg();
  }, [fetchQuote, fetchImg]);

  useEffect(() => {
    void fetchQuote();
    void fetchImg();
  }, [fetchQuote, fetchImg]);

  useEffect(() => {
    const t = window.setInterval(() => { void fetchQuote(); void fetchImg(); setRev((r) => r + 1); }, 30000); // 每 30 秒自动切换
    return () => window.clearInterval(t);
  }, [fetchQuote, fetchImg]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 一言 + 风景图 统一区域 */}
      <div className="flex min-h-0 flex-1 flex-col justify-center px-1">
        <div className="flex items-center justify-between">
          <span className="num text-[9px] tracking-[0.3em] text-[var(--c-cyan)]">◆ {t("board.mood.quote")}</span>
          <button type="button" className="btn-mech h-6 px-2 text-[10px]" onClick={refresh} aria-label="切换">⟳ 切换</button>
        </div>
        <p key={`q${rev}`} className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed">
          {quote ? `「${quote.text}」` : "…"}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--c-dim)]">
          {quote && <span className="num border border-[var(--c-border)] px-1 text-[9px] tracking-widest">{quote.tag}</span>}
          <span className="truncate">{quote ? `—— ${quote.from}` : ""}</span>
        </div>
      </div>
      {/* 风景图（无标签、无横线） */}
      <div className="mt-1 flex min-h-0 flex-[1.3] flex-col">
        <div className="mt-1.5 min-h-0 flex-1 overflow-hidden">
          {!img ? (
            <div className="flex h-full items-center justify-center text-center text-xs leading-relaxed text-[var(--c-dim)]">
              {t("board.mood.loading")}
            </div>
          ) : imgFail ? (
            <div className="flex h-full items-center justify-center text-center text-xs leading-relaxed text-[var(--c-dim)]">
              {t("board.mood.fallback")}
            </div>
          ) : (
            <img
              key={img}
              src={img}
              alt="风景图"
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => {
                imgAtt.current += 1;
                if (imgAtt.current >= 3) { setImgFail(true); return; }
                imgSrc.current = (imgSrc.current + 1) % 3;
                void fetchImg();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
