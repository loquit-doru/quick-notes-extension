/**
 * Device-slot logic for Pro license restore (pure functions — unit tested).
 * Slots are keyed by stable deviceId per browser profile, not by install extensionId.
 */

export const MAX_DEVICES_DEFAULT = 3;

export const DEVICE_LIMIT_MESSAGE =
  'This purchase is already active on 3 devices. Remove an old device or contact support to reset your activations.';

export function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

export function maxDevicesFromEnv(env) {
  const n = parseInt(env?.MAX_DEVICES || '', 10);
  return Number.isFinite(n) && n > 0 ? n : MAX_DEVICES_DEFAULT;
}

export function resolveDeviceId(body) {
  const deviceId = (body?.deviceId || '').trim();
  const extensionId = (body?.extensionId || '').trim();
  return deviceId || extensionId || '';
}

/** @returns {string[]} */
export function parseDevicesList(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Find an existing slot for this profile (deviceId or legacy extensionId in KV).
 */
export function findExistingDeviceSlot(devices, deviceId, extensionId) {
  const list = Array.isArray(devices) ? devices : [];
  if (deviceId && list.includes(deviceId)) {
    return { found: true, reusedDevice: true, legacy: false };
  }
  if (extensionId && list.includes(extensionId)) {
    return { found: true, reusedDevice: true, legacy: true };
  }
  return { found: false, reusedDevice: false, legacy: false };
}

/**
 * Apply device binding rules (idempotent restore).
 * @returns {{ ok: boolean, devices: string[], devicesUsed: number, maxDevices: number, reusedDevice?: boolean, code?: string, error?: string }}
 */
export function bindDeviceSlot({ devices, deviceId, extensionId, max }) {
  const slotId = deviceId || extensionId;
  if (!slotId) {
    return {
      ok: false,
      devices: devices || [],
      devicesUsed: 0,
      maxDevices: max,
      code: 'invalid_device',
      error: 'Missing deviceId or extensionId',
    };
  }

  let list = Array.isArray(devices) ? [...devices] : [];
  const existing = findExistingDeviceSlot(list, deviceId, extensionId);

  if (existing.found) {
    if (existing.legacy && deviceId && extensionId && deviceId !== extensionId) {
      const idx = list.indexOf(extensionId);
      if (idx !== -1) list[idx] = deviceId;
    }
    return {
      ok: true,
      devices: list,
      devicesUsed: list.length,
      maxDevices: max,
      reusedDevice: true,
    };
  }

  if (list.length >= max) {
    return {
      ok: false,
      devices: list,
      devicesUsed: list.length,
      maxDevices: max,
      code: 'device_limit',
      error: DEVICE_LIMIT_MESSAGE,
    };
  }

  list.push(slotId);
  return {
    ok: true,
    devices: list,
    devicesUsed: list.length,
    maxDevices: max,
    reusedDevice: false,
  };
}

export function deviceIdLogPrefix(deviceId) {
  if (!deviceId) return '(none)';
  if (deviceId.length <= 8) return deviceId;
  return `${deviceId.slice(0, 8)}…`;
}

export function licenseDebugLog(env, message, detail = {}) {
  const enabled =
    env?.LOG_LICENSE_DEBUG === '1' || env?.LOG_LICENSE_DEBUG === 'true';
  if (!enabled) return;
  console.log(`[license] ${message}`, detail);
}
