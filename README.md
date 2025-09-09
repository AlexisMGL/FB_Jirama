Jirama FB Notifier · Extension Chrome/Brave/Edge ⚡️

Petit utilitaire qui surveille les publications Facebook liées aux délestages et vous notifie dès qu’un horaire intéressant apparaît sur une image (ex: IVANDRY). Il sait aussi scanner les pages photos individuellement (visionneuse) et fonctionne avec des lieux personnalisés.

— — —

🌟 Fonctionnalités
- 🔔 Notifications claires: “DELESTAGE {LIEU} : 05H00 09H30” (cliquable pour ouvrir la publication).
- 🖼️ Lecture d’image rapide: lit d’abord l’attribut alt des images Facebook (souvent très fiable), puis OCR minimal si nécessaire.
- 📸 Visionneuse prise en charge: détecte les changements d’URL (suivant/précédent) sans rechargement de page et renvoie une nouvelle notification à chaque photo.
- 🎯 Lieu paramétrable: choisissez le secteur à suivre (ex: IVANDRY, MARAIS MASAY, AMBOHIJATOVO, LA CITY…).
- 🧠 Heuristiques feed: sur les posts du fil, tente un repérage par mots-clés + similarité visuelle du template.
- 🛡️ Anti-spam: déduplication des notifications par ID de post + nettoyage automatique.

🧭 Comment ça marche (vue d’ensemble)
1) Sur les pages “photo” Facebook (`/photo` ou `photo.php`) l’extension:
   - repère l’image principale, lit son `alt` pour chercher le lieu et les horaires (ultra-rapide),
   - si l’horaire n’est pas dans `alt` mais le lieu oui, fait un OCR ciblé de la bande de gauche pour extraire “HHHMM HHMM”,
   - envoie une notification pour chaque photo visitée (y compris quand on passe à la suivante via la visionneuse).
2) Sur les pages de posts, un détecteur plus “large” essaie d’identifier les posts récents au template officiel et notifie si pertinent.

🧪 Parsing des horaires
- Formats reconnus: `05h00-09h30`, `05:00–09:30`, `05h-9h30`, `05H00 09H30` (deux heures contiguës), `05h à 09h30`, etc.
- Normalisation anti-erreur OCR: conversion des confusions courantes (O→0, I/l→1, S→5, —/–→-) puis format sortant “HHHMM HHMM”.

📦 Installation (mode développeur)
1. Ouvrez `chrome://extensions` (ou `edge://extensions`, `brave://extensions`).
2. Activez le “Mode développeur”.
3. Cliquez “Charger l’extension non empaquetée” et sélectionnez ce dossier.
4. L’extension apparaît avec son icône; cliquez sur “Options” pour ajuster les paramètres.

⚙️ Options
- `Mot-clé d’URL`: active les scripts seulement si l’URL contient ce mot (par défaut `jirama`).
- `Lieu à rechercher`: nom du secteur à détecter sur les images (par défaut `IVANDRY`).
  - Exemples: `IVANDRY`, `MARAIS MASAY`, `AMBOHIJATOVO`, `LA CITY`, …

🚀 Utilisation rapide
- Ouvrez une page photo Facebook: l’extension scanne automatiquement et notifie “DELESTAGE {LIEU} : {HHHMM HHMM}”.
- Naviguez de photo en photo: l’URL change → nouvelle vérification → nouvelle notification.
- Ouvrez un post JIRAMA: le détecteur “feed” tente de repérer les images du template officiel et de remonter l’info.

🔐 Permissions et confidentialité
- Permissions: `notifications`, `storage`, `tabs`, `activeTab`.
- Hôtes: `https://*.facebook.com/*`, `https://*.fbcdn.net/*` (nécessaires pour lire les images et réagir aux photos).
- Données locales: seules les préférences (lieu, mot-clé) et l’historique anti-spam (IDs de posts) sont stockés dans `chrome.storage.local`.

🐞 Dépannage
- Pas de notification sur une page photo:
  - Vérifiez que l’onglet est au premier plan (la capture d’écran est limitée aux onglets visibles).
  - Attendez ~1–2s: le temps que Facebook instancie l’image et son `alt`.
  - Ouvrez la console (F12) et regardez les logs `[JIRAMA-IV]` pour voir ce qui a été lu.
- Le lieu n’est pas trouvé: vérifiez l’orthographe exacte dans Options (casse indifférente). Essayez aussi le nom sans accents.
- Horaires non extraits alors qu’ils sont visibles: envoyez un exemple (alt/texte OCR) pour enrichir la normalisation.

⚡️ Performance
- Chemin “photo”: alt-first (0 OCR la plupart du temps) → très rapide.
- OCR n’est exécuté que si le lieu est présent mais les heures manquent dans `alt`, avec au plus 1 capture ciblée de la bande gauche.
- Sur le fil, l’algorithme limite le nombre d’images scannées par passe (jusqu’à 12) pour rester fluide.

🛠️ Développement
- Manifest V3 (service worker) + content scripts.
- OCR: Ocrad.js embarqué (`libs/ocrad.min.js`).
- Déduplication via `chrome.storage.local` + nettoyage périodique (>7 jours).

📜 Licence
- Projet destiné à un usage personnel/interne. Adaptez les règles selon votre contexte avant distribution.

🙏 Remerciements
- Merci aux contributeurs des bibliothèques open‑source et aux testeurs pour les retours terrain.

— — —

Besoin d’une évolution ?
- Multi-lieux en même temps, export CSV, raccourcis clavier, bascule “sans OCR”… dites‑le et on pourra l’ajouter.
