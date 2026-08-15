export type SoundType = "film" | "acg" | "music" | "game" | "dev" | "ai" | "design" | "tools" | "news" | "life";

export interface Category {
  id: string;
  no: number;
  name: string;
  nameEn: string;
  icon: string;
  subcats: string[];
  sound: SoundType;
}

export interface LinkItem {
  id: string;
  no: string; // L0001
  name: string;
  url: string;
  desc: string;
  cat: string; // category id
  sub: string; // subcategory
  badge?: string; // HOT / NEW ...
  icon: string; // emoji
  placeholder?: boolean;
}

export interface Announcement {
  id: string;
  no: string; // P0001
  kind: "text" | "link" | "image";
  title: string;
  content: string; // text body or URL
  time: string;
  pinned?: boolean;
}

export interface Promo {
  id: string;
  icon: string;
  title: string;
  desc: string;
  link: string;
  color: "cyan" | "magenta" | "orange";
}

export type MusicKind = "random" | "gdstudio" | "oiapi";
export interface MusicSource {
  id: string;
  kind: MusicKind;
  name: string;
  baseUrl: string;
  enabled: boolean;
  platform?: string; // gdstudio: netease/kuwo；oiapi: Music_163/Kuwo
  playlists?: string[]; // random: 网易云歌单 id 列表，随机从中拉歌
}

export interface BoardSize { w: number; h: number }
export interface SupabaseCfg { url: string; key: string }

export interface Settings {
  theme: "dark" | "light" | "auto";
  accent: string;
  font: string;
  soundVol: number;
  neonBright: number;
  neonSpeed: number;
  jumpAmp: number;
  jumpSpeed: number;
  glow: number;
  musicVol: number;
  musicGlow: number;
  musicHeight: number;
  musicWidth: number;
  boardLeft: BoardSize;
  boardMid: BoardSize;
  boardRight: BoardSize;
  colorShift: boolean;
  animNeon: boolean;
  animJump: boolean;
  animShine: boolean;
  blendMode: "normal" | "screen" | "overlay" | "soft-light" | "multiply";
  homeTransparent: boolean;
  bgImage: string;
  bgTone: "dark" | "light";
  supabase: SupabaseCfg | null;
  visitsDay: string;
  visitsTotal: number;
  visitsToday: number;
}

export interface Overlay {
  categories?: Category[];
  links?: LinkItem[];
  announcements?: Announcement[];
  promos?: Promo[];
  musicSources?: MusicSource[];
  texts?: Record<string, string>;
}
