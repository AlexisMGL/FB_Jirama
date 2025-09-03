chrome.runtime.onInstalled.addListener(() => {
  console.log("Jirama FB Notifier installé.");
});

// Fonction utilitaire pour montrer une notif
function showNotification() {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "JIRAMA FB",
    message: "Tu es sur le Facebook officiel de la Jirama 🚰⚡"
  });
  console.debug('Notification standard affichée');
}

// Notifie lorsqu'un post de délestage récent est trouvé
function showDelestageNotification() {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "JIRAMA FB",
    message: "⚡ Plan de délestage publié dans les dernières 24h"
  });
  console.debug('Notification de délestage affichée');
}

// On écoute les messages venant du content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.debug('Message reçu du content script', request);
  if (request.action === "notify") {
    showNotification();
  } else if (request.action === "notifyDelestage") {
    showDelestageNotification();
  }
});
