// Lightweight OCR scanner focused on IVANDRY + time ranges, using screenshot fallback
(function () {
  const DEBUG = true;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  function log(...args) { if (DEBUG) console.debug('[JIRAMA-IV]', ...args); }
  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
  const dpr = () => window.devicePixelRatio || 1;

  // Throttled capture to respect MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND
  const CAP_INTERVAL_MS = 1200;
  let capBusy = false;
  let lastCap = 0;
  async function captureVisible() {
    // serialize and rate-limit
    while (capBusy || (Date.now() - lastCap) < CAP_INTERVAL_MS) {
      await wait(200);
    }
    capBusy = true;
    try {
      return await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE' }, (resp) => {
          lastCap = Date.now();
          if (resp && resp.ok && resp.dataUrl) {
            if (DEBUG) log('captureVisible ok, dataUrl length', resp.dataUrl.length);
            resolve(resp.dataUrl);
          } else {
            if (DEBUG) log('captureVisible failed', resp);
            resolve(null);
          }
        });
      });
    } finally {
      capBusy = false;
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    });
  }

  async function ocrFromScreenshotRect(rect) {
    const dataUrl = await captureVisible();
    if (!dataUrl) return '';
    const shot = await loadImage(dataUrl);
    const scale = dpr();
    const sx = Math.max(0, Math.round(rect.left * scale));
    const sy = Math.max(0, Math.round(rect.top * scale));
    const sw = Math.max(1, Math.round(rect.width * scale));
    const sh = Math.max(1, Math.round(rect.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = sw; canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(shot, sx, sy, sw, sh, 0, 0, sw, sh);
    if (typeof OCRAD === 'function') {
      try {
        const text = OCRAD(canvas) || '';
        if (DEBUG) log('OCR length', text.length);
        return text;
      } catch (e) {
        if (DEBUG) log('OCR error', e);
        return '';
      }
    }
    return '';
  }

  function getArticles() {
    return Array.from(document.querySelectorAll('div[role="article"]'));
  }

  function getPostUrlFrom(el) {
    const article = el.closest('div[role="article"]') || el;
    const anchors = Array.from(article.querySelectorAll('a[href]'));
    const candidates = anchors
      .map(a => a.getAttribute('href'))
      .filter(href => href && (/\/posts\//.test(href) || /\/photos\//.test(href) || /permalink/.test(href) || /story_fbid/.test(href) || /fbid=/.test(href)));
    const href = candidates.find(h => h.startsWith('http')) || (candidates[0] ? new URL(candidates[0], location.origin).toString() : null);
    return href || null;
  }

  function computePostIdFromUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url, location.origin);
      const path = u.pathname;
      let m = path.match(/\/posts\/([0-9A-Za-z._-]+)/);
      if (m) return `posts:${m[1]}`;
      if (u.searchParams.get('fbid')) return `fbid:${u.searchParams.get('fbid')}`;
      if (u.searchParams.get('story_fbid')) return `story:${u.searchParams.get('story_fbid')}`;
      const segs = path.split('/').filter(Boolean);
      return segs.length ? `path:${segs[segs.length - 1]}` : url;
    } catch {
      return url;
    }
  }

  // Time range parsing
  function fmtTime(h, m) {
    const hh = String(parseInt(h, 10));
    const mi = m ? parseInt(m, 10) : NaN;
    return Number.isNaN(mi) ? `${hh}h` : (mi === 0 ? `${hh}h` : `${hh}h${String(mi).padStart(2,'0')}`);
  }

  function parseRanges(text) {
    const out = new Set();
    const time = '([01]?\\d|2[0-3])\\s*(?:[:hH]\\s*([0-5]?\\d))?';
    const sep = '(?:[-–—]|to|a|à|au)';
    const re = new RegExp(`${time}\\s*${sep}\\s*${time}`, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      const [, h1, m1, h2, m2] = m;
      out.add(`${fmtTime(h1, m1)}-${fmtTime(h2, m2)}`);
    }
    return Array.from(out);
  }

  // Robust variant using explicit Unicode escapes for separators (en dash/em dash/à)
  function parseRangesRobust(text) {
    const out = new Set();
    const time = '([01]?\\d|2[0-3])\\s*(?:[:hH]\\s*([0-5]?\\d))?';
    const sep = '(?:-|\\u2013|\\u2014|to|a|\\u00E0|au)';
    const re = new RegExp(`${time}\\s*${sep}\\s*${time}`, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      const [, h1, m1, h2, m2] = m;
      out.add(`${fmtTime(h1, m1)}-${fmtTime(h2, m2)}`);
    }
    return Array.from(out);
  }

  function toNotifHHMM(token) {
    const m = String(token || '').toLowerCase().match(/(\d{1,2})h(?:(\d{1,2}))?/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    let mi = m[2] ? parseInt(m[2], 10) : 0;
    if (Number.isNaN(h)) h = 0;
    if (Number.isNaN(mi)) mi = 0;
    const HH = String(Math.min(23, Math.max(0, h))).padStart(2, '0');
    const MM = String(Math.min(59, Math.max(0, mi))).padStart(2, '0');
    return `${HH}H${MM}`;
  }

  function toNotifRange(range) {
    const parts = String(range || '').split('-');
    if (parts.length !== 2) return null;
    const a = toNotifHHMM(parts[0]);
    const b = toNotifHHMM(parts[1]);
    if (!a || !b) return null;
    return `${a} ${b}`;
  }

  function toNotifHHMM(token) {
    const m = String(token || '').toLowerCase().match(/(\d{1,2})\s*[h:]\s*([0-5]?\d)?/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    let mi = m[2] ? parseInt(m[2], 10) : 0;
    if (Number.isNaN(h)) h = 0;
    if (Number.isNaN(mi)) mi = 0;
    const HH = String(Math.min(23, Math.max(0, h))).padStart(2, '0');
    const MM = String(Math.min(59, Math.max(0, mi))).padStart(2, '0');
    return `${HH}H${MM}`;
  }

  function toNotifRange(range) {
    const parts = String(range || '').split('-');
    if (parts.length !== 2) return null;
    const a = toNotifHHMM(parts[0]);
    const b = toNotifHHMM(parts[1]);
    if (!a || !b) return null;
    return `${a} ${b}`;
  }

  function parseTwoTimes(text) {
    // Extract two standalone times when there's no explicit dash/à (e.g., "05H00 09H30")
    const re = /\b([01]?\d|2[0-3])\s*[hH:]\s*([0-5]?\d)?\b/g;
    const toks = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const t = toNotifHHMM(m[0]);
      if (t) toks.push(t);
      if (toks.length >= 2) break;
    }
    if (toks.length >= 2) return `${toks[0]} ${toks[1]}`;
    return null;
  }

  function normalizeOcrForTimes(s) {
    // Normalize common OCR confusions for digits and separators
    return String(s || '')
      .replace(/[\u2013\u2014]/g, '-') // en/em dash to hyphen
      .replace(/[Oo]/g, '0')            // O,o -> 0
      .replace(/[Il]/g, '1')            // I,l -> 1
      .replace(/S/g, '5');              // S -> 5
  }

  function visibleEnough(img) {
    const r = img.getBoundingClientRect();
    return r.width >= 180 && r.height >= 180 && r.bottom > 0 && r.top < window.innerHeight;
  }

  const seen = new WeakSet();
  let viewerAttempted = false;

  function isLikelyPostPage() {
    try {
      const u = new URL(location.href);
      const p = u.pathname || '';
      const q = u.search || '';
      return /\/(posts|photos)\//.test(p) || /fbid=|story_fbid=|permalink/.test(p + q);
    } catch { return false; }
  }

  // Identify the main post element to constrain scanning and clicks
  function getMainPostArticle() {
    const arts = Array.from(document.querySelectorAll('div[role="article"]'));
    if (!arts.length) return null;
    let best = null, bestScore = -1;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    for (const a of arts) {
      const r = a.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(0, r.left));
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(0, r.top));
      const area = w * h;
      if (area > bestScore) { bestScore = area; best = a; }
    }
    return best || arts[0];
  }

  function getArticleImages(article) {
    if (!article) return [];
    const imgs = Array.from(article.querySelectorAll('img[src]'));
    return imgs.filter((img) => {
      const r = img.getBoundingClientRect();
      const w = img.naturalWidth || r.width || 0;
      const h = img.naturalHeight || r.height || 0;
      return w >= 160 && h >= 160;
    });
  }

  function isViewerOpen() {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], div[aria-modal="true"]'));
    for (const d of dialogs) {
      const imgs = d.querySelectorAll('img[src]');
      if (imgs && imgs.length) return d;
    }
    return null;
  }

  function getLargestImageIn(root) {
    const imgs = Array.from(root.querySelectorAll('img[src]'));
    let best = null, bestArea = 0;
    for (const i of imgs) {
      const r = i.getBoundingClientRect();
      const area = Math.max(0, r.width) * Math.max(0, r.height);
      if (area > bestArea) { bestArea = area; best = i; }
    }
    return best;
  }

  function isPhotoUrl() {
    const href = location.href;
    try {
      const u = new URL(href);
      const p = u.pathname || '';
      return /\/photo(s)?(\/|$)/i.test(p) || /photo\.php/i.test(p);
    } catch { return /\/photo(s)?(\/|$)/i.test(href) || /photo\.php/i.test(href); }
  }

  function findMainPhotoImg() {
    // Prefer explicit media-vc-image
    let imgs = Array.from(document.querySelectorAll('img[data-visualcompletion="media-vc-image"]'));
    if (!imgs.length) imgs = Array.from(document.querySelectorAll('img[src]'));
    let best = null, bestArea = 0;
    for (const img of imgs) {
      const r = img.getBoundingClientRect();
      const area = Math.max(0, r.width) * Math.max(0, r.height);
      if (area > bestArea) { bestArea = area; best = img; }
    }
    return best;
  }

  async function checkPhotoForIvandryOnce() {
    if (!isPhotoUrl()) return false;
    // load target district from settings (default IVANDRY)
    let district = 'IVANDRY';
    try { const o = await chrome.storage.local.get('districtQuery'); if (o && typeof o.districtQuery === 'string' && o.districtQuery.trim()) district = o.districtQuery.trim(); } catch {}
    const districtUpper = district.toUpperCase();
    const img = findMainPhotoImg();
    if (!img) return null; // signal not ready yet
    const alt = img.alt || '';
    const altUpper = alt.toUpperCase();
    // FAST PATH: parse directly from ALT if district is present (no OCR)
    if (altUpper.includes(districtUpper)) {
      const altNorm = normalizeOcrForTimes(alt);
      let timesStr = parseTwoTimes(altNorm);
      if (!timesStr) {
        const altRanges = parseRangesRobust(altNorm).map(toNotifRange).filter(Boolean);
        if (altRanges.length) timesStr = altRanges[0];
      }
      const postUrl = location.href;
      const postId = computePostIdFromUrl(postUrl);
      if (timesStr) {
        try { chrome.runtime.sendMessage({ type: 'IVANDRY_PRESENCE', postId, postUrl, present: true, timesStr, district }); } catch {}
        log('District presence via ALT', { district, timesStr });
        return true;
      }
      // Minimal OCR fallback only if alt has district but no hours
      try { img.scrollIntoView({ block: 'center' }); } catch {}
      const r = img.getBoundingClientRect();
      const leftQuick = await ocrFromScreenshotRect({ left: r.left, top: r.top, width: Math.max(1, r.width * 0.42), height: r.height });
      const normLeft = normalizeOcrForTimes(leftQuick || '');
      let tQuick = parseTwoTimes(normLeft);
      if (!tQuick) {
        const rQuick = parseRangesRobust(normLeft).map(toNotifRange).filter(Boolean);
        if (rQuick.length) tQuick = rQuick[0];
      }
      try { chrome.runtime.sendMessage({ type: 'IVANDRY_PRESENCE', postId, postUrl, present: !!tQuick, timesStr: tQuick || undefined, district }); } catch {}
      log('District presence via OCR quick', { district, tQuick });
      return !!tQuick;
    }
    // ALT does not contain district -> return quickly for speed
    const postUrl = location.href;
    const postId = computePostIdFromUrl(postUrl);
    try { chrome.runtime.sendMessage({ type: 'IVANDRY_PRESENCE', postId, postUrl, present: false, district }); } catch {}
    log('District not present in ALT', { district });
    return false;
  }

  async function ensurePhotoPresenceNotified(maxTries = 10) {
    for (let i = 0; i < maxTries; i++) {
      const res = await checkPhotoForIvandryOnce();
      if (res !== null) return; // notification sent
      await wait(500);
    }
    // If never found an image, still notify 'pas présent'
    const postUrl = location.href;
    const postId = computePostIdFromUrl(postUrl);
    try { chrome.runtime.sendMessage({ type: 'IVANDRY_PRESENCE', postId, postUrl, present: false }); } catch {}
  }

  async function openViewerFromImage(img, article) {
    const before = isViewerOpen();
    // Only click within the same article and avoid anchors to prevent navigation to other posts
    let el = img;
    let target = null;
    while (el && el !== article && el !== document.body) {
      if (el instanceof HTMLElement && (el.getAttribute('role') === 'button' || el.matches('div[role="button"]'))) { target = el; break; }
      if (el.tagName && el.tagName.toLowerCase() === 'a') { break; }
      el = el.parentElement;
    }
    try { (target || img).dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch {}
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) {
      const dlg = isViewerOpen();
      if (dlg && dlg !== before) return dlg;
      await wait(150);
    }
    return null;
  }

  async function closeViewer() {
    const dlg = isViewerOpen();
    if (!dlg) return;
    const btn = dlg.querySelector('div[aria-label*="Fermer" i], div[aria-label*="Close" i], [aria-label*="Fermer" i]');
    if (btn) { try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch {} }
    else { try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch {} }
    await wait(200);
  }

  async function viewerNext() {
    const dlg = isViewerOpen();
    if (!dlg) return false;
    const btn = dlg.querySelector('[aria-label*="Suivant" i], [aria-label*="Next" i]');
    if (btn) {
      try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch {}
    } else {
      try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); } catch {}
    }
    await wait(350);
    return true;
  }

  async function ocrViewerCurrentImage() {
    const dlg = isViewerOpen();
    if (!dlg) return { text: '', left: '' };
    const img = getLargestImageIn(dlg);
    if (!img) return { text: '', left: '' };
    const r = img.getBoundingClientRect();
    const text = await ocrFromScreenshotRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    const left = await ocrFromScreenshotRect({ left: r.left, top: r.top, width: r.width * 0.42, height: r.height });
    return { text: text || '', left: left || '' };
  }

  async function scanViewerFromImage(img, maxSlides = 12, article = null) {
    if (viewerAttempted && !isViewerOpen()) return false;
    const dlg = await openViewerFromImage(img, article || getMainPostArticle());
    if (!dlg) { if (DEBUG) log('Viewer did not open'); return false; }
    if (DEBUG) log('Viewer opened');
    let found = false;
    for (let i = 0; i < maxSlides; i++) {
      const { text, left } = await ocrViewerCurrentImage();
      const all = (text + '\n' + left).trim();
      if (!all) { if (DEBUG) log('Viewer OCR empty on slide', i + 1); }
      const hasDistrict = all.toUpperCase().includes('IVANDRY');
      const ranges = parseRangesRobust(all);
      if (hasDistrict && ranges.length) {
        const timesStr = ranges.length === 1 ? ranges[0] : (ranges.length === 2 ? `${ranges[0]} et ${ranges[1]}` : ranges.slice(0,-1).join(', ') + ' et ' + ranges[ranges.length-1]);
        const postUrl = location.href;
        const postId = computePostIdFromUrl(postUrl || location.href + '#' + Math.random().toString(36).slice(2));
        chrome.runtime.sendMessage({
          type: 'DEL_EST_FOUND',
          postId,
          postUrl,
          snippet: 'IVANDRY (viewer)',
          timesStr
        });
        log('IVANDRY detected in viewer', { timesStr, postUrl });
        found = true;
        break;
      }
      await viewerNext();
    }
    await closeViewer();
    return found;
  }

  async function processImage(img, idx, total) {
    if (seen.has(img)) return false; seen.add(img);
    try { img.scrollIntoView({ block: 'center' }); } catch {}
    if (DEBUG) log(`Scanning image ${idx + 1}/${total}`);
    await wait(250);
    const r = img.getBoundingClientRect();
    const t = (await ocrFromScreenshotRect({ left: r.left, top: r.top, width: r.width, height: r.height })) || '';
    if (!t) { if (DEBUG) log('Empty OCR from full image'); return false; }
    if (!t.toUpperCase().includes('IVANDRY')) { if (DEBUG) log('No IVANDRY in full OCR'); return false; }
    // left band for hours
    const left = await ocrFromScreenshotRect({ left: r.left, top: r.top, width: r.width * 0.42, height: r.height });
    const ranges = parseRangesRobust(t + '\n' + (left || ''));
    if (!ranges.length) { if (DEBUG) log('No time ranges found'); return false; }
    const timesStr = ranges.length === 1 ? ranges[0] : (ranges.length === 2 ? `${ranges[0]} et ${ranges[1]}` : ranges.slice(0,-1).join(', ') + ' et ' + ranges[ranges.length-1]);
    const postUrl = getPostUrlFrom(img);
    const postId = computePostIdFromUrl(postUrl || location.href + '#' + Math.random().toString(36).slice(2));
    chrome.runtime.sendMessage({
      type: 'DEL_EST_FOUND',
      postId,
      postUrl,
      snippet: 'Image délestage (IVANDRY)',
      timesStr
    });
    log('IVANDRY detected with times', { timesStr, postUrl });
    return true;
  }

  async function scan(force) {
    const article = getMainPostArticle();
    const imgs = article ? getArticleImages(article) : Array.from(document.querySelectorAll('img[src]'));
    const MAX_PER_SCAN = 12; // scan up to 12 images per pass
    let scanned = 0;
    const total = imgs.length;
    if (DEBUG) log(`Found ${total} images on page`);
    for (const img of imgs) {
      if (!force && !visibleEnough(img)) continue;
      let done = await processImage(img, scanned, total);
      if (!done) {
        if (force || isLikelyPostPage()) {
          try {
            viewerAttempted = true;
            done = await scanViewerFromImage(img, 12, article || null);
          } catch (e) { if (DEBUG) log('scanViewerFromImage error', e); }
        }
      }
      scanned++;
      if (done) return; // one notification is enough
      if (scanned >= MAX_PER_SCAN) break;
    }
    if (DEBUG) log(`Scan pass done. Scanned ${scanned}/${total} visible images.`);
  }

  function observe() {
    const obs = new MutationObserver(() => {
      if (observe._t) clearTimeout(observe._t);
      observe._t = setTimeout(scan, 800);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // If on a single photo URL, check presence immediately
  if (isPhotoUrl()) {
    setTimeout(() => { ensurePhotoPresenceNotified(12); }, 1000);
  } else if (isLikelyPostPage()) {
    setTimeout(() => scan(false), 1500);
    observe();
  }

  // Re-notify when URL changes within SPA (next/prev photo changes URL without full reload)
  (function setupUrlChangeWatcher() {
    let lastHref = location.href;
    let t;
    function handleChange() {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        if (location.href !== lastHref) {
          lastHref = location.href;
          if (isPhotoUrl()) {
            ensurePhotoPresenceNotified(8);
          }
        }
      }, 150);
    }
    try {
      const origPush = history.pushState;
      history.pushState = function() { const r = origPush.apply(this, arguments); handleChange(); return r; };
      const origReplace = history.replaceState;
      history.replaceState = function() { const r = origReplace.apply(this, arguments); handleChange(); return r; };
    } catch {}
    window.addEventListener('popstate', handleChange);
    // Poll fallback in case above hooks are blocked
    setInterval(() => { if (location.href !== lastHref) handleChange(); }, 1000);
  })();
  // Allow background to force a scan when a specific post is opened
  try {
    chrome.runtime.onMessage.addListener((req) => {
      if (req && req.type === 'IV_SCAN_NOW') {
        if (DEBUG) log('Forced scan requested');
        setTimeout(() => scan(true), 200);
        return;
      }
      if (req && req.type === 'COUNT_IVANDRY_NOW') {
        if (DEBUG) log('Count IVANDRY requested');
        (async () => {
          const article = getMainPostArticle();
          let count = 0;
          if (article) {
            const imgs = getArticleImages(article);
            if (imgs.length) {
              // Prefer counting via viewer so we include hidden slides
              const dlg = await openViewerFromImage(imgs[0], article);
              if (dlg) {
                for (let i = 0; i < 12; i++) {
                  const { text, left } = await ocrViewerCurrentImage();
                  const all = (text + '\n' + left).toUpperCase();
                  if (all.includes('IVANDRY')) count++;
                  const moved = await viewerNext();
                  if (!moved) break;
                }
                await closeViewer();
              } else {
                // Fallback: inline OCR of images within the article
                for (const img of imgs.slice(0, 12)) {
                  try {
                    img.scrollIntoView({ block: 'center' });
                  } catch {}
                  await wait(250);
                  const r = img.getBoundingClientRect();
                  const t = (await ocrFromScreenshotRect({ left: r.left, top: r.top, width: r.width, height: r.height })) || '';
                  const l = (await ocrFromScreenshotRect({ left: r.left, top: r.top, width: r.width * 0.42, height: r.height })) || '';
                  if ((t + '\n' + l).toUpperCase().includes('IVANDRY')) count++;
                }
              }
            }
          }
          try { chrome.runtime.sendMessage({ type: 'IVANDRY_COUNT_RESULT', count }); } catch {}
        })();
      }
    });
  } catch {}
})();
