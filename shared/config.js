// Quick Notes — feature flags and storage schema (local-only extension)

/** Bump when chrome.storage.local migrations change. */
export const STORAGE_SCHEMA_VERSION = 2;

/** Review queue statuses stored on each note. */
export const REVIEW_STATUS = {
  NEW: 'new',
  REVIEWED: 'reviewed',
  ARCHIVED: 'archived'
};

/**
 * Where to send someone who wants to leave a review. The same build ships to both
 * stores, so the listing is keyed by the store-assigned extension id.
 */
export const STORE_REVIEW_URLS = {
  nompejhpnnehhnedkgklfgpdgcfhkfem:
    'https://chromewebstore.google.com/detail/nompejhpnnehhnedkgklfgpdgcfhkfem/reviews',
  bpflnjinelkgbnbbjjddggnahdjhmadn:
    'https://microsoftedge.microsoft.com/addons/detail/bpflnjinelkgbnbbjjddggnahdjhmadn'
};

/**
 * Resolve the review page for this build.
 * Returns null when the store cannot be determined (unpacked builds, unknown UA)
 * so the caller can stay silent rather than send someone to the wrong store.
 */
export function getStoreReviewUrl(extensionId, userAgent = '') {
  if (extensionId && STORE_REVIEW_URLS[extensionId]) {
    return STORE_REVIEW_URLS[extensionId];
  }
  // Edge reports both "Edg/" and "Chrome/", so it has to be tested first.
  if (/\bEdg\//.test(userAgent)) {
    return STORE_REVIEW_URLS.bpflnjinelkgbnbbjjddggnahdjhmadn;
  }
  if (/\bChrome\//.test(userAgent)) {
    return STORE_REVIEW_URLS.nompejhpnnehhnedkgklfgpdgcfhkfem;
  }
  return null;
}

/**
 * Future product hooks — disabled until implemented.
 * Keeps gating and UI experiments in one place.
 */
export const FEATURE_FLAGS = {
  saveSelection: false,
  sidePanel: false,
  proFeatureGates: false,
  advancedExportImport: false,
  advancedLocalSearch: false
};
