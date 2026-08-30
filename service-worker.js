const CACHE_NAME = 'eee-practice-v48';
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
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

self.addEventListener('fetch', (event) => {
  // Network-first for questions.json so new content shows up when online,
  // fall back to cache when offline.
  if (event.request.url.includes('questions.json')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
