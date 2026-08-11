// URL helpers for Page Memory (local matching only — nothing sent externally)

/**
 * Normalize URL for page-level matching: strip hash fragment.
 * @param {string} url
 * @returns {string|null}
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Hostname for domain-level matching (no leading www.).
 * @param {string} url
 * @returns {string|null}
 */
export function getHostname(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

/**
 * @param {{ contextUrl?: string|null }} note
 * @param {{ url?: string|null }} tabContext
 */
export function noteMatchesCurrentPage(note, tabContext) {
  if (!note?.contextUrl || !tabContext?.url) return false;
  const noteUrl = normalizeUrl(note.contextUrl);
  const pageUrl = normalizeUrl(tabContext.url);
  return Boolean(noteUrl && pageUrl && noteUrl === pageUrl);
}

/**
 * @param {{ contextUrl?: string|null }} note
 * @param {{ url?: string|null, hostname?: string|null }} tabContext
 */
export function noteMatchesCurrentDomain(note, tabContext) {
  if (!note?.contextUrl) return false;
  const noteHost = getHostname(note.contextUrl);
  const tabHost = tabContext.hostname || getHostname(tabContext.url);
  return Boolean(noteHost && tabHost && noteHost === tabHost);
}
