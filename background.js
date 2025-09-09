// Background service worker: notifications + dédoublonnage
const NOTIF_PREFIX = "jirama-delestage-";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Jirama FB Notifier installé.");
});

async function getSeenMap() {
  const { seenPostKeys = {} } = await chrome.storage.local.get("seenPostKeys");
  return seenPostKeys;
}

async function setSeenMap(map) {
  await chrome.storage.local.set({ seenPostKeys: map });
}

async function getNotifTargets() {
  const { notifTargets = {} } = await chrome.storage.local.get("notifTargets");
  return notifTargets;
}

async function setNotifTargets(map) {
  await chrome.storage.local.set({ notifTargets: map });
}

// Cleanup optionnel (entrées > 7 jours)
async function cleanOldSeen() {
  const now = Date.now();
  const seen = await getSeenMap();
  let changed = false;
  for (const [k, v] of Object.entries(seen)) {
    if (typeof v === "number" && now - v > 7 * 24 * 60 * 60 * 1000) {
      delete seen[k];
      changed = true;
    }
  }
  if (changed) await setSeenMap(seen);
}

chrome.runtime.onMessage.addListener((request) => {
  if (request && request.type === "DEL_EST_FOUND") {
    (async () => {
      const { postId, postUrl, snippet } = request;
      if (!postId) return;

      const seen = await getSeenMap();
      if (seen[postId]) {
        return; // déjà notifié
      }

      const notifId = NOTIF_PREFIX + postId;
      const title = "Délestage détecté - JIRAMA";
      const message = snippet && snippet.trim().length
        ? snippet.substring(0, 180)
        : "Un post de délestage a été publié (moins de 24h).";

      chrome.notifications.create(notifId, {
        type: "basic",
        iconUrl: "icon.png",
        title,
        message,
        priority: 2,
        requireInteraction: true
      });

      // Stocke la cible pour le clic et marque comme vu
      const targets = await getNotifTargets();
      targets[notifId] = postUrl || null;
      await setNotifTargets(targets);
      seen[postId] = Date.now();
      await setSeenMap(seen);
      await cleanOldSeen();
    })();
  }
});

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith(NOTIF_PREFIX)) return;
  const targets = await getNotifTargets();
  const url = targets[notifId];
  if (url) {
    chrome.tabs.create({ url });
  }
});

