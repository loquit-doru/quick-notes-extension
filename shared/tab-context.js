// Active tab context — popup only, relies on activeTab (user opened extension)

import { getHostname } from './url-utils.js';

/**
 * Read current tab context locally. Never transmitted by these helpers.
 * @returns {Promise<{ url: string, title: string, hostname: string, favicon: string|undefined }|null>}
 */
export async function getCurrentTabContext() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.url || tab.url.startsWith('chrome://')) return null;

    return {
      url: tab.url,
      title: tab.title || '',
      hostname: getHostname(tab.url) || '',
      favicon: tab.favIconUrl
    };
  } catch {
    return null;
  }
}
