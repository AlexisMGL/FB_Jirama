// Dès que ce script s'exécute (car on est sur la bonne URL)
chrome.runtime.sendMessage({ action: "notify" });

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
      const imgs = post.querySelectorAll('img');
      for (const img of imgs) {
        const alt = (img.getAttribute('alt') || '').toLowerCase();
        const src = (img.getAttribute('src') || '').toLowerCase();
        if (/d[eé]lestage/.test(alt) || /d[eé]lestage/.test(src)) {
          chrome.runtime.sendMessage({ action: 'notifyDelestage' });
          return; // On notifie une seule fois
        }
      }
    }
  }
}

// Laisse la page charger un peu avant de chercher les posts
setTimeout(checkDelestagePosts, 3000);

