import { Modal } from "./Modal";
import { getSettings, setSettings, useSettings } from "../../lib/dataService";
import { toast } from "./Toast";
import { clamp } from "../../lib/utils";
import { RangeInput } from "../ui/RangeInput";

const FONTS: { id: string; label: string }[] = [
  { id: "system", label: "系统默认（微软雅黑）" },
  { id: "yahei", label: "微软雅黑 Microsoft YaHei" },
  { id: "pingfang", label: "苹方 PingFang SC" },
  { id: "siyuan-hei", label: "思源黑体/Noto Sans SC" },
  { id: "simsun", label: "宋体 SimSun" },
  { id: "simhei", label: "黑体 SimHei" },
  { id: "kaiti", label: "楷体 KaiTi" },
  { id: "fangsong", label: "仿宋 FangSong" },
  { id: "siyuan-song", label: "思源宋体/Noto Serif SC" },
  { id: "puhuiti", label: "阿里巴巴普惠体 Alibaba PuHuiTi" },
];

const ACCENTS: { id: string; name: string; color: string }[] = [
  { id: "cyan", name: "青蓝", color: "#00e5ff" },
  { id: "emerald", name: "翡翠", color: "#2dd4bf" },
  { id: "violet", name: "紫罗兰", color: "#a78bfa" },
  { id: "blue", name: "天蓝", color: "#38bdf8" },
  { id: "green", name: "翠绿", color: "#34d399" },
  { id: "amber", name: "琥珀", color: "#fbbf24" },
  { id: "rose", name: "玫红", color: "#fb7185" },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs whitespace-nowrap text-[var(--c-dim)]">{label}</span>
      <div className="flex min-w-0 items-center justify-end gap-2">{children}</div>
    </div>
  );
}

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useSettings(); // 订阅设置变化，滑块/开关即时刷新，且不触发全站重渲染
  const s = getSettings();
  return (
    <Modal open={open} onClose={onClose} title={<span>⚙ 系统设置</span>} width={440}>
      <div className="flex flex-col divide-y divide-[var(--c-border)]">
        <div className="pb-1">
          <div className="num mb-1 text-[10px] tracking-[0.3em] text-[var(--c-magenta)]">THEME 主题</div>
          <Row label="配色方案">
            <div className="flex gap-1">
              {(["dark", "light", "auto"] as const).map((th) => (
                <button
                  key={th}
                  type="button"
                  className={`btn-mech h-7 px-2.5 text-xs ${s.theme === th ? "!bg-[var(--c-cyan)] !text-[#04121a]" : ""}`}
                  onClick={() => setSettings({ theme: th })}
                >
                  {th === "dark" ? "暗夜" : th === "light" ? "白昼" : "跟随系统"}
                </button>
              ))}
            </div>
          </Row>
          <Row label="主题颜色">
            <div className="flex flex-wrap gap-1.5">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  title={a.name}
                  aria-label={`主题颜色 ${a.name}`}
                  className={`h-6 w-6 rounded-full border transition-transform ${
                    s.accent === a.id ? "scale-110 border-white" : "border-transparent hover:scale-105"
                  }`}
                  style={{ background: a.color, boxShadow: s.accent === a.id ? `0 0 8px ${a.color}` : "none" }}
                  onClick={() => setSettings({ accent: a.id })}
                />
              ))}
            </div>
          </Row>
          <Row label="全站字体">
            <select
              value={s.font}
              onChange={(e) => setSettings({ font: e.target.value })}
              className="h-7 max-w-[210px] rounded-sm border border-[var(--c-border)] bg-[var(--c-panel2)] px-1 text-xs text-[var(--c-text)]"
            >
              {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Row>
        </div>
        <div className="py-1.5">
          <div className="num mb-1 text-[10px] tracking-[0.3em] text-[var(--c-magenta)]">AUDIO 音频</div>
          <Row label={`音效音量 ${Math.round(s.soundVol * 100)}%`}>
            <RangeInput min={0} max={1} step={0.05} value={s.soundVol} className="w-32" ariaLabel="音效音量"
              onChange={(v) => setSettings({ soundVol: v })} />
          </Row>
          <Row label={`音乐音量 ${Math.round(s.musicVol * 100)}%`}>
            <RangeInput min={0} max={1} step={0.05} value={s.musicVol} className="w-32" ariaLabel="音乐音量"
              onChange={(v) => setSettings({ musicVol: v })} />
          </Row>
        </div>
        <div className="py-1.5">
          <div className="num mb-1 text-[10px] tracking-[0.3em] text-[var(--c-magenta)]">NEON 霓虹灯管</div>
          <Row label={`亮度 ${s.neonBright.toFixed(1)}×`}>
            <RangeInput min={0.3} max={1.6} step={0.05} value={s.neonBright} className="w-32" ariaLabel="霓虹亮度"
              onChange={(v) => setSettings({ neonBright: v })} />
          </Row>
          <Row label={`闪烁频率 ${s.neonSpeed.toFixed(1)}s`}>
            <RangeInput min={0.4} max={3} step={0.1} value={s.neonSpeed} className="w-32" ariaLabel="霓虹频率"
              onChange={(v) => setSettings({ neonSpeed: v })} />
          </Row>
        </div>
        <div className="py-1.5">
          <div className="num mb-1 text-[10px] tracking-[0.3em] text-[var(--c-magenta)]">JITTER 文字跳动</div>
          <Row label={`幅度 ${s.jumpAmp}px`}>
            <RangeInput min={0} max={8} step={1} value={s.jumpAmp} className="w-32" ariaLabel="跳动幅度"
              onChange={(v) => setSettings({ jumpAmp: v })} />
          </Row>
          <Row label={`节奏 ${s.jumpSpeed.toFixed(2)}s`}>
            <RangeInput min={0.08} max={0.6} step={0.02} value={s.jumpSpeed} className="w-32" ariaLabel="跳动节奏"
              onChange={(v) => setSettings({ jumpSpeed: v })} />
          </Row>
          <Row label={`辉光强度 ${clamp(s.glow, 0, 1.5).toFixed(1)}×`}>
            <RangeInput min={0} max={1.5} step={0.1} value={s.glow} className="w-32" ariaLabel="辉光强度"
              onChange={(v) => setSettings({ glow: v })} />
          </Row>
        </div>
        <div className="pt-2.5">
          <button
            type="button"
            className="btn-mech mag h-8 w-full text-xs"
            onClick={() => {
              try { localStorage.clear(); } catch { /* ignore */ }
              toast("布局与本地数据已重置", "ok");
              window.setTimeout(() => window.location.reload(), 600);
            }}
          >
            ⟲ 重置布局与本地数据
          </button>
        </div>
      </div>
    </Modal>
  );
}
