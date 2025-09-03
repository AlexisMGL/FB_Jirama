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
}

// On écoute les messages venant du content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "notify") {
    showNotification();
  }
});
