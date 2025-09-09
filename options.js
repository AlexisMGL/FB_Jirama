async function load() {
  const { pageKeyword = 'jirama' } = await chrome.storage.local.get('pageKeyword');
  document.getElementById('pageKeyword').value = pageKeyword;
}

async function save() {
  const v = document.getElementById('pageKeyword').value.trim() || 'jirama';
  await chrome.storage.local.set({ pageKeyword: v });
  const s = document.getElementById('status');
  s.textContent = 'Enregistré.';
  setTimeout(() => (s.textContent = ''), 1200);
}

document.getElementById('save').addEventListener('click', save);
load();

