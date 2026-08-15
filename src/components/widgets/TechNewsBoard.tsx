import { useEffect, useRef, useState } from "react";

/**
 * AI / 科技信息框：多分类(热点 / AI资讯 / 微博热搜 / 搜索趋势 / 开源趋势)，可在框内切换。
 * 数据链路（5 个板块每 30 分钟自动刷新，也可点「立即更新」手动刷新）：
 * 热点 → TrendRadar（GitHub Actions 每小时）；AI资讯 → ai-news-daily（每天 6 次）；
 * 微博热搜 → 60s 公共 API 实时 → mecha-hot-api 缓存 → 旧 fork 兜底；
 * 搜索趋势 → mecha-hot-api（Actions 每 30 分钟抓 Google Trends）→ 代理直拉 RSS → 旧 fork 兜底；
 * 开源趋势 → GitHub Search API 实时 → github-trending-scope 兜底。
 * mecha-hot-api 为自建非 fork 仓库：fork 的定时 Actions 会被 GitHub 自动禁用（disabled_fork），
 * 自建仓库持续有 bot 提交则不会被停用。数据缓存于 localStorage，网络失败时用本地兜底列表。
 */
interface TechItem { id: string; title: string; desc: string; url: string; meta: string }
type TabKey = "hot" | "ai" | "weibo" | "google" | "ghtrend";
type SourceKind = "trend" | "ai" | "weibo" | "google" | "ghtrend";

interface RepoRef { owner: string; repo: string; branch: string }

interface TabConf {
  key: TabKey; label: string; icon: string;
  kind: SourceKind;
  ref: RepoRef;
  /** 数据目录（ai-news-daily 为 data，weibo 为 raw） */
  dir?: string;
  /** 固定数据文件路径（trend-scraper、github-trending-scope 用固定文件名） */
  file?: string;
  fallback: TechItem[];
}

const LS_TECH = "mechanav.technews.v6";
const UPDATE_MS = 30 * 60 * 1000; // 5 个板块每 30 分钟自动更新

const enc = (s: string) => encodeURIComponent(s);

/** 列出 GitHub 仓库某目录下的文件名：先直连，失败则经 CORS 代理兜底 */
async function ghList(ref: RepoRef, path: string): Promise<string[] | null> {
  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${enc(path)}?ref=${ref.branch}`;
  const tryParse = async (text: string): Promise<string[] | null> => {
    try {
      const j = JSON.parse(text);
      if (!Array.isArray(j)) return null;
      return j.map((e: { name?: string }) => e.name).filter(Boolean) as string[];
    } catch { return null; }
  };
  // 直连
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let res: Response;
    try { res = await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(t); }
    if (res.ok) {
      const names = await tryParse(await res.text());
      if (names) return names;
    }
  } catch { /* 直连失败，走代理 */ }
  // CORS 代理兜底（注意：allorigins/get 返回 {"contents": "..."} 格式，需解包）
  try {
    const proxied = await fetchRaw(url, 10000);
    if (proxied) {
      const names = await tryParse(proxied);
      if (names) return names;
    }
  } catch { /* ignore */ }
  return null;
}

/** jsDelivr CDN 读取 GitHub 仓库文件：大陆直连快且有 CORS 头，是本站数据拉取的主链路。
 *  cdn.jsdelivr.net 会缓存文件，先经 purge.jsdelivr.net 触发刷新（返回 statuses），
 *  再拉取即可拿到分支最新提交的内容（实测 purge 后立即生效）。purge 失败不影响读取。 */
async function jsDelivrRaw(ref: RepoRef, path: string): Promise<string | null> {
  const cdn = `https://cdn.jsdelivr.net/gh/${ref.owner}/${ref.repo}@${ref.branch}/${enc(path)}`;
  // purge 是异步刷新，等 300ms 让边缘节点回源
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try { await fetch(`https://purge.jsdelivr.net/gh/${ref.owner}/${ref.repo}@${ref.branch}/${enc(path)}`, { signal: ctrl.signal }); } finally { clearTimeout(t); }
    await new Promise((r) => setTimeout(r, 300));
  } catch { /* purge 失败继续读缓存 */ }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let res: Response;
    try { res = await fetch(cdn, { signal: ctrl.signal }); } finally { clearTimeout(t); }
    if (!res.ok) return null;
    const text = await res.text();
    return text && text.trim().length > 20 ? text : null;
  } catch { return null; }
}

/** 读取 GitHub 仓库某个文件的原始内容：jsDelivr CDN（主）→ raw 直连 → CORS 代理（兜底） */
async function ghRaw(ref: RepoRef, path: string): Promise<string | null> {
  // 1. jsDelivr CDN：有 CORS 头，大陆网络直连稳定
  const viaCdn = await jsDelivrRaw(ref, path);
  if (viaCdn) return viaCdn;
  // 2. raw.githubusercontent.com 直连（海外网络可用）
  const url = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${ref.branch}/${path}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let res: Response;
    try { res = await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(t); }
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().length > 20) return text;
    }
  } catch { /* 直连失败，走代理 */ }
  // 3. CORS 代理兜底
  const proxied = await fetchRaw(url, 10000);
  return proxied && proxied.trim().length > 20 ? proxied : null;
}

/** 经多个 CORS 代理依次尝试抓取原始文本，规避浏览器 CORS 与单一代理失效 */
async function fetchRaw(url: string, ms = 12000): Promise<string> {
  const e = encodeURIComponent(url);
  const proxies = [
    `https://api.allorigins.win/raw?url=${e}`,
    `https://corsproxy.io/?url=${e}`,
    `https://api.codetabs.com/v1/proxy?quest=${e}`,
    `https://api.allorigins.win/get?url=${e}`,
  ];
  for (const p of proxies) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      let res: Response;
      try { res = await fetch(p, { signal: ctrl.signal }); } finally { clearTimeout(t); }
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.trim().length < 40) continue;
      const trimmed = text.trim();
      if (trimmed.startsWith("{")) {
        try {
          const j = JSON.parse(trimmed);
          if (typeof j.contents === "string" && j.contents.trim().length > 40) return j.contents;
        } catch { /* not json */ }
        continue;
      }
      return text;
    } catch { /* 尝试下一个代理 */ }
  }
  return "";
}

/** 通过 GitHub Contents API 读取文件内容（有 CORS 头，比 raw.githubusercontent.com 更可靠）。
 *  返回 base64 解码后的文本，失败返回 null。 */
async function ghContent(ref: RepoRef, path: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${enc(path)}?ref=${ref.branch}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    let res: Response;
    try { res = await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(t); }
    if (!res.ok) return null;
    const j = await res.json() as { content?: string; encoding?: string };
    if (j.content && j.encoding === "base64") {
      // atob 解码为 Latin-1 二进制串，中文等多字节字符必须经 TextDecoder 转 UTF-8，否则乱码
      const bin = atob(j.content.replace(/\s/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return null;
  } catch { return null; }
}

/** 从目录中挑出符合日期命名的最新文件（如 2026-08-14.json / 2026-08-14-processed.json） */
async function pickLatest(ref: RepoRef, dir: string, re: RegExp): Promise<string | null> {
  const files = await ghList(ref, dir);
  if (!files || !files.length) return null;
  const dated = files.filter((f) => re.test(f)).sort();
  const latest = dated.length ? dated[dated.length - 1] : files[files.length - 1];
  return latest;
}

/* ---------------- 数据源实现 ---------------- */

/** TrendRadar 热点：用户 fork 的仓库，GitHub Actions 每小时抓取并提交 output/日期/txt/时间.txt */
const TREND_REF: RepoRef = { owner: "hengjuzhan", repo: "TrendRadar", branch: "master" };
const TREND_API = `https://api.github.com/repos/${TREND_REF.owner}/${TREND_REF.repo}/contents`;

function cnDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日`;
}

async function ghListTrend(path: string): Promise<string[] | null> {
  const url = `${TREND_API}/${path}`;
  const tryParse = (text: string): string[] | null => {
    try {
      const j = JSON.parse(text);
      if (!Array.isArray(j)) return null;
      return j.map((e: { name?: string }) => e.name).filter(Boolean) as string[];
    } catch { return null; }
  };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let res: Response;
    try { res = await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(t); }
    if (res.ok) {
      const names = tryParse(await res.text());
      if (names) return names;
    }
  } catch { /* 直连失败 */ }
  try {
    const proxied = await fetchRaw(url, 10000);
    if (proxied) { const names = tryParse(proxied); if (names) return names; }
  } catch { /* ignore */ }
  return null;
}

async function resolveTrendTxt(): Promise<string | null> {
  const today = cnDate(new Date());
  let dateDir = today;
  let files = await ghListTrend(`output/${enc(today)}/txt`);
  if (!files || !files.length) {
    const dirs = await ghListTrend("output");
    if (!dirs || !dirs.length) return null;
    dateDir = dirs[dirs.length - 1];
    files = await ghListTrend(`output/${enc(dateDir)}/txt`);
  }
  if (!files || !files.length) return null;
  const last = files[files.length - 1];
  return `https://raw.githubusercontent.com/${TREND_REF.owner}/${TREND_REF.repo}/${TREND_REF.branch}/output/${enc(dateDir)}/txt/${enc(last)}`;
}

/** 兴趣关键词：AI / 科技 / 国际局势，命中任一即保留 */
const INTEREST_KW: (string | RegExp)[] = [
  /\bai\b/i, "人工智能", "大模型", "智能", "机器人", "机器狗", "具身", "自动驾驶", "无人驾驶",
  "智能驾驶", "芯片", "半导体", "算力", "算法", "英伟达", "nvidia", "openai", "chatgpt",
  "gpt", "claude", "gemini", "deepseek", "机器学习", "深度学习", "神经网络", "数据中心",
  "云计算", "显卡", "gpu", "量子计算", "编程", "开源",
  "科技", "光刻机", "晶圆", "手机", "iphone", "华为", "鸿蒙", "卫星", "火箭", "飞船",
  "月球", "火星", "宇宙", "航天", "航空", "5g", "6g", "新能源汽车", "电动车", "电池",
  "存储", "内存", "操作系统", "软件", "浏览器", "超级计算机", "无人机", "苹果",
  "微软", "谷歌", "腾讯", "阿里", "字节", "百度", "特斯拉", "马斯克", "spacex", "星舰",
  "美国", "日本", "韩国", "俄罗斯", "俄乌", "乌克兰", "以色列", "伊朗", "中东", "欧盟",
  "欧洲", "北约", "联合国", "外交", "制裁", "关税", "贸易", "军事", "导弹", "战机",
  "航母", "演习", "选举", "总统", "首相", "国际", "全球", "冲突", "局势", "战争",
  "普京", "特朗普", "拜登", "泽连斯基", "金砖", "峰会", "谈判", "海啸", "地震", "台风",
];
function inInterest(title: string): boolean {
  const lower = title.toLowerCase();
  return INTEREST_KW.some((k) =>
    typeof k === "string" ? lower.includes(k.toLowerCase()) : k.test(lower)
  );
}

/** 解析 txt：按平台分节，条目 "N. 标题 [URL:链接]"，跨平台按标题去重，过滤相关条目后取前 40 */
function parseTrendTxt(text: string): TechItem[] {
  const seen = new Set<string>();
  const all: TechItem[] = [];
  let section = "热点";
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const m = l.match(/^(\d+)\.\s*(.+?)\s*\[URL:(.*?)\]/);
    if (m) {
      const title = m[2].trim();
      const key = title.replace(/\s+/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ id: `${section}-${m[1]}`, title, desc: `${section} 热搜`, url: m[3], meta: section });
    } else {
      const sec = l.match(/^(.*?)\|\s*(.*)$/);
      if (sec) section = sec[2].trim();
    }
  }
  const matched = all.filter((it) => inInterest(it.title));
  return (matched.length >= 5 ? matched : all).slice(0, 40);
}

async function fetchTrend(): Promise<TechItem[] | null> {
  const rawUrl = await resolveTrendTxt();
  if (!rawUrl) return null;
  // 主路径：把 raw URL 换算成仓库相对路径，经 jsDelivr CDN 拉取（大陆直连稳定）
  const rel = rawUrl.replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//, "");
  let text = rel ? await jsDelivrRaw(TREND_REF, rel) : null;
  // 兜底：原 raw URL 直连或经 CORS 代理
  if (!text) text = await fetchRaw(rawUrl);
  if (!text) return null;
  const items = parseTrendTxt(text);
  return items.length ? items : null;
}

/** ai-news-daily：AI 新闻聚合，data/YYYY-MM-DD-processed.json，本地 LLM 分类，每天 6 次更新 */
const AI_REF: RepoRef = { owner: "hengjuzhan", repo: "ai-news-daily.github.io", branch: "main" };
async function fetchAirNews(): Promise<TechItem[] | null> {
  const file = await pickLatest(AI_REF, "data", /^\d{4}-\d{2}-\d{2}-processed\.json$/);
  if (!file) return null;
  const text = await ghRaw(AI_REF, `data/${enc(file)}`);
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    const articles = Array.isArray(j.articles) ? j.articles : [];
    return articles.slice(0, 20).map((a: any, i: number) => ({
      id: String(a.url || i),
      title: a.title || "",
      desc: (a.summary || a.source || "AI 资讯").toString().slice(0, 110),
      url: a.url || "",
      meta: a.source_category || a.source || "AI",
    })).filter((x: TechItem) => x.title && x.url);
  } catch { return null; }
}

/** mecha-hot-api：自建非 fork 仓库，Actions 每 30 分钟抓微博热搜 / Google 趋势并提交 JSON。
 *  （fork 仓库的定时 Actions 会被 GitHub 自动置为 disabled_fork 停摆，自建仓库不受影响） */
const HOTAPI_REF: RepoRef = { owner: "hengjuzhan", repo: "mecha-hot-api", branch: "main" };

/** 60s 公共 API（vikiboss/60s，Cloudflare 部署，CORS 全开）：微博热搜实时数据 */
const API_60S_WEIBO = "https://60s.viki.moe/v2/weibo";

interface HotApiFile { updated?: string; items?: { title?: string; hot?: number; traffic?: string; url?: string }[] }

/** 解析 mecha-hot-api 的 data/*.json */
function parseHotApi(text: string, kind: "weibo" | "google"): TechItem[] | null {
  try {
    const j = JSON.parse(text) as HotApiFile;
    const list = Array.isArray(j.items) ? j.items : [];
    const out = list.slice(0, 25).map((it, i) => ({
      id: `${kind}${i}${it.title || ""}`,
      title: it.title || "",
      desc: kind === "weibo" ? `热度 ${(it.hot || 0).toLocaleString()}` : `搜索量 ${it.traffic || "—"}`,
      url: it.url || "",
      meta: kind === "weibo" ? "微博" : "趋势",
    })).filter((x: TechItem) => x.title);
    return out.length ? out : null;
  } catch { return null; }
}

/** 旧 fork 仓库（Actions 已停摆，仅作最后兜底）：微博 raw/YYYY-MM-DD.json */
const WEIBO_REF: RepoRef = { owner: "hengjuzhan", repo: "weibo-daily-hot-search", branch: "master" };

/** 微博热搜：60s 公共 API 实时 → mecha-hot-api 缓存 → 旧 fork 仓库文件 */
async function fetchWeibo(): Promise<TechItem[] | null> {
  // 1. 60s 公共 API 直连（CORS=*，实时最新）
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    let res: Response;
    try { res = await fetch(API_60S_WEIBO, { signal: ctrl.signal }); } finally { clearTimeout(t); }
    if (res.ok) {
      const j = await res.json() as { data?: { title?: string; hot_value?: number; link?: string }[] };
      const list = (j.data || []).slice(0, 25).map((it, i) => ({
        id: `wb${i}${it.title || ""}`,
        title: it.title || "",
        desc: `热度 ${(it.hot_value || 0).toLocaleString()}`,
        url: it.link || "",
        meta: "微博",
      })).filter((x: TechItem) => x.title);
      if (list.length) return list;
    }
  } catch { /* 走回退 */ }
  // 2. mecha-hot-api 缓存（Actions 每 30 分钟更新）
  const viaRepo = await ghRaw(HOTAPI_REF, "data/weibo.json");
  if (viaRepo) {
    const items = parseHotApi(viaRepo, "weibo");
    if (items) return items;
  }
  // 3. 旧 fork 仓库（Actions 已停摆，仅作最后兜底）
  const file = await pickLatest(WEIBO_REF, "raw", /^\d{4}-\d{2}-\d{2}\.json$/);
  if (!file) return null;
  const text = await ghRaw(WEIBO_REF, `raw/${enc(file)}`);
  if (!text) return null;
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return null;
    return arr.slice(0, 25).map((it: any, i: number) => ({
      id: String(i) + (it.text || i),
      title: it.text || "",
      desc: `热度 ${(it.count || 0).toLocaleString()}`,
      url: it.url ? (it.url.startsWith("http") ? it.url : `https://s.weibo.com${it.url}`) : "",
      meta: "微博",
    })).filter((x: TechItem) => x.title);
  } catch { return null; }
}

/** 旧 fork 仓库（Actions 已停摆，仅作最后兜底）：trend-scraper 的 data/google-trends.json */
const GOOGLE_REF: RepoRef = { owner: "hengjuzhan", repo: "trend-scraper", branch: "main" };
const GOOGLE_RSS = "https://trends.google.com/trending/rss?geo=US";

/** trend-scraper 旧格式：{trends:[{googleTrend, searchVolume, started}]} */
function parseGoogleTrends(text: string): TechItem[] {
  try {
    const j = JSON.parse(text);
    const trends = Array.isArray(j.trends) ? j.trends : [];
    return trends.slice(0, 20).map((t: any, i: number) => ({
      id: String(i) + (t.googleTrend || i),
      title: t.googleTrend || "",
      desc: `搜索量 ${t.searchVolume || ""}${t.started ? " · " + t.started : ""}`,
      url: t.googleTrend ? `https://www.google.com/search?q=${encodeURIComponent(t.googleTrend)}` : "",
      meta: "趋势",
    })).filter((x: TechItem) => x.title);
  } catch { return []; }
}

/** Google Trends RSS（经 CORS 代理拉到的 XML）→ 条目列表 */
function parseGoogleRss(xml: string): TechItem[] {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const nodes = Array.from(doc.querySelectorAll("item")).slice(0, 20);
    return nodes.map((el, i) => {
      const title = el.querySelector("title")?.textContent?.trim() || "";
      const traffic = el.getElementsByTagName("ht:approx_traffic")[0]?.textContent?.trim() || "";
      const link = el.querySelector("link")?.nextSibling?.textContent?.trim() || "";
      return {
        id: `gr${i}${title}`,
        title,
        desc: `搜索量 ${traffic || "—"}`,
        url: link || (title ? `https://www.google.com/search?q=${encodeURIComponent(title)}` : ""),
        meta: "趋势",
      };
    }).filter((x: TechItem) => x.title);
  } catch { return []; }
}

/** 搜索趋势（Google Trends）：mecha-hot-api 缓存 → 浏览器经代理直拉 RSS → 旧 fork 文件 */
async function fetchGoogle(): Promise<TechItem[] | null> {
  // 1. mecha-hot-api 的 data/google.json（Actions 每 30 分钟服务端抓取，无 CORS 问题）
  const text = await ghRaw(HOTAPI_REF, "data/google.json");
  if (text) {
    const items = parseHotApi(text, "google");
    if (items) return items;
  }
  // 2. 浏览器经 CORS 代理直接拉 Google Trends RSS（代理不稳定，尽力而为）
  const xml = await fetchRaw(GOOGLE_RSS, 10000);
  if (xml && xml.includes("<item>")) {
    const items = parseGoogleRss(xml);
    if (items.length) return items;
  }
  // 3. 旧 fork 仓库文件（数据停更前最后一份）
  const old = await ghRaw(GOOGLE_REF, "data/google-trends.json");
  if (old) {
    const items = parseGoogleTrends(old);
    if (items.length) return items;
  }
  return null;
}

/** github-trending-scope 数据（回退用），根目录 data.json，每天 Actions 自动更新 */
const GHTREND_REF: RepoRef = { owner: "hengjuzhan", repo: "github-trending-scope", branch: "main" };
function parseGhTrendData(text: string): TechItem[] {
  try {
    const j = JSON.parse(text);
    const cats: Record<string, { zh: string }> = j.cats || {};
    const list = (j.boards?.daily?.all || []).slice(0, 20);
    return list.map((r: any, i: number) => {
      const catZh = cats[r.cat]?.zh || "Trending";
      return {
        id: String(i) + r.full,
        title: r.full || "",
        desc: `${catZh} · ★${r.stars ?? ""}k · 今日 ${r.today ?? ""}`,
        url: r.full ? `https://github.com/${r.full}` : "",
        meta: catZh,
      };
    }).filter((x: TechItem) => x.title && x.url);
  } catch { return []; }
}
async function fetchGhTrend(): Promise<TechItem[] | null> {
  // 主路径：GitHub Search API 搜近 7 天创建的高星仓库（有 CORS，无需代理，60 次/小时匿名配额）
  const d = new Date();
  d.setDate(d.getDate() - 7);
  const dateStr = d.toISOString().split("T")[0];
  const q = encodeURIComponent(`created:>${dateStr}`);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(
        `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=25`,
        { signal: ctrl.signal },
      );
    } finally { clearTimeout(t); }
    if (res.ok) {
      const j = await res.json() as { items?: { full_name: string; description: string; html_url: string; stargazers_count: number; language: string }[] };
      if (j.items?.length) {
        return j.items.map((r, i) => ({
          id: `gh${i}${r.full_name}`,
          title: r.full_name,
          desc: (r.description || "").slice(0, 100) || "No description",
          url: r.html_url,
          meta: `★${r.stargazers_count.toLocaleString()}${r.language ? " · " + r.language : ""}`,
        }));
      }
    }
    // 429 限流时静默回退
  } catch { /* 网络失败，走回退 */ }

  // 回退 1：jsDelivr CDN / raw 直连拉取 github-trending-scope 的 data.json（ghRaw 内置多层回退）
  const text = await ghRaw(GHTREND_REF, "data.json");
  if (text) {
    const items = parseGhTrendData(text);
    if (items.length) return items;
  }

  // 回退 2：GitHub Contents API（有 CORS 头）
  const viaApi = await ghContent(GHTREND_REF, "data.json");
  if (viaApi) {
    const items = parseGhTrendData(viaApi);
    if (items.length) return items;
  }
  return null;
}

/* ---------------- 标签配置 ---------------- */

const TABS: TabConf[] = [
  {
    key: "hot", label: "热点", icon: "🔥", kind: "trend", ref: TREND_REF,
    fallback: [
      { id: "h1", title: "热点数据抓取中…", desc: "TrendRadar 每小时自动抓取全网热搜并同步到此", url: "", meta: "热点" },
      { id: "h2", title: "等待首次抓取完成", desc: "可在 GitHub Actions 中手动触发抓取", url: "", meta: "热点" },
      { id: "h3", title: "抓取失败时显示此列表", desc: "请检查 fork 仓库的 Actions 是否已启用", url: "", meta: "热点" },
    ],
  },
  {
    key: "ai", label: "AI 资讯", icon: "✦", kind: "ai", ref: AI_REF, dir: "data",
    fallback: [
      { id: "a1", title: "大模型开源浪潮", desc: "每日抓取 70+ AI/科技源并本地分类，6 次/天更新", url: "", meta: "AI" },
      { id: "a2", title: "AI Agent 商业化提速", desc: "智能体应用从实验走向企业落地", url: "", meta: "AI" },
      { id: "a3", title: "多模态与具身智能", desc: "视觉-语言-行动模型推动机器人智能跃迁", url: "", meta: "AI" },
      { id: "a4", title: "AI 芯片竞争加剧", desc: "专用推理芯片与生态持续缠斗", url: "", meta: "AI" },
      { id: "a5", title: "数据暂未同步", desc: "ai-news-daily 首次抓取完成后自动填充", url: "", meta: "AI" },
    ],
  },
  {
    key: "weibo", label: "微博热搜", icon: "💬", kind: "weibo", ref: HOTAPI_REF, file: "data/weibo.json",
    fallback: [
      { id: "w1", title: "微博热搜实时同步中…", desc: "60s 公共 API 实时拉取，每 30 分钟自动刷新", url: "", meta: "微博" },
      { id: "w2", title: "数据加载中…", desc: "首次拉取或网络异常时显示此列表", url: "", meta: "微博" },
      { id: "w3", title: "若持续显示此列表", desc: "请检查浏览器网络后点右下角立即更新", url: "", meta: "微博" },
    ],
  },
  {
    key: "google", label: "搜索趋势", icon: "⚡", kind: "google", ref: HOTAPI_REF, file: "data/google.json",
    fallback: [
      { id: "g1", title: "Google 搜索趋势", desc: "mecha-hot-api 每 30 分钟抓取 Google Trends 并同步到此", url: "", meta: "趋势" },
      { id: "g2", title: "数据加载中…", desc: "首次拉取或网络异常时显示此列表", url: "", meta: "趋势" },
      { id: "g3", title: "若持续显示此列表", desc: "请检查浏览器网络后点右下角立即更新", url: "", meta: "趋势" },
    ],
  },
  {
    key: "ghtrend", label: "开源趋势", icon: "⎔", kind: "ghtrend", ref: GHTREND_REF, file: "data.json",
    fallback: [
      { id: "t1", title: "GitHub Trending 开源热榜", desc: "实时搜索近 7 天高星仓库，无需任何 API Key", url: "", meta: "Trending" },
      { id: "t2", title: "数据加载中…", desc: "首次拉取或网络异常时显示此列表", url: "", meta: "Trending" },
      { id: "t3", title: "若持续显示此列表", desc: "请检查浏览器网络或 Supabase 配置", url: "", meta: "Trending" },
    ],
  },
];

/* ---------------- 组件 ---------------- */

async function loadByKind(kind: SourceKind): Promise<TechItem[] | null> {
  switch (kind) {
    case "trend": return fetchTrend();
    case "ai": return fetchAirNews();
    case "weibo": return fetchWeibo();
    case "google": return fetchGoogle();
    case "ghtrend": return fetchGhTrend();
    default: return null;
  }
}

function readCache(): { t: number; byTab: Partial<Record<TabKey, TechItem[]>> } {
  try {
    const raw = localStorage.getItem(LS_TECH);
    if (!raw) return { t: 0, byTab: {} };
    const c = JSON.parse(raw) as { t: number; byTab: Partial<Record<TabKey, TechItem[]>> };
    return { t: c.t || 0, byTab: c.byTab || {} };
  } catch { return { t: 0, byTab: {} }; }
}

export function TechNewsBoard() {
  const [active, setActive] = useState<TabKey>("hot");
  const [items, setItems] = useState<Record<TabKey, TechItem[]>>(() => {
    const c = readCache().byTab;
    return TABS.reduce((acc, tb) => {
      acc[tb.key] = c[tb.key] || tb.fallback;
      return acc;
    }, {} as Record<TabKey, TechItem[]>);
  });
  const [updated, setUpdated] = useState<Partial<Record<TabKey, string>>>({});
  const [fetching, setFetching] = useState<Partial<Record<TabKey, boolean>>>({});
  const [error, setError] = useState<Partial<Record<TabKey, boolean>>>({});
  const lastFetch = useRef<Partial<Record<TabKey, number>>>({});

  const loadTab = async (key: TabKey, force = false) => {
    const conf = TABS.find((c) => c.key === key)!;
    if (!force && Date.now() - (lastFetch.current[key] || 0) < 8000) return;
    lastFetch.current[key] = Date.now();
    setFetching((f) => ({ ...f, [key]: true }));
    setError((e) => ({ ...e, [key]: false }));
    let list: TechItem[] | null = null;
    try {
      list = await loadByKind(conf.kind);
    } catch { list = null; }
    // 乱码防护：编码错误的数据（含 U+FFFD 替换符）视为拉取失败，不覆盖现有内容、不入缓存
    if (list && list.some((it) => it.title.includes("\uFFFD"))) list = null;
    if (list && list.length) {
      setItems((old) => {
        const next = { ...old, [key]: list! };
        // 只缓存含真实链接的数据，避免把兜底占位文案写入缓存导致下次误读
        const clean: Partial<Record<TabKey, TechItem[]>> = {};
        (Object.keys(next) as TabKey[]).forEach((k) => {
          const arr = next[k];
          if (arr && arr.some((it) => it.url)) clean[k] = arr;
        });
        try { localStorage.setItem(LS_TECH, JSON.stringify({ t: Date.now(), byTab: clean })); } catch { /* ignore */ }
        return next;
      });
      setUpdated((u) => ({ ...u, [key]: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }));
    } else {
      setError((e) => ({ ...e, [key]: true }));
    }
    setFetching((f) => ({ ...f, [key]: false }));
  };

  useEffect(() => {
    const c = readCache();
    // 先立即加载当前激活标签页（缓存过期则强制拉新，否则用缓存但后台刷新）
    void loadTab(active, !(c.t && Date.now() - c.t < UPDATE_MS));
    // 依次预加载其他标签页（错开 300ms 避免并发请求过多）
    TABS.forEach((tb, i) => {
      if (tb.key === active) return;
      window.setTimeout(() => {
        const cc = readCache();
        const stale = !cc.byTab[tb.key] || !cc.t || Date.now() - cc.t >= UPDATE_MS;
        void loadTab(tb.key, stale);
      }, 400 + i * 300);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 5 个板块每 30 分钟全部自动刷新（错开 400ms 避免并发请求过多）
    const iv = window.setInterval(() => {
      TABS.forEach((tb, i) => {
        window.setTimeout(() => void loadTab(tb.key, true), i * 400);
      });
    }, UPDATE_MS);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cur = items[active] || TABS.find((c) => c.key === active)!.fallback;
  const isFetching = fetching[active];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 pb-1.5">
        {TABS.map((tb) => {
          const on = tb.key === active;
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => { setActive(tb.key); void loadTab(tb.key); }}
              className="num h-6 shrink-0 px-1.5 text-[9px] tracking-wider transition-colors"
              style={{
                color: on ? "var(--c-cyan)" : "var(--c-dim)",
                borderBottom: `2px solid ${on ? "var(--c-cyan)" : "transparent"}`,
              }}
            >
              {tb.icon} {tb.label}
            </button>
          );
        })}
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        {cur.map((it) => {
          const inner = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-semibold text-[var(--c-cyan)]">{it.title}</span>
                <span className="num shrink-0 text-[9px] tracking-wider text-[var(--c-magenta)]">{it.meta}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--c-dim)]">{it.desc}</p>
            </>
          );
          return it.url ? (
            <a
              key={it.id}
              href={it.url}
              target="_blank"
              rel="noreferrer"
              className="panel2 mb-1.5 block p-2 transition-transform hover:-translate-y-0.5"
            >
              {inner}
            </a>
          ) : (
            <div key={it.id} className="panel2 mb-1.5 block p-2">
              {inner}
            </div>
          );
        })}
      </div>

      <div className="num flex items-center justify-between pt-1 text-[8px] tracking-wider text-[var(--c-dim)]">
        <span>
          {error[active] ? <span className="text-[var(--c-orange)]">抓取失败，显示缓存/本地内容</span>
            : updated[active] ? `更新于 ${updated[active]}`
            : "拉取中…"}
        </span>
        <button type="button" className="btn-mech h-5 px-2 text-[9px] hover:opacity-90" onClick={() => void loadTab(active, true)}>
          {isFetching ? "⋯ 更新中" : "⟳ 立即更新"}
        </button>
      </div>
    </div>
  );
}