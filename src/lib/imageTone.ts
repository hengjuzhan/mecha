export type BgTone = "dark" | "light" | "mixed";

/**
 * 背景色调检测（三态）：dark=大面积暗（浅色文字可读）、light=大面积亮（深色文字可读）、
 * mixed=明暗混杂（单靠文字换色救不回来，需加重模块衬底 + 文字阴影兜底）。
 * 旧版全图平均亮度在"半亮半暗"的图上必然判错一半，这里改为亮/暗像素占比的直方图分析。
 * 返回 null = 图片加载/跨域失败，调用方应保留原值而非猜测。
 */
export async function detectBgTone(src: string): Promise<BgTone | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 64;
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const d = ctx.getImageData(0, 0, size, size).data;
        let dark = 0, light = 0;
        const total = size * size;
        for (let i = 0; i < d.length; i += 4) {
          const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          if (lum < 90) dark++;
          else if (lum > 170) light++;
        }
        const dr = dark / total, lr = light / total;
        if (lr >= 0.55) resolve("light");
        else if (dr >= 0.55) resolve("dark");
        else if (lr >= 0.4 && lr > dr * 2) resolve("light");
        else if (dr >= 0.4 && dr > lr * 2) resolve("dark");
        else resolve("mixed");
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * 上传前压缩图片：限制最大边长并转 JPEG（透明图转 PNG）。
 * 避免超大 base64 拖慢 localStorage 持久化与全站重渲染，同时规避 LocalStorage 5MB 上限。
 */
export async function compressImage(file: File, maxDim = 1920, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) { resolve(""); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        let hasAlpha = false;
        for (let i = 3; i < d.length; i += 4) { if (d[i] < 250) { hasAlpha = true; break; } }
        resolve(hasAlpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", quality));
      } catch { resolve(""); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(""); };
    img.src = url;
  });
}