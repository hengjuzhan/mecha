import { memo, useEffect, useMemo, useRef, useState } from "react";
import { setCategories, setLinks, setAnnouncements, setPromos, useStore, nextAnnNo, newLink } from "../../lib/dataService";
import type { Announcement, Category, LinkItem, Promo } from "../../data/types";
import { uid } from "../../lib/utils";
import { toast } from "../widgets/Toast";
import { Corners } from "../widgets/Modal";

const inp = "h-8 w-full min-w-0 rounded-sm border border-[var(--c-border)] bg-[color-mix(in_srgb,var(--c-bg)_55%,var(--c-panel2))] px-2 text-xs";

/** 防抖内联输入：本地受控即时反馈，失焦或 600ms 静默后一次性提交，
    避免表格编辑时每次击键触发全站 useStore 重渲染导致的卡顿 */
function DebouncedInput({ value, onCommit, className, placeholder, ariaLabel }: {
  value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; ariaLabel?: string;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef(0);
  const focusRef = useRef<HTMLInputElement>(null);
  // 外部值同步（如批量迁移/删除后），仅当未被聚焦时覆盖本地
  useEffect(() => {
    if (document.activeElement !== focusRef.current) setLocal(value);
  }, [value]);
  const commit = (v: string) => { onCommit(v); };
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
        timer.current = window.setTimeout(() => commit(e.target.value), 600);
      }}
      onBlur={(e) => { window.clearTimeout(timer.current); commit(e.target.value); }}
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

function ConfirmBtn({ onConfirm, label = "删除" }: { onConfirm: () => void; label?: string }) {
  const [arm, setArm] = useState(false);
  return (
    <button
      type="button"
      className={`h-7 shrink-0 px-2 text-[10px] ${arm ? "bg-[var(--c-orange)] text-black" : "border border-[var(--c-magenta)] text-[var(--c-magenta)]"}`}
      onClick={() => {
        if (arm) { onConfirm(); setArm(false); }
        else { setArm(true); window.setTimeout(() => setArm(false), 3000); }
      }}
    >
      {arm ? "确认删除?" : label}
    </button>
  );
}

/* ============ 分区管理 ============ */
export function CatsSection() {
  const { categories, links } = useStore();
  const up = (id: string, patch: Partial<Category>) =>
    setCategories(categories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const del = (c: Category) => {
    if (links.some((l) => l.cat === c.id)) { toast("该分区仍有站点，请先在「站点」页处理", "warn"); return; }
    setCategories(categories.filter((x) => x.id !== c.id));
    toast("分区已删除", "ok");
  };
  // 上移/下移后按显示顺序从上到下重新编号，主页分区与占位块随之联动
  const move = (i: number, d: number) => {
    const next = [...categories];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setCategories(next.map((c, k) => ({ ...c, no: k + 1 })));
    toast("已调整顺序并重新编号", "ok");
  };
  return (
    <Section title={`▣ 大分类管理 CATEGORIES · ${categories.length} 个`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] text-[var(--c-dim)]">名称/英文名/子分类可直接编辑，实时保存；↑↓ 调整顺序后自动重新编号</span>
        <button
          type="button"
          className="btn-mech h-8 px-3 text-xs"
          onClick={() => setCategories([...categories, {
            id: uid("c"),
            // 用最大编号 +1 而非 length+1，避免删除过分区后新编号与现有分区冲突，
            // 保证 cat-{no} 锚点唯一、导航/懒加载/滚动监听都能正确命中新分区
            no: categories.reduce((m, c) => Math.max(m, c.no), 0) + 1,
            name: "新分区", nameEn: "NEW", icon: "⬡", subcats: [], sound: "tools",
          }])}
        >＋ 新增分区</button>
      </div>
      <div className="thin-scroll max-h-[62vh] overflow-auto rounded-sm border border-[var(--c-border)]">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10" style={{ background: "var(--c-panel2)" }}>
            <tr className="text-[10px] text-[var(--c-dim)]">
              <th className="w-10 border-b border-[var(--c-border)] p-1.5 text-left">编号</th>
              <th className="w-12 border-b border-[var(--c-border)] p-1.5 text-left">图标</th>
              <th className="border-b border-[var(--c-border)] p-1.5 text-left">名称</th>
              <th className="w-28 border-b border-[var(--c-border)] p-1.5 text-left">英文名</th>
              <th className="border-b border-[var(--c-border)] p-1.5 text-left">子分类</th>
              <th className="w-20 border-b border-[var(--c-border)] p-1.5 text-left">音效</th>
              <th className="w-24 border-b border-[var(--c-border)] p-1.5 text-left">排序</th>
              <th className="w-16 border-b border-[var(--c-border)] p-1.5 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={c.id} className="border-b border-[var(--c-border)] last:border-0 hover:bg-[color-mix(in_srgb,var(--c-cyan)_6%,transparent)]">
                <td className="num p-1.5 text-[10px] text-[var(--c-cyan)]">{String(c.no).padStart(2, "0")}</td>
                <td className="p-1.5"><DebouncedInput className={`${inp} w-10 text-center`} value={c.icon} onCommit={(v) => up(c.id, { icon: v })} ariaLabel="图标" /></td>
                <td className="p-1.5"><DebouncedInput className={`${inp} min-w-24`} value={c.name} onCommit={(v) => up(c.id, { name: v })} ariaLabel="名称" /></td>
                <td className="p-1.5"><DebouncedInput className={`${inp} w-24`} value={c.nameEn} onCommit={(v) => up(c.id, { nameEn: v })} ariaLabel="英文名" /></td>
                <td className="p-1.5"><DebouncedInput className={`${inp} min-w-36`} value={c.subcats.join(",")} placeholder="子分类,逗号分隔"
                  onCommit={(v) => up(c.id, { subcats: v.split(",").map((s) => s.trim()).filter(Boolean) })} ariaLabel="子分类" /></td>
                <td className="p-1.5">
                  <select className={`${inp} w-20`} value={c.sound} onChange={(e) => up(c.id, { sound: e.target.value as Category["sound"] })} aria-label="音效">
                    {["film", "acg", "music", "game", "dev", "ai", "design", "tools", "news", "life"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="p-1.5">
                  <div className="flex gap-1">
                    <button type="button" className="btn-mech h-6 w-6 text-xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上移">↑</button>
                    <button type="button" className="btn-mech h-6 w-6 text-xs" disabled={i === categories.length - 1} onClick={() => move(i, 1)} aria-label="下移">↓</button>
                  </div>
                </td>
                <td className="p-1.5"><ConfirmBtn onConfirm={() => del(c)} /></td>
              </tr>
            ))}
            {categories.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-xs text-[var(--c-dim)]">暂无分区</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ============ 站点管理（简洁批量操作） ============ */
/* memo 行组件：仅当该行 link 引用 / 选中态 / 分区选项变化时才重渲染，
   配合防抖输入，避免单格编辑时整表 50 行全部重渲染 */
const LinkRow = memo(function LinkRow({
  link, selected, catOptions, onToggle, onPatch, onDelete,
}: {
  link: LinkItem; selected: boolean; catOptions: React.ReactNode;
  onToggle: (id: string) => void;
  onPatch: (id: string, patch: Partial<LinkItem>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className="border-b border-[var(--c-border)] last:border-0 hover:bg-[color-mix(in_srgb,var(--c-cyan)_6%,transparent)]">
      <td className="p-1.5 text-center"><input type="checkbox" checked={selected} onChange={() => onToggle(link.id)} /></td>
      <td className="num p-1.5 text-[10px] text-[var(--c-cyan)]">{link.no}</td>
      <td className="p-1.5 text-base leading-none">{link.icon}</td>
      <td className="p-1.5">
        <DebouncedInput className={`${inp} min-w-24`} value={link.name} onCommit={(v) => onPatch(link.id, { name: v })} ariaLabel="名称" />
      </td>
      <td className="p-1.5">
        <DebouncedInput className={`${inp} min-w-32`} value={link.desc} placeholder="描述" onCommit={(v) => onPatch(link.id, { desc: v })} ariaLabel="描述" />
      </td>
      <td className="p-1.5">
        <select className={`${inp} w-24`} value={link.cat} onChange={(e) => onPatch(link.id, { cat: e.target.value, sub: "" })} aria-label="分区">
          {catOptions}
        </select>
      </td>
      <td className="p-1.5">
        <DebouncedInput className={`${inp} min-w-36`} value={link.url} placeholder="https://…" onCommit={(v) => onPatch(link.id, { url: v })} ariaLabel="URL" />
      </td>
      <td className="p-1.5"><ConfirmBtn onConfirm={() => onDelete(link.id)} /></td>
    </tr>
  );
});

export function LinksSection() {
  const { links, categories } = useStore();
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [kw, setKw] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const setLinks_ = setLinks;
  const up = (id: string, patch: Partial<LinkItem>) =>
    setLinks_(links.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  // 用 useMemo 缓存派生数据，避免每次渲染都 filter 643 条站点
  const { list, totalPages, safePage, paged } = useMemo(() => {
    const list = links.filter((l) => {
      if (filter !== "all" && l.cat !== filter) return false;
      if (kw && !`${l.name}${l.url}${l.desc}${l.no}`.toLowerCase().includes(kw.toLowerCase())) return false;
      return true;
    });
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paged = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    return { list, totalPages, safePage, paged };
  }, [links, filter, kw, page]);
  // 分区选项缓存：每个站点行下拉都复用同一份 options，避免 50×N 次重复渲染
  const catOptions = useMemo(
    () => categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>),
    [categories],
  );
  const pageAllSel = paged.length > 0 && paged.every((l) => sel.has(l.id));

  const toggle = (id: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    setSel(pageAllSel ? new Set() : new Set(paged.map((l) => l.id)));
  };
  const removeSel = () => {
    if (sel.size === 0) { toast("请先勾选条目", "warn"); return; }
    setLinks_(links.filter((l) => !sel.has(l.id)));
    toast(`已删除 ${sel.size} 条`, "ok");
    setSel(new Set());
  };
  const moveSel = () => {
    if (sel.size === 0 || !moveTo) { toast("请勾选条目并选择目标分区", "warn"); return; }
    setLinks_(links.map((l) => (sel.has(l.id) ? { ...l, cat: moveTo, sub: "" } : l)));
    toast(`已迁移 ${sel.size} 条到 ${categories.find((c) => c.id === moveTo)?.name}`, "ok");
    setSel(new Set());
  };
  const clearSel = () => setSel(new Set());

  return (
    <Section title={`▣ 站点管理 LINKS · ${links.length} 条`}>
      {/* 工具栏：筛选 + 搜索 + 批量操作 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select className={`${inp} w-40 shrink-0`} value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
          <option value="all">所有分区</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{String(c.no).padStart(2, "0")} {c.name}</option>)}
        </select>
        <input className={`${inp} w-44 shrink-0`} placeholder="🔍 名称/URL/编号搜索" value={kw} onChange={(e) => { setKw(e.target.value); setPage(1); }} />
        <span className="text-[10px] text-[var(--c-dim)]">已选 {sel.size} 条</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <select className={`${inp} w-36 shrink-0`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">批量移动到…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" className="btn-mech h-8 px-2.5 text-xs" onClick={moveSel}>⇥ 迁移</button>
          <button type="button" className="btn-mech mag h-8 px-2.5 text-xs" onClick={removeSel}>🗑 删除</button>
          <button type="button" className="btn-mech h-8 px-2.5 text-xs" onClick={clearSel}>清空选择</button>
          <button type="button" className="btn-mech h-8 px-2.5 text-xs" onClick={() => {
            const cat = categories[0]?.id ?? "film";
            setLinks_([newLink(cat), ...links]);
            toast("已添加新站点", "ok");
          }}>＋ 新增</button>
        </div>
      </div>

      {/* 紧凑表格 */}
      <div className="thin-scroll max-h-[62vh] overflow-auto rounded-sm border border-[var(--c-border)]">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10" style={{ background: "var(--c-panel2)" }}>
            <tr className="text-[10px] text-[var(--c-dim)]">
              <th className="w-8 border-b border-[var(--c-border)] p-1.5"><input type="checkbox" checked={pageAllSel} onChange={toggleAll} /></th>
              <th className="w-12 border-b border-[var(--c-border)] p-1.5 text-left">编号</th>
              <th className="w-10 border-b border-[var(--c-border)] p-1.5 text-left">图标</th>
              <th className="border-b border-[var(--c-border)] p-1.5 text-left">名称</th>
              <th className="border-b border-[var(--c-border)] p-1.5 text-left">描述</th>
              <th className="w-24 border-b border-[var(--c-border)] p-1.5 text-left">分区</th>
              <th className="w-40 border-b border-[var(--c-border)] p-1.5 text-left">URL</th>
              <th className="w-16 border-b border-[var(--c-border)] p-1.5 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((l) => (
              <LinkRow
                key={l.id}
                link={l}
                selected={sel.has(l.id)}
                catOptions={catOptions}
                onToggle={toggle}
                onPatch={up}
                onDelete={(id) => { setLinks_(links.filter((x) => x.id !== id)); toast("已删除站点", "ok"); }}
              />
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-xs text-[var(--c-dim)]">无匹配站点</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {/* 分页条 */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] text-[var(--c-dim)]">共 {list.length} 条 · 第 {safePage}/{totalPages} 页 · 每页 {PAGE_SIZE} 条</span>
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn-mech h-7 px-2.5 text-xs" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹ 上一页</button>
          <button type="button" className="btn-mech h-7 px-2.5 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>下一页 ›</button>
        </div>
      </div>
      <p className="mt-1.5 text-[10px] text-[var(--c-dim)]">勾选后可批量「迁移分区」或「删除」。图标/名称/描述/URL 均可直接编辑，自动实时保存。</p>
    </Section>
  );
}

/* ============ 公告管理（支持拖放图片） ============ */
export function AnnSection() {
  const { announcements } = useStore();
  const [kind, setKind] = useState<Announcement["kind"]>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [img, setImg] = useState("");
  const [pinned, setPinned] = useState(false);

  const readFile = (file: File) => {
    if (!file.type.startsWith("image/")) { toast("仅支持图片文件", "warn"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result);
      setKind("image"); setContent(data); setImg(data);
      toast("已载入图片，填写标题后发布", "ok");
    };
    reader.readAsDataURL(file);
  };

  const add = () => {
    if (!title.trim()) { toast("请填写公告标题", "warn"); return; }
    setAnnouncements([{ id: uid("a"), no: nextAnnNo(), kind, title: title.trim(), content: content.trim(), time: new Date().toLocaleString(), pinned }, ...announcements]);
    setTitle(""); setContent(""); setImg(""); setPinned(false);
    toast(pinned ? "公告已发布并置顶" : "公告已发布", "ok");
  };

  const togglePin = (a: Announcement) => {
    setAnnouncements(announcements.map((x) => (x.id === a.id ? { ...x, pinned: !x.pinned } : x)));
    toast(!a.pinned ? "已置顶该公告" : "已取消置顶", "ok");
  };

  return (
    <Section title="▣ 公告发布 ANNOUNCE">
      <div className="mb-3 flex flex-wrap items-start gap-2 rounded-sm border border-[var(--c-border)] p-2">
        <div className="flex flex-1 basis-64 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${inp} w-24 shrink-0`} value={kind} onChange={(e) => setKind(e.target.value as Announcement["kind"])}>
              <option value="text">文字</option><option value="link">链接</option><option value="image">图片</option>
            </select>
            <input className={`${inp} flex-1 basis-40`} value={title} placeholder="公告标题" onChange={(e) => setTitle(e.target.value)} />
            <button type="button" className={`h-8 shrink-0 px-2.5 text-xs ${pinned ? "bg-[var(--c-orange)] text-black" : "border border-[var(--c-border)] text-[var(--c-dim)]"}`}
              onClick={() => { setPinned(!pinned); toast(!pinned ? "发布后将置顶显示" : "已取消置顶", "ok"); }}
              aria-pressed={pinned}>📌 {pinned ? "置顶" : "不置顶"}</button>
            <button type="button" className="btn-mech h-8 shrink-0 px-3 text-xs" onClick={add}>发布（自动编号）</button>
          </div>
          {kind === "text" ? (
            <input className={inp} value={content} placeholder="公告内容" onChange={(e) => setContent(e.target.value)} />
          ) : kind === "link" ? (
            <input className={inp} value={content} placeholder="https:// 链接地址" onChange={(e) => setContent(e.target.value)} />
          ) : (
            <div
              className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed p-3 text-center transition-colors ${
                dragOver ? "border-[var(--c-cyan)] bg-[color-mix(in_srgb,var(--c-cyan)_10%,transparent)]" : "border-[var(--c-border)]"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) readFile(f); }}
            >
              {img ? (
                <>
                  <img src={img} alt="预览" className="max-h-32 max-w-full object-contain" />
                  <span className="text-[10px] text-[var(--c-dim)]">拖入新图片或点此更换</span>
                </>
              ) : (
                <>
                  <span className="text-2xl">🖼️</span>
                  <span className="text-xs text-[var(--c-dim)]">拖放图片到此处，或</span>
                  <label className="btn-mech mt-1 h-7 shrink-0 cursor-pointer px-3 text-[10px]">
                    选择图片
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
                  </label>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="thin-scroll flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto pr-1">
        {announcements.map((a) => (
          <div key={a.id} className={`flex items-center gap-2 rounded-sm border p-2 ${a.pinned ? "border-[var(--c-orange)] bg-[color-mix(in_srgb,var(--c-orange)_8%,transparent)]" : "border-[var(--c-border)]"}`}>
            <span className="num w-12 shrink-0 text-[9px] tracking-widest text-[var(--c-orange)]">{a.no}</span>
            <span className="w-12 shrink-0 text-center text-[9px] text-[var(--c-dim)]">[{a.kind.toUpperCase()}]</span>
            {a.pinned ? <span className="shrink-0 text-sm leading-none" title="已置顶">📌</span> : <span className="w-4 shrink-0" />}
            <span className="min-w-0 flex-1 truncate text-xs">{a.title}</span>
            {a.kind === "image" && <span className="shrink-0 text-base leading-none">🖼️</span>}
            <span className="num hidden text-[9px] text-[var(--c-dim)] sm:block">{a.time}</span>
            <button type="button" className={`h-7 shrink-0 px-2 text-[10px] ${a.pinned ? "bg-[var(--c-orange)] text-black" : "border border-[var(--c-border)] text-[var(--c-dim)]"}`}
              onClick={() => togglePin(a)} aria-pressed={a.pinned}>置顶</button>
            <ConfirmBtn onConfirm={() => setAnnouncements(announcements.filter((x) => x.id !== a.id))} />
          </div>
        ))}
        {announcements.length === 0 && <p className="py-6 text-center text-xs text-[var(--c-dim)]">暂无公告</p>}
      </div>
    </Section>
  );
}

/* ============ 推广位管理（表格 + 自由增删 + 链接） ============ */
export function PromoSection() {
  const { promos } = useStore();
  const up = (id: string, patch: Partial<Promo>) => setPromos(promos.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const del = (p: Promo) => { setPromos(promos.filter((x) => x.id !== p.id)); toast("推广位已删除", "ok"); };
  const add = () => {
    setPromos([...promos, { id: uid("p"), icon: "⬡", title: "新推广位", desc: "点击填写描述", link: "", color: "cyan" }]);
    toast("已新增推广位", "ok");
  };
  return (
    <Section title={`▣ 合作推广位 PROMO · ${promos.length} 个`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] text-[var(--c-dim)]">标题/描述/链接/配色可直接编辑，实时保存；链接为空则点击不跳转</span>
        <button type="button" className="btn-mech h-8 px-3 text-xs" onClick={add}>＋ 新增推广位</button>
      </div>
      <div className="thin-scroll max-h-[62vh] overflow-auto rounded-sm border border-[var(--c-border)]">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10" style={{ background: "var(--c-panel2)" }}>
            <tr className="text-[10px] text-[var(--c-dim)]">
              <th className="w-14 border-b border-[var(--c-border)] p-1.5 text-left">图标</th>
              <th className="border-b border-[var(--c-border)] p-1.5 text-left">标题</th>
              <th className="border-b border-[var(--c-border)] p-1.5 text-left">描述</th>
              <th className="w-56 border-b border-[var(--c-border)] p-1.5 text-left">链接 URL</th>
              <th className="w-24 border-b border-[var(--c-border)] p-1.5 text-left">配色</th>
              <th className="w-16 border-b border-[var(--c-border)] p-1.5 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {promos.map((p) => (
              <tr key={p.id} className="border-b border-[var(--c-border)] last:border-0 hover:bg-[color-mix(in_srgb,var(--c-cyan)_6%,transparent)]">
                <td className="p-1.5"><DebouncedInput className={`${inp} w-12 text-center`} value={p.icon} onCommit={(v) => up(p.id, { icon: v })} ariaLabel="图标" /></td>
                <td className="p-1.5"><DebouncedInput className={`${inp} min-w-24`} value={p.title} onCommit={(v) => up(p.id, { title: v })} ariaLabel="标题" /></td>
                <td className="p-1.5"><DebouncedInput className={`${inp} min-w-32`} value={p.desc} placeholder="点击后的简介" onCommit={(v) => up(p.id, { desc: v })} ariaLabel="描述" /></td>
                <td className="p-1.5"><DebouncedInput className={`${inp} min-w-40`} value={p.link} placeholder="https:// 或 #分区锚点" onCommit={(v) => up(p.id, { link: v })} ariaLabel="链接" /></td>
                <td className="p-1.5">
                  <select className={`${inp} w-24`} value={p.color} onChange={(e) => up(p.id, { color: e.target.value as Promo["color"] })} aria-label="配色">
                    <option value="cyan">青 CYAN</option><option value="magenta">品红 MAGENTA</option><option value="orange">橙 ORANGE</option>
                  </select>
                </td>
                <td className="p-1.5"><ConfirmBtn onConfirm={() => del(p)} /></td>
              </tr>
            ))}
            {promos.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-xs text-[var(--c-dim)]">暂无推广位，点「＋ 新增推广位」添加</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}