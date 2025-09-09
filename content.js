// JIRAMA FB detector – content script (MV3)
// Détecte un post de délestage: <24h, plusieurs images, même template visuel.

(function () {
  const DEBUG = true;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  let alreadyNotifiedThisPage = false;

  const KEYWORDS = [
    /d[ée]lestage/i,
    /fahatapahan[- ]?jiro/i,
    /tournant/i
  ];

  function log(...args) {
    if (DEBUG) console.debug("[JIRAMA]", ...args);
  }

  // Charge les paramètres (keyword pour l’URL de la page)
  async function getSettings() {
    const defaults = { pageKeyword: "jirama" };
    try {
      const data = await chrome.storage.local.get("pageKeyword");
      return { pageKeyword: data.pageKeyword || defaults.pageKeyword };
    } catch {
      return defaults;
    }
  }

  function isOnTargetPage(pageKeyword) {
    const href = location.href.toLowerCase();
    const path = location.pathname.toLowerCase();
    return href.includes("facebook.com") && (path.includes(pageKeyword.toLowerCase()));
  }

  function textHasKeywords(text) {
    return KEYWORDS.some((re) => re.test(text));
  }

  function getArticles() {
    // Facebook utilise généralement des <div role="article"> pour chaque post
    return Array.from(document.querySelectorAll('div[role="article"]'));
  }

  function getPostUrl(article) {
    const anchors = Array.from(article.querySelectorAll('a[href]'));
    const candidates = anchors
      .map(a => a.getAttribute('href'))
      .filter(href => href && (/\/posts\//.test(href) || /\/photos\//.test(href) || /permalink/.test(href) || /story_fbid/.test(href) || /fbid=/.test(href)));
    // Renvoie la première URL absolue
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
      // fallback: last segment
      const segs = path.split('/').filter(Boolean);
      return segs.length ? `path:${segs[segs.length - 1]}` : url;
    } catch {
      return url;
    }
  }

  function extractRelativeTimeText(article) {
    // Cherche des éléments susceptibles de contenir le timestamp relatif
    const els = article.querySelectorAll('a, span, time, div');
    for (const el of els) {
      const t = (el.textContent || '').trim().toLowerCase();
      if (!t) continue;
      // modèles communs: "il y a 2 h", "2 h", "23 min"
      if (/(il y a\s*)?\d+\s*(h|heure|heures|min|minutes|m|s|sec|secondes)\b/.test(t)) {
        return t;
      }
    }
    return null;
  }

  function isWithin24h(article) {
    // 1) Essaye un élément time[datetime]
    const timeEl = article.querySelector('time[datetime]');
    if (timeEl) {
      const dt = timeEl.getAttribute('datetime');
      if (dt) {
        const ms = Date.parse(dt);
        if (!Number.isNaN(ms)) return (Date.now() - ms) <= ONE_DAY_MS;
      }
    }
    // 2) Ancien abbr[data-utime]
    const abbr = article.querySelector('abbr[data-utime]');
    if (abbr) {
      const utime = parseInt(abbr.getAttribute('data-utime') || '', 10);
      if (!Number.isNaN(utime)) return (Date.now() - utime * 1000) <= ONE_DAY_MS;
    }
    // 3) Texte relatif (français)
    const rel = extractRelativeTimeText(article);
    if (rel) {
      // Si mention de jours, on considère >24h
      if (/(\b|\s)(j|jour|jours|d)\b/.test(rel)) return false;
      // S'il y a des heures ou minutes, on considère <24h
      if (/(\b|\s)\d+\s*(h|heure|heures|min|minutes|m|s|sec|secondes)\b/.test(rel)) return true;
    }
    return false; // défaut conservateur
  }

  function getPostText(article) {
    // Texte global du post (peut inclure réactions, etc.)
    const t = (article.innerText || '').trim();
    return t.replace(/\s+/g, ' ');
  }

  function getCandidateImages(article) {
    const imgs = Array.from(article.querySelectorAll('img[src]'));
    return imgs.filter(img => {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      // Filtre avatars/icônes très petits
      if (w < 180 || h < 180) return false;
      // Évite les photos de profil, logos, etc.
      if (/photo de profil|profile|avatar|logo/.test(alt)) return false;
      return true;
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    });
  }

  async function topSignature(imgEl) {
    // Assure chargement
    const img = imgEl.complete && (imgEl.naturalWidth > 0)
      ? imgEl
      : await loadImage(imgEl.src);

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('Image size unknown');

    // Zone du haut (~12% de la hauteur, limitée à 80px)
    const cropH = Math.max(8, Math.min(80, Math.round(h * 0.12)));
    const canvas = document.createElement('canvas');
    const outW = 32, outH = 8;
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D ctx');
    ctx.drawImage(img, 0, 0, w, cropH, 0, 0, outW, outH);
    const data = ctx.getImageData(0, 0, outW, outH).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    return { r: r / n, g: g / n, b: b / n };
  }

  function colorDist(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  async function imagesShareTemplate(imgs) {
    if (imgs.length < 2) return false;
    // Prend max 4 images pour vitesse
    const subset = imgs.slice(0, 4);
    const sigs = [];
    for (const img of subset) {
      try {
        sigs.push(await topSignature(img));
      } catch (e) {
        log('Signature échouée pour une image', e);
      }
    }
    if (sigs.length < 2) return false;
    let maxD = 0;
    for (let i = 0; i < sigs.length; i++) {
      for (let j = i + 1; j < sigs.length; j++) {
        maxD = Math.max(maxD, colorDist(sigs[i], sigs[j]));
      }
    }
    // Seuil empirique: si les bandes hautes sont très proches,
    // on considère qu’il s’agit d’un même template.
    return maxD <= 35;
  }

  async function evaluateArticle(article) {
    if (!isWithin24h(article)) return false;

    const text = getPostText(article);
    const imgs = getCandidateImages(article);
    if (imgs.length < 2) {
      // Fallback: si texte contient mots-clés, accepte malgré peu d’images
      if (textHasKeywords(text)) return { reason: 'keywords', text };
      return false;
    }

    // Heuristique template visuel
    const sameTemplate = await imagesShareTemplate(imgs);
    if (sameTemplate || textHasKeywords(text)) {
      return { reason: sameTemplate ? 'template' : 'keywords', text };
    }
    return false;
  }

  async function scanOnce() {
    if (alreadyNotifiedThisPage) return;
    const settings = await getSettings();
    if (!isOnTargetPage(settings.pageKeyword)) {
      return;
    }
    const articles = getArticles();
    log(`Analyse de ${articles.length} posts…`);
    for (const a of articles) {
      try {
        const res = await evaluateArticle(a);
        if (res) {
          const postUrl = getPostUrl(a);
          const postId = computePostIdFromUrl(postUrl || location.href + '#' + Math.random().toString(36).slice(2));
          if (postId) {
            alreadyNotifiedThisPage = true; // évite spam
            const snippet = (res.text || '').slice(0, 200);
            chrome.runtime.sendMessage({
              type: 'DEL_EST_FOUND',
              postId,
              postUrl,
              snippet
            });
            log('Post de délestage détecté', { reason: res.reason, postUrl });
            break;
          }
        }
      } catch (e) {
        log('Erreur évaluation post:', e);
      }
    }
  }

  function observeFeed() {
    const root = document.body;
    const obs = new MutationObserver(() => {
      // Débounce léger
      if (observeFeed._t) clearTimeout(observeFeed._t);
      observeFeed._t = setTimeout(scanOnce, 800);
    });
    obs.observe(root, { childList: true, subtree: true });
  }

  // Démarrage
  setTimeout(scanOnce, 1200);
  observeFeed();
})();

