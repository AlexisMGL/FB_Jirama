Jirama FB Notifier (Chrome Extension)

Fonctionnalités
- Détecte les posts de délestage sur la page Facebook de la JIRAMA.
- Critères: post de moins de 24 h, avec plusieurs images partageant un même template visuel (heuristique), et/ou texte contenant des mots-clés ("délestage", "fahatapahan-jiro").
- Envoie une notification cliquable (ouvre le post), avec dédoublonnage pour éviter les répétitions.

Installation en mode développeur
1. Ouvrir Chrome → `chrome://extensions`.
2. Activer "Mode développeur" (coin supérieur droit).
3. Cliquer "Charger l’extension non empaquetée" et sélectionner ce dossier.
4. Aller sur la page Facebook de la JIRAMA (ou configurer l’URL cible dans les Options de l’extension).

Options
- Menu de l’extension → Options: définir le mot-clé d’URL (par défaut: `jirama`). Le script ne s’active que si l’URL de la page contient ce mot.

Notes techniques
- Manifest V3, content script + service worker.
- Heuristique d’images: compare la moyenne de couleur sur une bande en haut des images pour estimer un template commun.
- Dédoublonnage via `chrome.storage.local` (clé = ID du post extrait de l’URL).

