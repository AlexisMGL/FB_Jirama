// Background service worker: notifications + capture + helpers
const NOTIF_PREFIX = "jirama-delestage-";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Jirama FB Notifier installed.");
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

// Cleanup entries older than 7 days
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Notification from content
  if (request && request.type === "DEL_EST_FOUND") {
    (async () => {
      const { postId, postUrl, snippet, timesStr } = request;
      if (!postId) return;

      const seen = await getSeenMap();
      if (seen[postId]) return;

      const notifId = NOTIF_PREFIX + postId;
      let title = "Délestage - JIRAMA";
      let message = snippet && snippet.trim().length ? snippet.substring(0, 180) : "Délestage détecté";
      if (typeof timesStr === 'string' && timesStr.trim().length) {
        title = "Délestage IVANDRY - JIRAMA";
        message = timesStr.trim().substring(0, 180);
      }
      chrome.notifications.create(notifId, {
        type: "basic",
        iconUrl: "icon.png",
        title,
        message,
        priority: 2,
        requireInteraction: true
      });

      const targets = await getNotifTargets();
      targets[notifId] = postUrl || null;
      await setNotifTargets(targets);
      const seenMap = await getSeenMap();
      seenMap[postId] = Date.now();
      await setSeenMap(seenMap);
      await cleanOldSeen();
    })();
    return;
  }

  // Simple presence notification for a single photo page
  if (request && request.type === 'IVANDRY_PRESENCE') {
    (async () => {
      const { postId, postUrl, present, timesStr, district } = request;
      if (!postId) return;
      const seen = await getSeenMap();
      // allow re-notifying presence checks, so do not hard-skip on seen
      const notifId = NOTIF_PREFIX + 'presence-' + postId + '-' + Date.now();
      const title = `DELESTAGE ${district ? district.toUpperCase() : 'IVANDRY'}`;
      let message;
      if (present && timesStr && timesStr.trim().length) {
        message = `${title} : ${timesStr.trim()}`;
      } else if (present) {
        // If hours couldn't be parsed, mark not found per user's preference
        message = `${title} : pas présent`;
      } else {
        message = `${title} : pas présent`;
      }
      chrome.notifications.create(notifId, {
        type: 'basic', iconUrl: 'icon.png', title, message, priority: 2, requireInteraction: false
      });
      const targets = await getNotifTargets();
      targets[notifId] = postUrl || null;
      await setNotifTargets(targets);
    })();
    return;
  }

  // Screenshot request from content script (to bypass fbcdn CORS)
  if (request && request.type === "CAPTURE_VISIBLE") {
    const winId = sender?.tab?.windowId;
    const opts = { format: "png" };
    const respond = (ok, dataUrl) => { try { sendResponse({ ok, dataUrl }); } catch {} };
    const handleCb = (dataUrl) => {
      if (chrome.runtime.lastError) { respond(false); return; }
      respond(!!dataUrl, dataUrl);
    };
    if (typeof winId === 'number') {
      chrome.tabs.captureVisibleTab(winId, opts, handleCb);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const wId = tabs && tabs[0] ? tabs[0].windowId : undefined;
        if (typeof wId === 'number') chrome.tabs.captureVisibleTab(wId, opts, handleCb);
        else respond(false);
      });
    }
    return true; // async
  }

  // Count IVANDRY in active tab (post)
  if (request && request.type === 'COUNT_IVANDRY_IN_ACTIVE_TAB') {
    (async () => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs && tabs[0] ? tabs[0].id : undefined;
          const url = tabs && tabs[0] ? (tabs[0].url || '') : '';
          if (typeof tabId !== 'number' || !/facebook\.com/i.test(url)) { try { sendResponse({ ok: false, reason: 'not-facebook' }); } catch {}; return; }
          const handler = (msg, senderInfo) => {
            if (msg && msg.type === 'IVANDRY_COUNT_RESULT' && senderInfo && senderInfo.tab && senderInfo.tab.id === tabId) {
              try { sendResponse({ ok: true, count: msg.count }); } catch {}
              chrome.runtime.onMessage.removeListener(handler);
            }
          };
          chrome.runtime.onMessage.addListener(handler);
          chrome.tabs.sendMessage(tabId, { type: 'COUNT_IVANDRY_NOW' }, () => {});
          setTimeout(() => { try { chrome.runtime.onMessage.removeListener(handler); sendResponse({ ok: false, reason: 'timeout' }); } catch {} }, 20000);
        });
      } catch (e) { try { sendResponse({ ok: false }); } catch {} }
    })();
    return true;
  }

  // Open URL in active tab then count
  if (request && request.type === 'OPEN_AND_COUNT_IVANDRY_IN_ACTIVE_TAB') {
    (async () => {
      try {
        let url = String(request.url || '').trim();
        if (!url) { try { sendResponse({ ok: false, reason: 'no-url' }); } catch {}; return; }
        try {
          const u = new URL(url);
          if (/\/plugins\/post\.php$/i.test(u.pathname)) {
            const href = u.searchParams.get('href');
            if (href) url = decodeURIComponent(href);
          }
        } catch {}
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs && tabs[0] ? tabs[0].id : undefined;
          if (typeof tabId !== 'number') { try { sendResponse({ ok: false, reason: 'no-tab' }); } catch {}; return; }
          chrome.tabs.update(tabId, { url }, (tab) => {
            const targetId = tab && tab.id ? tab.id : tabId;
            const sendCount = () => {
              const handler = (msg, senderInfo) => {
                if (msg && msg.type === 'IVANDRY_COUNT_RESULT' && senderInfo && senderInfo.tab && senderInfo.tab.id === targetId) {
                  try { sendResponse({ ok: true, count: msg.count }); } catch {}
                  chrome.runtime.onMessage.removeListener(handler);
                }
              };
              chrome.runtime.onMessage.addListener(handler);
              chrome.tabs.sendMessage(targetId, { type: 'COUNT_IVANDRY_NOW' }, () => {});
              setTimeout(() => { try { chrome.runtime.onMessage.removeListener(handler); sendResponse({ ok: false, reason: 'timeout' }); } catch {} }, 20000);
            };
            const listener = (tid, info) => {
              if (tid === targetId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                sendCount();
              }
            };
            try { chrome.tabs.onUpdated.addListener(listener); } catch {}
            setTimeout(sendCount, 4000);
          });
        });
      } catch (e) { try { sendResponse({ ok: false }); } catch {} }
    })();
    return true;
  }
});

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith(NOTIF_PREFIX)) return;
  const targets = await getNotifTargets();
  const url = targets[notifId];
  if (url) chrome.tabs.create({ url });
});
