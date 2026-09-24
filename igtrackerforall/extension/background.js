const TRACKER_URL = chrome.runtime.getURL('tracker.html');

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: TRACKER_URL });
  if (tabs.length > 0) {
    chrome.tabs.update(tabs[0].id, { active: true });
  } else {
    chrome.tabs.create({ url: TRACKER_URL });
  }
});

chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: 'track-ig-profile',
    title: 'Track this profile with IGTrackerForAll',
    contexts: ['link'],
    targetUrlPatterns: ['*://www.instagram.com/*']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'track-ig-profile' && info.linkUrl) {
    const m = info.linkUrl.match(/instagram\.com\/([^\/?#]+)/);
    if (!m) return;
    const username = m[1].replace(/[^a-z0-9._]/gi, '');
    chrome.tabs.create({ url: TRACKER_URL + '?u=' + encodeURIComponent(username) });
  }
});