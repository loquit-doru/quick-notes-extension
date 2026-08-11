// Quick Notes — trial accounting.
//
// The trial is measured in ACTIVE DAYS, not wall-clock days. The old rule burned
// from the moment of first open, so someone who installed, glanced once, and came
// back a fortnight later had already lost the trial without ever seeing what Pro
// does. Counting only the days Quick Notes is actually opened means the seven days
// are seven days of real use, whenever they happen.
//
// Pure functions, no chrome.* — the caller owns storage.

export const TRIAL_DAYS = 7;

/** Local calendar day as YYYY-MM-DD. Local on purpose: a "day" is the user's day. */
export function localDayKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Count today as an active day.
 * `changed` is false when today was already counted, so the caller can skip a write.
 */
export function recordActiveDay(state, timestamp = Date.now()) {
  const today = localDayKey(timestamp);
  const activeDays = Math.max(0, Number(state?.activeDays) || 0);
  const lastActiveDay = state?.lastActiveDay || null;

  if (lastActiveDay === today) {
    return { activeDays, lastActiveDay, changed: false };
  }
  return { activeDays: activeDays + 1, lastActiveDay: today, changed: true };
}

/**
 * Days left, counting today as one of them: on the first active day the banner
 * should read "7 days left", not "6".
 */
export function describeTrial(state) {
  const activeDays = Math.max(0, Number(state?.activeDays) || 0);
  const daysUsedBeforeToday = Math.max(0, activeDays - 1);
  const daysRemaining = Math.max(0, TRIAL_DAYS - daysUsedBeforeToday);

  return {
    activeDays,
    daysRemaining,
    isTrialActive: daysRemaining > 0,
    isExpired: daysRemaining === 0
  };
}

/**
 * Carry a pre-existing wall-clock trial over to active-day accounting.
 *
 * Deliberately preserves how far the old trial had got: an already-expired user
 * stays expired rather than silently receiving a second week of Pro, and someone
 * three days in stays three days in. Returns null when there is nothing to carry.
 */
export function migrateFromStartDate(trialStartDate, timestamp = Date.now()) {
  const startedAt = Number(trialStartDate) || 0;
  if (startedAt <= 0) return null;

  const elapsedDays = Math.max(0, Math.floor((timestamp - startedAt) / 86400000));
  return {
    // Cap at one past the trial length: expired is expired, no need to keep counting.
    activeDays: Math.min(TRIAL_DAYS + 1, elapsedDays + 1),
    lastActiveDay: localDayKey(timestamp)
  };
}
