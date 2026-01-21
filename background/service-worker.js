// Quick Notes - Service Worker
// Handles global shortcuts and context capture

// Handle extension install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('⚡ Quick Notes installed!');
    
    // Set default settings
    chrome.storage.local.set({
      settings: {
        theme: 'dark',
        quickAddMode: false,
        includeContext: true,
        fastMode: false
      }
    });
  }
});

// Get current tab context for new notes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getContext') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendResponse({
          url: tabs[0].url,
          title: tabs[0].title,
          favIconUrl: tabs[0].favIconUrl
        });
      } else {
        sendResponse(null);
      }
    });
    return true; // Keep channel open for async response
  }
});
