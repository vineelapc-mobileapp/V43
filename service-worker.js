const CACHE_NAME = 'eee-practice-v73';
const ASSETS = [
  './',
  './home.html',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './manifest-upload.json',
  './data/questions.json',
  './data/config.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-teacher-192.png',
  './icons/icon-teacher-512.png',
  './upload.html',
  './upload.js',
  './libs/pdfjs/pdf.min.mjs',
  './libs/pdfjs/pdf.worker.min.mjs',
  './libs/mammoth/mammoth.browser.min.js',
  './libs/tesseract/tesseract.min.js',
  './libs/tesseract/worker.min.js',
  './libs/tesseract/tesseract-core-simd-lstm.wasm',
  './libs/tesseract/tesseract-core-simd-lstm.wasm.js',
  './libs/tesseract/eng.traineddata.gz',
  './libs/pptxgenjs/pptxgen.bundle.js',
  './libs/katex/katex.min.js',
  './libs/katex/katex.min.css',
  './libs/katex/auto-render.min.js',
  './libs/katex/fonts/KaTeX_AMS-Regular.woff',
  './libs/katex/fonts/KaTeX_AMS-Regular.woff2',
  './libs/katex/fonts/KaTeX_Caligraphic-Bold.woff',
  './libs/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  './libs/katex/fonts/KaTeX_Caligraphic-Regular.woff',
  './libs/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  './libs/katex/fonts/KaTeX_Fraktur-Bold.woff',
  './libs/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  './libs/katex/fonts/KaTeX_Fraktur-Regular.woff',
  './libs/katex/fonts/KaTeX_Fraktur-Regular.woff2',
  './libs/katex/fonts/KaTeX_Main-Bold.woff',
  './libs/katex/fonts/KaTeX_Main-Bold.woff2',
  './libs/katex/fonts/KaTeX_Main-BoldItalic.woff',
  './libs/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  './libs/katex/fonts/KaTeX_Main-Italic.woff',
  './libs/katex/fonts/KaTeX_Main-Italic.woff2',
  './libs/katex/fonts/KaTeX_Main-Regular.woff',
  './libs/katex/fonts/KaTeX_Main-Regular.woff2',
  './libs/katex/fonts/KaTeX_Math-BoldItalic.woff',
  './libs/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  './libs/katex/fonts/KaTeX_Math-Italic.woff',
  './libs/katex/fonts/KaTeX_Math-Italic.woff2',
  './libs/katex/fonts/KaTeX_SansSerif-Bold.woff',
  './libs/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  './libs/katex/fonts/KaTeX_SansSerif-Italic.woff',
  './libs/katex/fonts/KaTeX_SansSerif-Italic.woff2',
  './libs/katex/fonts/KaTeX_SansSerif-Regular.woff',
  './libs/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  './libs/katex/fonts/KaTeX_Script-Regular.woff',
  './libs/katex/fonts/KaTeX_Script-Regular.woff2',
  './libs/katex/fonts/KaTeX_Size1-Regular.woff',
  './libs/katex/fonts/KaTeX_Size1-Regular.woff2',
  './libs/katex/fonts/KaTeX_Size2-Regular.woff',
  './libs/katex/fonts/KaTeX_Size2-Regular.woff2',
  './libs/katex/fonts/KaTeX_Size3-Regular.woff',
  './libs/katex/fonts/KaTeX_Size3-Regular.woff2',
  './libs/katex/fonts/KaTeX_Size4-Regular.woff',
  './libs/katex/fonts/KaTeX_Size4-Regular.woff2',
  './libs/katex/fonts/KaTeX_Typewriter-Regular.woff',
  './libs/katex/fonts/KaTeX_Typewriter-Regular.woff2'
];

// ---------------------------------------------------------------------
// Install: pre-cache the app so it works offline - but tolerate a bad or
// missing file. Previously cache.addAll() failed the WHOLE install if any
// one of ~70 files was missing, which silently left students stuck on an
// old cached version forever. Files are also fetched with cache:'reload'
// so a stale browser-cached copy is never pre-cached by mistake.
// ---------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) =>
        fetch(new Request(url, { cache: 'reload' }))
          .then((res) => { if (res && res.ok) return cache.put(url, res); })
          .catch(() => {})
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(
      (r) => { clearTimeout(t); resolve(r); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

// Key by path only, so index.html?tab=subjects and index.html share one entry.
function cacheKey(url) { return url.origin + url.pathname; }

// App shell (pages, app.js, style.css, JSON): network-first, so anything you
// publish to GitHub shows up the next time a student opens the app online.
// Offline, or if the network is slow (4s) or answers with an error page, the
// last good cached copy is used instead - never a broken half-loaded page.
async function networkFirst(req, url) {
  const key = cacheKey(url);
  const cache = await caches.open(CACHE_NAME);
  try {
    // cache:'no-cache' = always ask the server whether the file changed (cheap 304 if not),
    // so the browser's own HTTP cache (10 min on GitHub Pages) can't hide a fresh upload.
    const res = await fetchWithTimeout(new Request(req, { cache: 'no-cache' }), 4000);
    if (res && res.ok) { cache.put(key, res.clone()); return res; }
    const cached = await caches.match(key, { ignoreVary: true });
    return cached || res;
  } catch (err) {
    const cached = await caches.match(key, { ignoreVary: true });
    if (cached) return cached;
    throw err;
  }
}

// Heavy static files that never change (libs, icons, fonts): cache-first.
async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok && res.type === 'basic') {
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Cloudinary etc: straight to the network
  const isShell = req.mode === 'navigate' ||
    (/\.(html|js|css|json)$/.test(url.pathname) && !url.pathname.includes('/libs/'));
  event.respondWith(isShell ? networkFirst(req, url) : cacheFirst(req));
});
