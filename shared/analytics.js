const SETTINGS_KEY = 'analyticsSettings';
const EVENTS_KEY = 'analyticsEvents';
const EVENT_LOG_KEY = 'analyticsEventLog';
const MAX_LOG_ENTRIES = 200;

const DEFAULT_SETTINGS = {
  enabled: true,
  updatedAt: 0,
};

function nowIso() {
  return new Date().toISOString();
}

function sanitizeProps(props = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (typeof value === 'string') {
      sanitized[key] = value.slice(0, 120);
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

async function getAnalyticsState() {
  const result = await chrome.storage.local.get([SETTINGS_KEY, EVENTS_KEY, EVENT_LOG_KEY]);
  const settings = { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
  const events = result[EVENTS_KEY] || {};
  const log = Array.isArray(result[EVENT_LOG_KEY]) ? result[EVENT_LOG_KEY] : [];
  return { settings, events, log };
}

export async function getAnalyticsSettings() {
  const { settings } = await getAnalyticsState();
  return settings;
}

export async function setAnalyticsEnabled(enabled) {
  const settings = {
    enabled: enabled !== false,
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export async function trackFunnelEvent(name, props = {}) {
  if (!name) return false;
  const { settings, events, log } = await getAnalyticsState();
  if (settings.enabled === false) return false;

  const timestamp = nowIso();
  const entry = events[name] || { count: 0, firstAt: timestamp };
  entry.count += 1;
  entry.lastAt = timestamp;
  entry.lastProps = sanitizeProps(props);
  events[name] = entry;

  log.push({
    name,
    at: timestamp,
    props: sanitizeProps(props),
  });
  if (log.length > MAX_LOG_ENTRIES) {
    log.splice(0, log.length - MAX_LOG_ENTRIES);
  }

  await chrome.storage.local.set({
    [SETTINGS_KEY]: settings,
    [EVENTS_KEY]: events,
    [EVENT_LOG_KEY]: log,
  });
  return true;
}

export async function trackFunnelEventOnce(name, onceKey, props = {}) {
  if (!name || !onceKey) return false;
  const markerKey = `analyticsOnce:${onceKey}`;
  const marker = await chrome.storage.local.get([markerKey]);
  if (marker[markerKey]) return false;
  const tracked = await trackFunnelEvent(name, props);
  if (tracked) {
    await chrome.storage.local.set({ [markerKey]: nowIso() });
  }
  return tracked;
}
