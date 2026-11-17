// Clicking the toolbar icon opens the Fluent side panel. That click also grants
// activeTab, which is what lets the panel read the page you're looking at.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
