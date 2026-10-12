# Pharmacy Date Calculator

A free, offline-capable PWA for pharmacists and hospital staff. Pick a start date,
enter the number of containers × tablets per container, tap Calculate, and you
instantly see the date the supply runs out.

No accounts, no ads, no tracking, no patient data ever leaves your device.

- Works fully offline after the first visit
- Installs to your phone's home screen like an app
- Large type, big buttons, high contrast — designed for busy staff (including
  older users who aren't tech-savvy)
- Plain-English proof line under every result so you can double-check in one
  glance
- Calendar-correct (leap years, 28/29/30/31-day months, time-zone safe — uses
  pure UTC day math, no millisecond hacks)
- Auto / Light / Dark theme
- Recent history (last 10, stored locally only; one tap to clear)

## Files

```
pharmacy-date-calculator/
├── index.html              App page
├── styles.css              All styles (light + dark themes)
├── app.js                  UI logic (no frameworks)
├── dateMath.js             Pure date math (no DOM, testable in Node)
├── sw.js                   Service worker (cache-first offline)
├── manifest.webmanifest    PWA manifest
├── icons/
│   ├── icon-192.png        192×192 app icon
│   ├── icon-512.png        512×512 app icon
│   └── icon-maskable-512.png  512×512 maskable icon (Android)
├── tests/
│   └── run-tests.js        Automated test suite (plain Node, no deps)
├── generate-icons.js       Standalone script that regenerates icons
└── README.md               This file
```

## Running the tests

Plain Node, nothing to install:

```
node tests/run-tests.js
```

All 36 tests must pass. The suite covers:

- Day addition across months, leap years, year boundaries
- Calendar-month addition with end-of-month clamping (31 Jan → 29 Feb)
- Day subtraction
- The `A × B` quantity convention (2 × 60 = 120 tablets = 120 days)
- "Count start day" shifts result by one day
- Tablets-per-day division with rounding down and remainder note
- Invalid, empty, zero, non-integer, and very large inputs fail gracefully
- ISO date parsing, round-trip formatting, Feb 29 validation
- Long/short/weekday date formatting

## Hosting it for free

The app is a fully static folder — upload it to any static host.

**GitHub Pages (free, recommended):**
1. Create a GitHub repository.
2. Upload this entire folder to the repo.
3. In the repo, go to **Settings → Pages** and set the source to the
   `main` branch (root folder).
4. In 1–2 minutes your app is live at
   `https://<your-username>.github.io/<repo-name>/`.

**Netlify Drop (free, fastest):**
1. Go to https://app.netlify.com/drop
2. Drag the `pharmacy-date-calculator` folder onto the page. Done.

**Cloudflare Pages / Vercel / any static host:**
Point them at the folder; no build step, no server config needed.

All paths are relative, so the app works correctly even if hosted at a
subfolder URL (e.g. `https://example.com/tools/pharmacy/`).

## Installing it on a phone

The app must be served over HTTPS (all of the hosts above do this).

**Android (Chrome / Edge):**
1. Visit the hosted URL in Chrome.
2. After the page loads, tap the ⋮ menu → **Add to Home screen** / **Install app**.
3. The icon appears on your home screen and opens full-screen like a native app.

**iPhone / iPad (Safari):**
1. Visit the hosted URL in Safari.
2. Tap the share icon (square with an up arrow) at the bottom.
3. Tap **Add to Home Screen**, then tap **Add**.
4. The icon appears on your home screen and works offline once opened once.

After the first visit the app is fully cached and works without any internet
connection.

## Shipping an update

1. Bump the `APP_VERSION` constant in **two** places:
   - `dateMath.js` → `const APP_VERSION = '1.0.1';`
   - `sw.js` → `const APP_VERSION = '1.0.1';`
2. Deploy the new files to your host (e.g. push to GitHub).
3. When existing users next open the app, they'll see a calm banner across the
   top: **"Update available. Tap to refresh."** Tapping it activates the new
   version immediately. No forced reload mid-calculation; users stay in control.

Always bump the version on every deploy; the service worker uses the version as
its cache name, so a new version string triggers an update.

## Privacy

- No network requests after the first load (all assets are cached by the
  service worker).
- No analytics, no ads, no third-party scripts.
- Recent history is stored in your browser's `localStorage` and never uploaded
  anywhere. It never contains patient-identifying data — just dates and
  quantities. Tap **Clear** at the bottom of the history list at any time to
  wipe it.
- Only two preferences are remembered between visits: which theme you chose and
  whether you had advanced options open. Quantities always reset to 1 × 30 on
  reload, as a safety measure.

## Keyboard note (Enter key)

Pressing **Enter** while in any field (start date, containers, tablets per
container, or tablets per day) triggers calculation — same as tapping the
Calculate button.
