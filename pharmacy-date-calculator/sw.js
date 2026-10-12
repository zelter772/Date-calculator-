/**
 * sw.js — Service Worker for Pharmacy Date Calculator.
 * Precaches all shell assets on install and serves cache-first for bulletproof offline.
 * Handles flaky/metered/"cellular on but no internet" cases: cached resources return
 * immediately without ever touching the network, so the app never stalls on a fetch.
 */

const APP_VERSION = '1.2.0';
const CACHE_NAME = `pharmacy-date-calc-v${APP_VERSION}`;
const OFFLINE_CACHE = `pharmacy-date-calc-offline-v${APP_VERSION}`;

// App shell: every URL required to render a working app screen.
// Paths are relative to the service worker location (relative paths work in subfolders).
const SHELL_ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'dateMath.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache assets individually — do NOT use addAll because a single failure
      // (e.g. one icon 404 on a host that doesn't serve one variant) would abort
      // the whole install. Cache what we can; fall back gracefully.
      const results = await Promise.allSettled(
        SHELL_ASSETS.map(url =>
          cache.add(new Request(url, { cache: 'reload' }))
            .catch(err => {
              // Try non-reload request as fallback (some CDNs behave oddly)
              return cache.add(url).catch(() => null);
            })
        )
      );
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null)).length;
      if (failed > 0 && failed < SHELL_ASSETS.length) {
        console.info(`[SW] Cached ${SHELL_ASSETS.length - failed}/${SHELL_ASSETS.length} shell assets on install`);
      }
      // Do NOT call skipWaiting here; the page controls activation via the update banner.
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => k.startsWith('pharmacy-date-calc-') && k !== CACHE_NAME && k !== OFFLINE_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/**
 * Determine if request is a navigation request (HTML document).
 */
function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
         (request.method === 'GET' &&
          request.headers.get('accept') &&
          request.headers.get('accept').includes('text/html'));
}

/**
 * Try to fetch with a short timeout. If it fails or times out, returns null.
 */
function fetchWithTimeout(request, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(null); }
    }, timeoutMs);
    fetch(request).then((resp) => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(resp); }
    }).catch(() => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Cache-first strategy for all same-origin GETs:
  // 1. Return cached response immediately if available (instant, no network dependency).
  // 2. Otherwise try the network with a tight timeout, and cache what we get.
  // 3. If network fails/timeout AND it's a navigation, fall back to cached index.html.
  event.respondWith(
    caches.match(req).then(async (cached) => {
      if (cached) {
        // Stale-while-revalidate: return cached response immediately, then update cache
        // in the background. If the background fetch fails (offline), no problem.
        fetchWithTimeout(req, 3000).then((networkResp) => {
          if (networkResp && networkResp.ok && networkResp.type === 'basic') {
            caches.open(CACHE_NAME).then(cache => cache.put(req, networkResp.clone()));
          }
        }).catch(() => { /* ignore */ });
        return cached;
      }

      // Not in cache — try the network (with timeout, so offline/LIE condition doesn't hang).
      const networkResp = await fetchWithTimeout(req, 3000);
      if (networkResp && networkResp.ok && networkResp.type === 'basic') {
        const clone = networkResp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
        return networkResp;
      }

      // Navigation requests offline: return cached root (index.html) so the app boots.
      if (isNavigationRequest(req)) {
        const fallback = await caches.match('./');
        if (fallback) return fallback;
        const fallbackHtml = await caches.match('index.html');
        if (fallbackHtml) return fallbackHtml;
      }

      // Last resort offline response
      if (isNavigationRequest(req)) {
        const offlineHtml = [
          "<!DOCTYPE html>",
          "<html><head><meta charset=\"utf-8\"><title>Offline</title>",
          "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
          "<style>",
          "body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f7f7f8;color:#111;padding:24px;text-align:center}",
          "h1{font-size:1.25rem;margin:0 0 8px}p{color:#6b7280;margin:0;max-width:320px;line-height:1.5}",
          "</style></head><body><div>",
          "<h1>You are offline</h1>",
          "<p>Please check your connection and try again. If this app was opened before, it will load once you reconnect.</p>",
          "</div></body></html>"
        ].join("");
        return new Response(offlineHtml, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }, status: 503 });
      }

      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
