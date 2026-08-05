// Font loader for pdf-lib Chinese text support in Cloudflare Pages Functions.
// Loads NotoSansTC — prefers local static/assets, falls back to CDN.

let cachedFont = null;

// Try to load from local static asset first, then CDN sources
function getUrls(env) {
  const urls = [];
  // Local static asset (dev server or production Pages/assets)
  // In Miniflare dev: http://127.0.0.1:8788/assets/NotoSansTC-Regular.woff2
  // In production: relative path /assets/NotoSansTC-Regular.woff2
  try {
    // Use the request origin if available, or fallback to relative
    urls.push('/assets/NotoSansTC-Regular.woff2');
  } catch(e) {}
  urls.push(
    'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-tc@latest/chinese-traditional-400-normal.woff2',
    'https://fonts.gstatic.com/ea/notosanstc/v1/NotoSansTC-Regular.otf',
  );
  return urls;
}

export async function loadChineseFont(env) {
  if (cachedFont) return cachedFont;

  const urls = getUrls(env);
  for (const url of urls) {
    try {
      console.log('[font-loader] Trying:', url);
      const opts = {};
      if (url.startsWith('http')) {
        opts.headers = { 'User-Agent': 'Cloudflare-Worker' };
      }
      const resp = await fetch(url, opts);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        if (buf.byteLength < 5000) {
          console.warn('[font-loader] Font too small (' + buf.byteLength + ' bytes), not valid');
          continue;
        }
        cachedFont = buf;
        console.log('[font-loader] Font loaded OK (' + (buf.byteLength / 1024).toFixed(0) + 'KB): ' + url);
        return cachedFont;
      }
      console.warn('[font-loader] HTTP ' + resp.status + ' for: ' + url);
    } catch (e) {
      console.warn('[font-loader] Failed: ' + url, e.message);
    }
  }

  throw new Error('Cannot load Chinese font from any source');
}
