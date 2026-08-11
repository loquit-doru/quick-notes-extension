import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bindDeviceSlot,
  findExistingDeviceSlot,
  normalizeEmail,
  parseDevicesList,
  resolveDeviceId,
} from '../../workers/src/license-devices.js';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    assert.equal(normalizeEmail('  Buyer@Example.COM '), 'buyer@example.com');
  });
});

describe('resolveDeviceId', () => {
  it('prefers deviceId over extensionId', () => {
    assert.equal(
      resolveDeviceId({ deviceId: 'qnd_aaa', extensionId: 'qn_bbb' }),
      'qnd_aaa'
    );
  });
  it('falls back to extensionId', () => {
    assert.equal(resolveDeviceId({ extensionId: 'qn_legacy' }), 'qn_legacy');
  });
});

describe('bindDeviceSlot', () => {
  const max = 3;

  it('first restore adds device', () => {
    const r = bindDeviceSlot({
      devices: [],
      deviceId: 'qnd_one',
      extensionId: 'qn_one',
      max,
    });
    assert.equal(r.ok, true);
    assert.equal(r.reusedDevice, false);
    assert.deepEqual(r.devices, ['qnd_one']);
    assert.equal(r.devicesUsed, 1);
  });

  it('second restore from same deviceId is idempotent', () => {
    const first = bindDeviceSlot({
      devices: [],
      deviceId: 'qnd_one',
      extensionId: 'qn_one',
      max,
    });
    const second = bindDeviceSlot({
      devices: first.devices,
      deviceId: 'qnd_one',
      extensionId: 'qn_one',
      max,
    });
    assert.equal(second.ok, true);
    assert.equal(second.reusedDevice, true);
    assert.equal(second.devicesUsed, 1);
    assert.deepEqual(second.devices, ['qnd_one']);
  });

  it('new extensionId with same persisted deviceId reuses slot', () => {
    const first = bindDeviceSlot({
      devices: [],
      deviceId: 'qn_legacy',
      extensionId: 'qn_legacy',
      max,
    });
    const second = bindDeviceSlot({
      devices: first.devices,
      deviceId: 'qn_legacy',
      extensionId: 'qn_new_install',
      max,
    });
    assert.equal(second.ok, true);
    assert.equal(second.reusedDevice, true);
    assert.equal(second.devicesUsed, 1);
  });

  it('three unique devices succeed', () => {
    let devices = [];
    for (const id of ['qnd_a', 'qnd_b', 'qnd_c']) {
      const r = bindDeviceSlot({ devices, deviceId: id, extensionId: `qn_${id}`, max });
      assert.equal(r.ok, true);
      devices = r.devices;
    }
    assert.equal(devices.length, 3);
  });

  it('fourth unique device fails with device_limit', () => {
    const devices = ['qnd_a', 'qnd_b', 'qnd_c'];
    const r = bindDeviceSlot({
      devices,
      deviceId: 'qnd_d',
      extensionId: 'qn_d',
      max,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'device_limit');
    assert.equal(r.devicesUsed, 3);
  });

  it('stripe + same deviceId after extensionId change does not double count', () => {
    const stripe = bindDeviceSlot({
      devices: [],
      deviceId: 'qnd_same',
      extensionId: 'qn_old',
      max,
    });
    const again = bindDeviceSlot({
      devices: stripe.devices,
      deviceId: 'qnd_same',
      extensionId: 'qn_new',
      max,
    });
    assert.equal(again.ok, true);
    assert.equal(again.reusedDevice, true);
    assert.equal(again.devicesUsed, 1);
  });
});

describe('findExistingDeviceSlot', () => {
  it('matches deviceId first', () => {
    const r = findExistingDeviceSlot(['qnd_x'], 'qnd_x', 'qn_y');
    assert.equal(r.found, true);
    assert.equal(r.legacy, false);
  });
});

describe('parseDevicesList', () => {
  it('parses JSON array', () => {
    assert.deepEqual(parseDevicesList('["a","b"]'), ['a', 'b']);
  });
  it('returns empty on invalid JSON', () => {
    assert.deepEqual(parseDevicesList('not-json'), []);
  });
});
