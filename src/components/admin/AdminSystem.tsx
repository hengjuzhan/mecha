import { useEffect, useRef, useState } from "react";
import {
  getSettings, setSettings, setMusicSources, useSettings, useStore, exportJSON, importJSON, resetOverlay,
} from "../../lib/dataService";
import { downloadJSON } from "../../lib/utils";
import { cloud } from "../../lib/cloud";
import { music } from "../../lib/audio";
import type { Settings } from "../../data/types";
import { setupAdmin, verifyAdmin, getAdminHash } from "./AdminLogin";
import { toast } from "../widgets/Toast";
import { Corners } from "../widgets/Modal";
import { RangeInput } from "../ui/RangeInput";
import { clearGuestbook, getGuestbook, isGuestbookBackend } from "../../lib/guestbook";

const inp = "h-8 w-full min-w-0 rounded-sm border border-[var(--c-border)] bg-[color-mix(in_srgb,var(--c-bg)_55%,var(--c-panel2))] px-2 text-xs";

/** 防抖内联输入：本地受控即时反馈，失焦或 600ms 静默后一次性提交 */
function DebouncedInput({ value, onCommit, className, placeholder, ariaLabel }: {
  value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; ariaLabel?: string;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef(0);
  const focusRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== focusRef.current) setLocal(value);
  }, [value]);
  return (
    <input
      ref={focusRef}
      className={className ?? inp}
      value={local}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        setLocal(e.target.value);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => onCommit(e.target.value), 600);
      }}
      onBlur={(e) => { window.clearTimeout(timer.current); onCommit(e.target.value); }}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel relative p-4" style={{ background: "var(--c-panel)" }}>
      <Corners />
      <h2 className="num mb-3 text-sm font-bold tracking-[0.25em] neon-text">{title}</h2>
      {children}
    </section>
  );
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-[var(--c-dim)]">{label}</span>
      <RangeInput min={min} max={max} step={step} value={value} className="w-44" ariaLabel={label} onChange={onChange} />
    </div>
  );
}

/* ============ 音乐源顺序 ============ */
export function MusicSection() {
  const { musicSources } = useStore();
  const up = (id: string, patch: Partial<(typeof musicSources)[number]>) => {
    const next = musicSources.map((m) => (m.id === id ? { ...m, ...patch } : m));
    setMusicSources(next);
    music.setSources(next);
  };
  const move = (i: number, d: number) => {
    const next = [...musicSources];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setMusicSources(next);
    music.setSources(next);
  };
  return (
    <Section title="▣ 音乐源顺序与配置（访客不可见）">
      <div className="flex flex-col gap-2">
        {musicSources.map((m, i) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-sm border border-[var(--c-border)] p-2">
            <span className="num w-8 shrink-0 text-center text-sm text-[var(--c-cyan)]">{i + 1}</span>
            <button type="button" className={`h-7 shrink-0 px-2 text-[10px] ${m.enabled ? "bg-[var(--c-cyan)] text-black" : "border border-[var(--c-border)] text-[var(--c-dim)]"}`}
              onClick={() => up(m.id, { enabled: !m.enabled })}>
              {m.enabled ? "启用" : "停用"}
            </button>
            <DebouncedInput className={`${inp} flex-1 basis-44`} value={m.name} onCommit={(v) => up(m.id, { name: v })} ariaLabel="名称" />
            <DebouncedInput className={`${inp} flex-1 basis-64`} value={m.baseUrl} placeholder="接口地址（留空则跳过）"
              onCommit={(v) => up(m.id, { baseUrl: v })} ariaLabel="地址" />
            <div className="flex shrink-0 gap-1">
              <button type="button" className="btn-mech h-7 w-7 text-xs" onClick={() => move(i, -1)} aria-label="上移">↑</button>
              <button type="button" className="btn-mech h-7 w-7 text-xs" onClick={() => move(i, 1)} aria-label="下移">↓</button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ============ 外观参数 ============ */
const THEMES = [
  { id: "dark", label: "深色" },
  { id: "light", label: "浅色" },
  { id: "auto", label: "跟随系统" },
];
const ACCENTS: { id: string; label: string; color: string }[] = [
  { id: "cyan", label: "冰蓝", color: "#00e5ff" },
  { id: "emerald", label: "翡翠", color: "#2dd4bf" },
  { id: "violet", label: "紫罗兰", color: "#a78bfa" },
  { id: "blue", label: "晴蓝", color: "#38bdf8" },
  { id: "green", label: "翠绿", color: "#34d399" },
  { id: "amber", label: "琥珀", color: "#fbbf24" },
  { id: "rose", label: "玫红", color: "#fb7185" },
];
const FONTS: { id: string; label: string }[] = [
  { id: "system", label: "系统默认" },
  { id: "yahei", label: "微软雅黑" },
  { id: "pingfang", label: "苹方" },
  { id: "siyuan-hei", label: "思源黑体" },
  { id: "simsun", label: "宋体" },
  { id: "simhei", label: "黑体" },
  { id: "kaiti", label: "楷体" },
  { id: "fangsong", label: "仿宋" },
  { id: "siyuan-song", label: "思源宋体" },
  { id: "puhuiti", label: "阿里巴巴普惠体" },
];
const BLENDS: { id: Settings["blendMode"]; label: string }[] = [
  { id: "normal", label: "正常" },
  { id: "screen", label: "滤色" },
  { id: "overlay", label: "叠加" },
  { id: "soft-light", label: "柔光" },
  { id: "multiply", label: "正片叠底" },
];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="num mb-1.5 text-[10px] tracking-[0.3em] text-[var(--c-magenta)]">{title}</div>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className={`flex items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-xs transition-colors ${
        value ? "border-[var(--c-cyan)] bg-[color-mix(in_srgb,var(--c-cyan)_10%,transparent)] text-[var(--c-cyan)]"
              : "border-[var(--c-border)] text-[var(--c-dim)]"
      }`}
    >
      <span>{label}</span>
      <span className={`num text-[9px] tracking-widest ${value ? "" : "opacity-50"}`}>{value ? "ON" : "OFF"}</span>
    </button>
  );
}

function Choice({ id, label, color, current, onPick }: {
  id: string; label: string; color?: string; current: string; onPick: (id: string) => void;
}) {
  const active = current === id;
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      className={`flex items-center gap-1.5 rounded-sm border px-2 py-1.5 text-xs transition-colors ${
        active ? "border-[var(--c-cyan)] bg-[color-mix(in_srgb,var(--c-cyan)_10%,transparent)] text-[var(--c-cyan)]"
               : "border-[var(--c-border)] text-[var(--c-dim)] hover:border-[var(--c-cyan)]"
      }`}
    >
      {color && <span className="h-3 w-3 rounded-sm" style={{ background: color }} aria-hidden />}
      <span>{label}</span>
    </button>
  );
}

export function AppearanceSection() {
  useSettings();
  const s = getSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const r = () => { try { localStorage.clear(); } catch { /* ignore */ } window.location.reload(); };
  const onFile = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) { toast("请选择图片文件", "warn"); return; }
    const reader = new FileReader();
    reader.onload = () => { setSettings({ bgImage: String(reader.result) }); toast("已设为主页背景图", "ok"); };
    reader.readAsDataURL(f);
  };
  return (
    <Section title="▣ 外观与交互参数 APPEARANCE">
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Group title="THEME 明暗主题">
            <div className="flex flex-wrap gap-1.5">
              {THEMES.map((t) => <Choice key={t.id} id={t.id} label={t.label} current={s.theme} onPick={(id) => setSettings({ theme: id as typeof s.theme })} />)}
            </div>
          </Group>
          <Group title="ACCENT 主色配色">
            <div className="flex flex-wrap gap-1.5">
              {ACCENTS.map((a) => <Choice key={a.id} id={a.id} label={a.label} color={a.color} current={s.accent} onPick={(id) => setSettings({ accent: id })} />)}
            </div>
          </Group>
          <Group title="FONT 字体">
            <select className={inp} value={s.font} onChange={(e) => setSettings({ font: e.target.value })}>
              {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Group>
          <Group title="BLEND 背景混合模式">
            <div className="flex flex-wrap gap-1.5">
              {BLENDS.map((b) => <Choice key={b.id} id={b.id} label={b.label} current={s.blendMode} onPick={(id) => setSettings({ blendMode: id as typeof s.blendMode })} />)}
            </div>
          </Group>
          <Group title="BACKGROUND 主页背景">
            <Toggle label="主页透明（露出背景图）" value={s.homeTransparent} onChange={(v) => setSettings({ homeTransparent: v })} />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <button type="button" className="btn-mech h-8 px-3 text-xs" onClick={() => fileRef.current?.click()}>⬆ 上传背景图</button>
              {s.bgImage && <button type="button" className="btn-mech mag h-8 px-3 text-xs" onClick={async () => {
                setSettings({ bgImage: "", bgTone: "dark" });
                const ok = await cloud.bg.clear(getAdminHash());
                toast(ok ? "已清除所有设备共享背景" : "本地已清除，云端同步失败", ok ? "ok" : "warn");
              }}>✕ 清除背景</button>}
            </div>
            <DebouncedInput className={`${inp} mt-1.5`} placeholder="或粘贴图片 URL（https://…）"
              value={/^https?:\/\//.test(s.bgImage) ? s.bgImage : ""}
              onCommit={(v) => setSettings({ bgImage: v })} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            {s.bgImage && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] text-[var(--c-dim)]">当前背景：</span>
                <img src={s.bgImage} alt="背景预览" className="h-10 w-24 rounded-sm border border-[var(--c-border)] object-cover" />
              </div>
            )}
          </Group>
        </div>

        <div className="flex flex-col gap-4">
          <Group title="ANIM 动画开关">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <Toggle label="随机机甲渐变配色" value={s.colorShift} onChange={(v) => setSettings({ colorShift: v })} />
              <Toggle label="霓虹呼吸 / 闪烁" value={s.animNeon} onChange={(v) => setSettings({ animNeon: v })} />
              <Toggle label="玻璃闪光" value={s.animShine} onChange={(v) => setSettings({ animShine: v })} />
            </div>
          </Group>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Group title="NEON 霓虹">
                <Slider label={`亮度 ${s.neonBright.toFixed(1)}×`} value={s.neonBright} min={0.3} max={1.6} step={0.05} onChange={(v) => setSettings({ neonBright: v })} />
                <Slider label={`闪烁频率 ${s.neonSpeed.toFixed(1)}s`} value={s.neonSpeed} min={0.4} max={3} step={0.1} onChange={(v) => setSettings({ neonSpeed: v })} />
              </Group>
              <Group title="GLOW 辉光">
                <Slider label={`辉光 ${s.glow.toFixed(1)}×`} value={s.glow} min={0} max={1.5} step={0.1} onChange={(v) => setSettings({ glow: v })} />
              </Group>
            </div>
            <div className="flex flex-col gap-1">
              <Group title="AUDIO 音频">
                <Slider label={`音效音量 ${Math.round(s.soundVol * 100)}%`} value={s.soundVol} min={0} max={1} step={0.05} onChange={(v) => setSettings({ soundVol: v })} />
                <Slider label={`音乐音量 ${Math.round(s.musicVol * 100)}%`} value={s.musicVol} min={0} max={1} step={0.05} onChange={(v) => setSettings({ musicVol: v })} />
              </Group>
              <Group title="RESET 重置">
                <button type="button" className="btn-mech mag mt-1 h-8 w-full text-xs" onClick={r}>⟲ 重置布局（清空本地数据）</button>
              </Group>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ============ 数据备份 ============ */
export function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Section title="▣ JSON 备份导出 / 导入 BACKUP">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-mech h-9 px-4 text-xs"
          onClick={() => { downloadJSON(`mechanav-export-${new Date().toISOString().slice(0, 10)}.json`, exportJSON()); toast("已导出 JSON", "ok"); }}>
          ⬇ 导出 JSON
        </button>
        <button type="button" className="btn-mech h-9 px-4 text-xs" onClick={() => fileRef.current?.click()}>⬆ 导入 JSON</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const obj = JSON.parse(String(reader.result)) as Record<string, unknown>;
                if (importJSON(obj)) toast("导入成功", "ok");
                else toast("JSON 格式无效", "warn");
              } catch { toast("文件解析失败", "warn"); }
            };
            reader.readAsText(f);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn-mech mag h-9 px-4 text-xs"
          onClick={() => { resetOverlay(); toast("已恢复默认数据", "ok"); }}>
          ⟲ 恢复默认
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[var(--c-dim)]">静态部署时所有修改写入 localStorage 覆盖层。</p>
    </Section>
  );
}

/* ============ 系统：修改访问口令 / 数据库连接 ============ */
export function SystemSection() {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const s = getSettings();
  const [dbUrl, setDbUrl] = useState(s.supabase?.url ?? "");
  const [dbKey, setDbKey] = useState(s.supabase?.key ?? "");
  const [testing, setTesting] = useState(false);

  const clearAllGuestbook = async () => {
    const n = getGuestbook().length;
    if (!window.confirm(n > 0 ? `确定清空全部 ${n} 条留言吗？此操作不可恢复。` : "留言板已经是空的，确定要清空吗？")) return;
    const ok = await clearGuestbook();
    toast(ok ? "已清空全部留言" : "清空失败，请重试", ok ? "ok" : "warn");
  };

  const clearVisits = async () => {
    if (!window.confirm("确定清空全部访问人数吗？今日与累计访问计数将归零，此操作不可恢复。")) return;
    const ok = await cloud.visits.reset(getAdminHash());
    toast(ok ? "已清空访问人数" : "本地已清空，但云端同步失败，请重试", ok ? "ok" : "warn");
  };

  const clearSharedBg = async () => {
    if (!window.confirm("确定清除所有设备共享的自定义背景吗？包括云端记录，此操作不可恢复。")) return;
    setSettings({ bgImage: "", bgTone: "dark" });
    const ok = await cloud.bg.clear(getAdminHash());
    // 令牌不一致是清除失败的主因：多设备设过不同口令或本地重置过数据会导致云端令牌漂移，
    // 需在数据库执行 delete from settings where key='admin' 后重新登录即可自动重新绑定
    toast(ok ? "已清除共享背景" : "本地已清除，但云端同步失败：管理员令牌与云端不一致，请在系统页查看恢复方法", ok ? "ok" : "warn");
  };

  const changePw = async () => {
    if (newPw.length < 6) { toast("新口令至少 6 位", "warn"); return; }
    if (newPw !== newPw2) { toast("两次口令不一致", "warn"); return; }
    if ((await verifyAdmin(oldPw)) !== "ok") { toast("原口令错误", "warn"); return; }
    const oldHash = getAdminHash();
    await setupAdmin(newPw);
    const newHash = getAdminHash();
    // 同步新令牌到数据库
    if (cloud.configured() && newHash) {
      void cloud.initToken(newHash, oldHash).then((ok) => {
        if (ok) toast("口令已更新（SHA-256 存储）", "ok");
        else toast("口令已更新，但云端同步失败", "warn");
      });
    } else {
      toast("口令已更新（SHA-256 存储）", "ok");
    }
    setOldPw(""); setNewPw(""); setNewPw2("");
  };

  const saveDb = () => {
    const url = dbUrl.trim().replace(/\/+$/, "");
    const key = dbKey.trim();
    if (!url || !key) { setSettings({ supabase: null }); toast("已断开数据库连接", "ok"); return; }
    if (!/^https?:\/\//i.test(url)) { toast("URL 需以 http(s):// 开头", "warn"); return; }
    setSettings({ supabase: { url, key } });
    window.dispatchEvent(new CustomEvent("mecha:guestbook-backend", { detail: { on: true } }));
    // 同步管理员令牌到数据库，确保云端 RPC（bg_clear / visits_reset / site_data_set 等）能通过令牌校验
    const token = getAdminHash();
    if (token) {
      void cloud.initToken(token).then((ok) => {
        if (ok) console.log("[mecha] admin token synced to database");
      });
    }
    toast("数据库连接已保存", "ok");
  };

  const testDb = async () => {
    const url = dbUrl.trim().replace(/\/+$/, "");
    const key = dbKey.trim();
    if (!url || !key) { toast("请先填写 URL 与 Key", "warn"); return; }
    setTesting(true);
    try {
      const res = await fetch(`${url}/rest/v1/rpc/visits_get`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.ok) {
        const d = await res.json() as { today?: number; total?: number }[];
        toast(`连接正常 · 今日 ${d?.[0]?.today ?? "?"} / 累计 ${d?.[0]?.total ?? "?"}`, "ok");
      } else if (res.status === 404) {
        toast("数据库未初始化（请先执行 schema.sql）", "warn");
      } else {
        toast(`连接失败（HTTP ${res.status}）`, "warn");
      }
    } catch {
      toast("无法连接数据库", "warn");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Section title="▣ 系统 SYSTEM">
      <div className="rounded-sm border border-[var(--c-border)] p-3">
        <h3 className="num mb-2 text-xs tracking-[0.25em] text-[var(--c-orange)]">数据库连接</h3>
        <div className="flex flex-col gap-2">
          <input className={inp} placeholder="Supabase 项目 URL（https://xxx.supabase.co）" value={dbUrl} onChange={(e) => setDbUrl(e.target.value)} />
          <input className={inp} placeholder="Publishable / anon Key" value={dbKey} onChange={(e) => setDbKey(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn-mech h-8 flex-1 text-xs" onClick={saveDb}>保存连接</button>
            <button type="button" className="btn-mech mag h-8 flex-1 text-xs" onClick={() => void testDb()} disabled={testing}>
              {testing ? "测试中…" : "测试连接"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--c-dim)]">
          用于访问计数与背景上传配额。需先在 Supabase SQL Editor 执行 schema.sql 初始化数据库；匿名可调用 RPC。
        </p>
      </div>

      <div className="mt-3 rounded-sm border border-[var(--c-border)] p-3">
        <h3 className="num mb-2 text-xs tracking-[0.25em] text-[var(--c-orange)]">留言板管理</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-mech mag h-8 px-3 text-xs" onClick={clearAllGuestbook}>🗑 清空全部留言</button>
          <span className="text-[10px] text-[var(--c-dim)]">
            当前共 {getGuestbook().length} 条留言 · {isGuestbookBackend() ? "数据库模式（清空即时生效）" : "本地模式"}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-sm border border-[var(--c-border)] p-3">
        <h3 className="num mb-2 text-xs tracking-[0.25em] text-[var(--c-orange)]">访问人数管理</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-mech mag h-8 px-3 text-xs" onClick={() => void clearVisits()}>🗑 清空访问人数</button>
          <span className="text-[10px] text-[var(--c-dim)]">
            今日与累计计数归零{cloud.configured() ? " · 云端记录同步清空" : " · 本地模式"}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-sm border border-[var(--c-border)] p-3">
        <h3 className="num mb-2 text-xs tracking-[0.25em] text-[var(--c-orange)]">背景管理</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-mech mag h-8 px-3 text-xs" onClick={() => void clearSharedBg()}>🗑 清除共享背景</button>
          <span className="text-[10px] text-[var(--c-dim)]">
            清除所有设备共享的自定义背景{cloud.configured() ? " · 云端记录同步清空" : " · 本地模式"}
          </span>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--c-dim)]">
          令牌恢复：若云端操作持续提示「管理员令牌与云端不一致」（多设备设过不同口令或本地重置过数据所致），
          在 Supabase SQL Editor 执行 <code className="text-[var(--c-cyan)]">delete from settings where key='admin';</code>
          再重新执行清除，即可自动重新绑定本机令牌。
        </p>
      </div>

      <div className="mt-3 rounded-sm border border-[var(--c-border)] p-3">
        <h3 className="num mb-2 text-xs tracking-[0.25em] text-[var(--c-orange)]">修改访问口令</h3>
        <div className="flex flex-col gap-2">
          <input type="password" className={inp} placeholder="原口令" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input type="password" className={inp} placeholder="新口令（≥6位）" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            <input type="password" className={inp} placeholder="确认新口令" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
          </div>
          <button type="button" className="btn-mech h-8 text-xs" onClick={() => void changePw()}>更新口令</button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--c-dim)]">
          访问口令以 SHA-256 哈希存储。连续失败 5 次将触发指数锁定。
        </p>
      </div>
    </Section>
  );
}