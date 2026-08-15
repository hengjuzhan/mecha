import { useMemo, useRef, useState } from "react";
import { useStore, t, getSettings, setSettings, useSettings } from "../../lib/dataService";
import { dateSeed, mulberry } from "../../lib/utils";
import { Modal } from "../widgets/Modal";
import { GuestBook } from "../widgets/GuestBook";
import { guestbookStats } from "../../lib/guestbook";
import { consumeBgQuota, bgQuotaRemaining } from "../../lib/bgQuota";
import { detectBgTone, compressImage } from "../../lib/imageTone";
import { isAdminSession } from "../admin/AdminLogin";
import { toast } from "../widgets/Toast";
import type { LinkItem } from "../../data/types";



function SiteRow({ link, onOpen }: { link: LinkItem; onOpen?: () => void }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      onClick={onOpen}
      className="panel2 flex items-center gap-2.5 p-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--c-cyan)_10%,var(--c-panel2))]"
    >
      <span className="shrink-0 text-xl leading-none">{link.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{link.name}</span>
        <span className="block truncate text-[10px] text-[var(--c-dim)]">{link.desc}</span>
      </span>
      <span className="num shrink-0 text-[9px] tracking-widest text-[var(--c-cyan)]">{link.no}</span>
    </a>
  );
}

export function RightRail() {
  const { links } = useStore();
  useSettings(); // 背景设置（透明化/背景图/深浅）即时刷新，且不触发全站重渲染
  const [dailyOpen, setDailyOpen] = useState(false);
  const [randomOpen, setRandomOpen] = useState(false);
  const [rand, setRand] = useState<LinkItem | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const s = getSettings();
  const remaining = bgQuotaRemaining();
  const isAdmin = isAdminSession();

  // 上传/设置背景：先消耗配额（管理员不限），再检测深浅切换文字颜色
  const applyBg = async (src: string) => {
    if (!s.homeTransparent) { toast("请先开启「背景透明化」", "warn"); return; }
    setBgBusy(true);
    try {
      const q = await consumeBgQuota();
      if (!q.ok) { toast(`今日上传次数已用尽（每日共 10 次），明天再来吧`, "warn"); return; }
      const tone = await detectBgTone(src);
      setSettings({ bgImage: src, bgTone: tone });
      toast(isAdmin ? "背景已更新（管理员不限次数）" : `背景已更新，今日剩余 ${q.remaining} 次`, "ok");
    } finally {
      setBgBusy(false);
    }
  };
  const onFile = async (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) { toast("请选择图片文件", "warn"); return; }
    setBgBusy(true);
    try {
      const data = await compressImage(f); // 压缩后再上传，避免大图卡顿
      if (!data) { toast("图片处理失败，请换一张试试", "warn"); return; }
      await applyBg(data);
    } finally {
      setBgBusy(false);
    }
  };

  const pool = useMemo(() => links.filter((l) => !l.placeholder && l.url), [links]);
  const gb = guestbookStats();

  // 按日期种子随机 3 个站点，当天不变
  const daily = useMemo(() => {
    const rnd = mulberry(dateSeed());
    const arr = [...pool];
    const picks: LinkItem[] = [];
    while (picks.length < 3 && arr.length) {
      const i = Math.floor(rnd() * arr.length);
      picks.push(arr.splice(i, 1)[0]);
    }
    return picks;
  }, [pool]);

  const openRandom = () => {
    if (!pool.length) return;
    setRand(pool[Math.floor(Math.random() * pool.length)]);
    setRandomOpen(true);
  };

  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const summonPet = () => window.dispatchEvent(new CustomEvent("mecha:pet-summon"));

  const railBtn = (icon: string, label: string, fn: () => void) => (
    <button
      key={label}
      type="button"
      onClick={fn}
      className="group relative flex h-12 w-full items-center justify-center text-lg transition-colors hover:text-[var(--c-cyan)]"
      aria-label={label}
    >
      <span>{icon}</span>
      <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-[var(--c-border)] bg-[var(--c-panel)] px-2 py-1 text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </button>
  );

  return (
    <>
      {/* ===== 桌面右栏 56px ===== */}
      <nav
        className="glass sticky top-16 hidden h-[calc(100vh-4rem)] flex-col items-center border-l py-2 md:flex"
        style={{
          background: "color-mix(in srgb, var(--c-panel) 90%, transparent)",
          borderColor: "color-mix(in srgb, #ffffff 10%, var(--c-border))",
          boxShadow: "-8px 0 24px rgb(0 0 0 / 0.22)",
        }}
        aria-label="快捷操作"
      >
        {/* 醒目留言板入口 */}
        <div className="gb-entry group relative mb-1 flex w-full flex-col items-center py-2"
          style={{ borderBottom: "1px solid var(--c-border)" }}>
          <button
            type="button"
            onClick={() => setGuestOpen(true)}
            aria-label="访客留言板"
            className="gb-entry-btn relative flex h-11 w-11 items-center justify-center rounded-sm text-xl"
          >
            <span>💬</span>
            {gb.today > 0 && (
              <span className="num absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-[var(--c-magenta)] bg-[var(--c-panel)] px-0.5 text-[9px] text-[var(--c-magenta)]">
                {gb.today}
              </span>
            )}
          </button>
          <span className="num mt-1 text-[9px] tracking-[0.2em] text-[var(--c-magenta)]">留言板</span>
          <button
            type="button"
            onClick={() => { window.location.hash = "#/admin"; }}
            aria-label="进入管理员后台"
            title="管理员后台（口令 + 二次验证码双因子）"
            className="num mt-1 text-[12px] leading-none text-[var(--c-dim)] transition-colors hover:text-[var(--c-cyan)]"
          >⚙️<span className="block text-[8px] tracking-[0.15em]">管理员</span></button>
          <span className="pointer-events-none absolute right-full top-1/2 mr-2 w-40 -translate-y-1/2 whitespace-normal rounded-sm border border-[var(--c-magenta)] bg-[var(--c-panel)] p-2 text-[11px] leading-snug opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            💬 访客留言板：写下你的话，我会认真看哦～点我留言！
          </span>
        </div>
        {railBtn("🖼", "背景设置", () => setBgOpen(true))}
        {railBtn("📅", t("rail.daily"), () => setDailyOpen(true))}
        {railBtn("🎲", t("rail.random"), openRandom)}
        {railBtn("⬆", t("rail.top"), toTop)}
        {railBtn("🐾", "召唤桌宠", summonPet)}
      </nav>

      {/* ===== 移动端悬浮球 ===== */}
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label="快捷菜单"
        className="fixed bottom-20 right-3 z-[100] flex h-11 w-11 items-center justify-center rounded-full border border-[var(--c-cyan)] bg-[var(--c-panel)] text-lg shadow-[0_0_14px_color-mix(in_srgb,var(--c-cyan)_40%,transparent)] md:hidden"
      >
        🛰️
      </button>

      <Modal open={dailyOpen} onClose={() => setDailyOpen(false)} title={<span>📅 {t("rail.daily")} · {new Date().toLocaleDateString()}</span>} width={420}>
        <div className="flex flex-col gap-2">
          {daily.map((l) => <SiteRow key={l.id} link={l} onOpen={() => setDailyOpen(false)} />)}
        </div>
      </Modal>

      <Modal open={randomOpen} onClose={() => setRandomOpen(false)} title={<span>🎲 {t("rail.random")}</span>} width={420}>
        {rand && <SiteRow link={rand} />}
        <button type="button" className="btn-mech mt-3 h-9 w-full text-sm" onClick={openRandom}>⟳ 再摇一个</button>
      </Modal>

      {/* 访客留言板（醒目入口弹窗） */}
      <Modal open={guestOpen} onClose={() => setGuestOpen(false)} title={<span>💬 访客留言板 · GUESTBOOK</span>} width={520}>
        <p className="mb-2.5 border-l-2 border-[var(--c-magenta)] pl-2 text-[11px] leading-relaxed text-[var(--c-dim)]">
          所有访客可在这里自由对话——发起新话题或回复别人，畅所欲言。留言每 30 天自动清空一次。
        </p>
        <div className="h-[52vh] min-h-[300px]">
          <GuestBook />
        </div>
      </Modal>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={<span>🛰 快捷菜单</span>} width={320}>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-mech mag h-10 text-xs" onClick={() => { setMenuOpen(false); setGuestOpen(true); }}>💬 留言板</button>
          <button type="button" className="btn-mech h-10 text-xs" onClick={() => { setMenuOpen(false); setBgOpen(true); }}>🖼 背景</button>
          <button type="button" className="btn-mech h-10 text-xs" onClick={() => { setMenuOpen(false); setDailyOpen(true); }}>📅 每日推荐</button>
          <button type="button" className="btn-mech h-10 text-xs" onClick={() => { setMenuOpen(false); openRandom(); }}>🎲 随机站点</button>
          <button type="button" className="btn-mech h-10 text-xs" onClick={() => { setMenuOpen(false); toTop(); }}>⬆ 回顶部</button>
          <button type="button" className="btn-mech h-10 text-xs" onClick={() => { setMenuOpen(false); summonPet(); }}>🐾 召唤桌宠</button>
        </div>
      </Modal>

      {/* 背景设置（访客可用，需先开启透明化；每日共享 10 次，管理员不限） */}
      <Modal open={bgOpen} onClose={() => setBgOpen(false)} title={<span>🖼 背景设置 · BACKGROUND</span>} width={420}>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-pressed={s.homeTransparent}
            onClick={() => setSettings({ homeTransparent: !s.homeTransparent })}
            className={`flex items-center justify-between rounded-sm border px-3 py-2 text-sm transition-colors ${
              s.homeTransparent
                ? "border-[var(--c-cyan)] bg-[color-mix(in_srgb,var(--c-cyan)_10%,transparent)] text-[var(--c-cyan)]"
                : "border-[var(--c-border)] text-[var(--c-dim)]"
            }`}
          >
            <span>开启背景透明化</span>
            <span className="num text-[10px] tracking-widest">{s.homeTransparent ? "ON" : "OFF"}</span>
          </button>

          <div className={`flex flex-col gap-2 rounded-sm border border-[var(--c-border)] p-2.5 ${s.homeTransparent ? "" : "pointer-events-none opacity-40"}`}>
            <p className="mb-1 text-[10px] text-[var(--c-dim)]">{s.homeTransparent ? "已开启，可上传背景图（模块保持半透明，自动识别深浅调整文字颜色）" : "请先点击上方「开启背景透明化」后再上传背景图"}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" disabled={bgBusy} className="btn-mech h-8 px-3 text-xs disabled:opacity-50" onClick={() => bgFileRef.current?.click()}>{bgBusy ? "⋯ 处理中" : "⬆ 上传背景图"}</button>
              <input type="text" className="h-8 min-w-0 flex-1 rounded-sm border border-[var(--c-border)] bg-[color-mix(in_srgb,var(--c-bg)_55%,var(--c-panel2))] px-2 text-xs" placeholder="或粘贴图片 URL（https://…）"
                defaultValue={/^https?:\/\//.test(s.bgImage) ? s.bgImage : ""}
                onKeyDown={(e) => { if (e.key === "Enter" && !bgBusy) { const v = (e.target as HTMLInputElement).value.trim(); if (v) void applyBg(v); } }} />
              {s.bgImage && <button type="button" className="btn-mech mag h-8 px-3 text-xs" onClick={() => setSettings({ bgImage: "", bgTone: "dark" })}>✕ 清除</button>}
            </div>
            <input ref={bgFileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            {s.bgImage && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--c-dim)]">当前背景 · 已识别为：</span>
                <span className={`num text-[10px] ${s.bgTone === "light" ? "text-[var(--c-orange)]" : "text-[var(--c-cyan)]"}`}>{s.bgTone === "light" ? "浅色（文字已转深色）" : "深色（文字保持浅色）"}</span>
                <img src={s.bgImage} alt="背景预览" className="ml-auto h-10 w-20 rounded-sm border border-[var(--c-border)] object-cover" />
              </div>
            )}
          </div>

          <p className="num border-l-2 border-[var(--c-orange)] pl-2 text-[11px] text-[var(--c-dim)]">
            {isAdmin ? "管理员身份：上传次数无限制" : `今日全部访客剩余可上传：${remaining === Infinity ? "不限" : `${remaining} / 10`} 次（次日重置）`}
          </p>
        </div>
      </Modal>
    </>
  );
}
