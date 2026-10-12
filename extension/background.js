// Toolbar click -> open the full-page app tab. No permissions needed.
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }));
