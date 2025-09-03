// Dès que ce script s'exécute (car on est sur la bonne URL)
chrome.runtime.sendMessage({ action: "notify" });
