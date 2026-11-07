// Toolbar button and Alt+Q both flip Queue Mode. The content script listens
// for the storage change, so every open YouTube tab updates at once.
chrome.action.onClicked.addListener(async () => {
  const { queueMode = false } = await chrome.storage.local.get("queueMode");
  await chrome.storage.local.set({ queueMode: !queueMode });
});

function showBadge(on) {
  chrome.action.setBadgeText({ text: on ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#ff0033" });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.queueMode) showBadge(changes.queueMode.newValue);
});

const syncBadge = () =>
  chrome.storage.local.get("queueMode").then(({ queueMode }) => showBadge(!!queueMode));
chrome.runtime.onStartup.addListener(syncBadge);
chrome.runtime.onInstalled.addListener(syncBadge);
