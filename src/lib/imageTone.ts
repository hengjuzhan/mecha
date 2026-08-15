/** 检测图片平均亮度，返回深/浅色调，用于背景自适应适配文字颜色 */
export async function detectBgTone(src: string): Promise<"dark" | "light"> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 32;
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) { resolve("dark"); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const d = ctx.getImageData(0, 0, size, size).data;
        let lum = 0;
        for (let i = 0; i < d.length; i += 4) lum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const avg = lum / (size * size);
        resolve(avg < 128 ? "dark" : "light");
      } catch { resolve("dark"); }
    };
    img.onerror = () => resolve("dark");
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