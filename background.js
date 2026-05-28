// background.js — service worker, always has storage access

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "STORAGE_SET") {
    chrome.storage.local.set({ [msg.key]: msg.value }, () =>
      sendResponse({ ok: true })
    );
    return true; // keep channel open for async response
  }

  if (msg.type === "STORAGE_GET") {
    chrome.storage.local.get(msg.key, (items) =>
      sendResponse({ value: items[msg.key] ?? null })
    );
    return true;
  }

  if (msg.type === "STORAGE_REMOVE") {
    chrome.storage.local.remove(msg.key, () => sendResponse({ ok: true }));
    return true;
  }
});