import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIAL_DAYS,
  localDayKey,
  recordActiveDay,
  describeTrial,
  migrateFromStartDate
} from '../../shared/trial.js';

const DAY_MS = 86400000;
/** Midday avoids any ambiguity when adding whole days across a DST boundary. */
const noonOn = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).getTime();

describe('localDayKey', () => {
  it('formats the local calendar day', () => {
    assert.equal(localDayKey(noonOn(2026, 8, 9)), '2026-08-09');
  });

  it('zero-pads month and day', () => {
    assert.equal(localDayKey(noonOn(2026, 1, 3)), '2026-01-03');
  });
});

describe('recordActiveDay', () => {
  it('starts the count on first use', () => {
    const next = recordActiveDay(null, noonOn(2026, 8, 9));
    assert.equal(next.activeDays, 1);
    assert.equal(next.lastActiveDay, '2026-08-09');
    assert.equal(next.changed, true);
  });

  it('does not count the same day twice', () => {
    const first = recordActiveDay(null, noonOn(2026, 8, 9));
    const again = recordActiveDay(first, noonOn(2026, 8, 9) + 6 * 3600000);
    assert.equal(again.activeDays, 1);
    assert.equal(again.changed, false);
  });

  it('counts the next calendar day', () => {
    const first = recordActiveDay(null, noonOn(2026, 8, 9));
    const second = recordActiveDay(first, noonOn(2026, 8, 10));
    assert.equal(second.activeDays, 2);
    assert.equal(second.changed, true);
  });

  it('counts a gap of weeks as a single new day — this is the whole point', () => {
    const first = recordActiveDay(null, noonOn(2026, 8, 9));
    const muchLater = recordActiveDay(first, noonOn(2026, 9, 20));
    assert.equal(muchLater.activeDays, 2);
  });
});

describe('describeTrial', () => {
  it('shows the full allowance on the first active day', () => {
    const status = describeTrial({ activeDays: 1 });
    assert.equal(status.daysRemaining, TRIAL_DAYS);
    assert.equal(status.isTrialActive, true);
    assert.equal(status.isExpired, false);
  });

  it('reaches the last day exactly on the seventh active day', () => {
    const status = describeTrial({ activeDays: TRIAL_DAYS });
    assert.equal(status.daysRemaining, 1);
    assert.equal(status.isTrialActive, true);
  });

  it('expires on the day after the allowance is used up', () => {
    const status = describeTrial({ activeDays: TRIAL_DAYS + 1 });
    assert.equal(status.daysRemaining, 0);
    assert.equal(status.isTrialActive, false);
    assert.equal(status.isExpired, true);
  });

  it('never reports a negative balance', () => {
    assert.equal(describeTrial({ activeDays: 999 }).daysRemaining, 0);
  });

  it('treats missing or malformed state as untouched', () => {
    assert.equal(describeTrial(null).daysRemaining, TRIAL_DAYS);
    assert.equal(describeTrial({ activeDays: -4 }).daysRemaining, TRIAL_DAYS);
  });
});

describe('a trial spent slowly', () => {
  it('survives long gaps and only ends after seven days of real use', () => {
    // Opened once a month for eight months.
    let state = null;
    for (let month = 1; month <= TRIAL_DAYS; month += 1) {
      state = recordActiveDay(state, noonOn(2026, month, 15));
      assert.equal(describeTrial(state).isTrialActive, true, `month ${month} should still be active`);
    }
    state = recordActiveDay(state, noonOn(2026, TRIAL_DAYS + 1, 15));
    assert.equal(describeTrial(state).isExpired, true);
  });
});

describe('migrateFromStartDate', () => {
  it('returns null when there is no legacy trial', () => {
    assert.equal(migrateFromStartDate(undefined), null);
    assert.equal(migrateFromStartDate(0), null);
  });

  it('keeps a fresh legacy trial at the full allowance', () => {
    const now = noonOn(2026, 8, 9);
    const migrated = migrateFromStartDate(now, now);
    assert.equal(describeTrial(migrated).daysRemaining, TRIAL_DAYS);
  });

  it('preserves how far a part-used legacy trial had got', () => {
    const now = noonOn(2026, 8, 9);
    const migrated = migrateFromStartDate(now - 3 * DAY_MS, now);
    // Old rule: max(0, 7 - 3) = 4 days left. Nobody gains or loses on upgrade.
    assert.equal(describeTrial(migrated).daysRemaining, 4);
  });

  it('leaves an already-expired legacy trial expired', () => {
    const now = noonOn(2026, 8, 9);
    const migrated = migrateFromStartDate(now - 40 * DAY_MS, now);
    assert.equal(describeTrial(migrated).isExpired, true);
  });

  it('marks today as already counted so the migration itself costs nothing', () => {
    const now = noonOn(2026, 8, 9);
    const migrated = migrateFromStartDate(now - 3 * DAY_MS, now);
    const afterOpening = recordActiveDay(migrated, now);
    assert.equal(afterOpening.changed, false);
    assert.equal(describeTrial(afterOpening).daysRemaining, 4);
  });
});
