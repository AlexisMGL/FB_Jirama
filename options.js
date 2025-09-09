async function load() {
  const { pageKeyword = 'jirama' } = await chrome.storage.local.get('pageKeyword');
  document.getElementById('pageKeyword').value = pageKeyword;
  const { lastPostInput = '' } = await chrome.storage.local.get('lastPostInput');
  const inp = document.getElementById('postInput');
  if (inp) inp.value = lastPostInput || '';
  const { districtQuery = 'IVANDRY' } = await chrome.storage.local.get('districtQuery');
  const dq = document.getElementById('districtQuery');
  if (dq) dq.value = districtQuery;
}

async function save() {
  const v = document.getElementById('pageKeyword').value.trim() || 'jirama';
  const district = (document.getElementById('districtQuery')?.value || 'IVANDRY').trim() || 'IVANDRY';
  await chrome.storage.local.set({ pageKeyword: v, districtQuery: district });
  const s = document.getElementById('status');
  s.textContent = 'Enregistré.';
  setTimeout(() => (s.textContent = ''), 1200);
}

function extractUrlFromIframe(html) {
  try {
    const m = html.match(/src\s*=\s*\"([^\"]+)\"/i) || html.match(/src\s*=\s*'([^']+)'/i);
    if (!m) return null;
    return m[1];
  } catch { return null; }
}

function normalizeFacebookPostUrl(input) {
  try {
    let url = input.trim();
    if (!url) return null;
    if (url.includes('<iframe')) {
      const src = extractUrlFromIframe(url);
      if (src) url = src;
    }
    const u = new URL(url);
    if (/\/plugins\/post\.php$/i.test(u.pathname)) {
      const href = u.searchParams.get('href');
      if (href) url = decodeURIComponent(href);
    }
    return url;
  } catch {
    return null;
  }
}

async function countIvandry() {
  const status = document.getElementById('scanStatus');
  const el = document.getElementById('postInput');
  const raw = (el && el.value) ? el.value : '';
  await chrome.storage.local.set({ lastPostInput: raw });
  const url = normalizeFacebookPostUrl(raw || '');

  if (url) {
    status.textContent = "Ouverture du post...";
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'OPEN_AND_COUNT_IVANDRY_IN_ACTIVE_TAB', url });
      if (resp && resp.ok === true && typeof resp.count === 'number') {
        status.textContent = String(resp.count);
      } else {
        status.textContent = 'Échec ou délai dépassé.';
      }
    } catch {
      status.textContent = 'Erreur.';
    }
  } else {
    status.textContent = "Scan de l'onglet actif...";
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'COUNT_IVANDRY_IN_ACTIVE_TAB' });
      if (resp && resp.ok === true && typeof resp.count === 'number') {
        status.textContent = String(resp.count);
      } else if (resp && resp.reason === 'not-facebook') {
        status.textContent = 'Onglet non-Facebook.';
      } else {
        status.textContent = 'Échec ou délai dépassé.';
      }
    } catch {
      status.textContent = 'Erreur.';
    }
  }
}

document.getElementById('save').addEventListener('click', save);
const btn = document.getElementById('countIv');
if (btn) btn.addEventListener('click', countIvandry);
load();
