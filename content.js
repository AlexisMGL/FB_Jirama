// Dès que ce script s'exécute (car on est sur la bonne URL)
chrome.runtime.sendMessage({ action: "notify" });

// Liste des mots-clés à détecter
const KEYWORDS = [/d[eé]lestage/i, /d[eé]lester/i];

// Vérifie la présence d'un post de délestage récent
function checkDelestagePosts() {
  const now = Date.now();
  // Sélection des posts du flux
  const posts = document.querySelectorAll('div[data-pagelet^="FeedUnit_"]');

  for (const post of posts) {
    const abbr = post.querySelector('abbr[data-utime]');
    if (!abbr) continue;

    const utime = parseInt(abbr.getAttribute('data-utime'), 10) * 1000;
    if (Number.isNaN(utime)) continue;

    // 24h = 24 * 60 * 60 * 1000 ms
    if (now - utime <= 24 * 60 * 60 * 1000) {
      // Vérifie d'abord le texte du post
      const text = (post.innerText || '');
      if (KEYWORDS.some((regex) => regex.test(text))) {
        chrome.runtime.sendMessage({ action: 'notifyDelestage' });
        return;
      }

      // Puis cherche dans les images éventuelles
      const imgs = post.querySelectorAll('img');
      for (const img of imgs) {
        const alt = img.getAttribute('alt') || '';
        const src = img.getAttribute('src') || '';
        if (KEYWORDS.some((regex) => regex.test(alt) || regex.test(src))) {
          chrome.runtime.sendMessage({ action: 'notifyDelestage' });
          return; // On notifie une seule fois
        }
      }
    }
  }
}

// Laisse la page charger un peu avant de chercher les posts
setTimeout(checkDelestagePosts, 3000);

