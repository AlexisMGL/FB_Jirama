// Dès que ce script s'exécute (car on est sur la bonne URL)
chrome.runtime.sendMessage({ action: "notify" });

// Liste des mots-clés à détecter
// Ajout de termes malgaches pour détecter les posts sur le délestage
// "fahatapahan-jiro" ou variantes sans tiret/espaces
const KEYWORDS = [
  /d[eé]lestage/i,
  /d[eé]lester/i,
  /fahatapahan[- ]?jiro/i
];

// Vérifie la présence d'un post de délestage récent
async function checkDelestagePosts() {
  console.debug('Recherche des posts de délestage...');
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
      console.debug('Analyse du texte du post', text.substring(0, 30));
      if (KEYWORDS.some((regex) => regex.test(text))) {
        console.debug('Mot clé trouvé dans le texte');
        chrome.runtime.sendMessage({ action: 'notifyDelestage' });
        return;
      }

      // Puis cherche dans les images éventuelles
      const imgs = post.querySelectorAll('img');
      for (const img of imgs) {
        const alt = img.getAttribute('alt') || '';
        const src = img.getAttribute('src') || '';
        console.debug('Analyse de l\'image', { alt, src });
        if (KEYWORDS.some((regex) => regex.test(alt) || regex.test(src))) {
          console.debug('Mot clé trouvé dans l\'image');
          chrome.runtime.sendMessage({ action: 'notifyDelestage' });
          return; // On notifie une seule fois
        }

        // Tentative de reconnaissance du template JIRAMA
        try {
          if (await isDelestageTemplate(img)) {
            console.debug('Template d\'image JIRAMA détecté');
            chrome.runtime.sendMessage({ action: 'notifyDelestage' });
            return;
          }
        } catch (e) {
          console.debug('Erreur lors de l\'analyse de l\'image', e);
        }
      }
    }
  }
}

// Analyse approximative des couleurs du template officiel JIRAMA
function isDelestageTemplate(img) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(false);
        return;
      }
      ctx.drawImage(image, 0, 0);
      const sample = (x, y) => {
        const data = ctx.getImageData(x, y, 1, 1).data;
        return { r: data[0], g: data[1], b: data[2] };
      };

      // Points de contrôle relatifs
      const w = image.width;
      const h = image.height;
      const topLeft = sample(Math.floor(0.1 * w), Math.floor(0.1 * h));
      const topRight = sample(Math.floor(0.9 * w), Math.floor(0.1 * h));

      console.debug('Couleurs échantillonnées', { topLeft, topRight });

      // Couleur orange (en-tête) et bleu (date) approximatives
      const isOrange = topLeft.r > 200 && topLeft.g > 100 && topLeft.b < 80;
      const isBlue = topRight.b > 150 && topRight.r < 100 && topRight.g < 150;

      resolve(isOrange && isBlue);
    };
    image.onerror = () => resolve(false);
    image.src = img.src;
  });
}

// Laisse la page charger un peu avant de chercher les posts
setTimeout(() => {
  checkDelestagePosts();
}, 3000);

