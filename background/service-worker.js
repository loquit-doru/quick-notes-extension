// Quick Notes - Service Worker
// Handles global shortcuts, context capture, and reminders

importScripts('../shared/extpay-config.js', '../lib/ExtPay.js');

const EXTPAY_EXTENSION_ID = QUICK_NOTES_EXTPAY.EXTENSION_ID;
const extpay =
  typeof ExtPay !== 'undefined' ? ExtPay(EXTPAY_EXTENSION_ID) : null;

function isExtPayUserPaid(user) {
  return !!(user && (user.paid === true || user.paidAt));
}

const PRO_API = 'https://quick-notes-pro.apiworkersdev.workers.dev';

async function getBackgroundExtensionId() {
  const { extensionId } = await chrome.storage.local.get(['extensionId']);
  if (extensionId) return extensionId;
  const id = 'qn_' + crypto.randomUUID();
  await chrome.storage.local.set({ extensionId: id });
  return id;
}

function registerStripeLicenseBackground(email) {
  const trimmed = (email || '').trim();
  if (!trimmed) return;
  getBackgroundExtensionId().then((extensionId) => {
    fetch(`${PRO_API}/register-stripe-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extensionId, email: trimmed }),
    }).catch(() => {});
  });
}

async function persistExtensionPayPro(user) {
  const payload = {
    proUnlocked: true,
    proPaidAt: new Date().toISOString(),
    paymentMethod: 'card-stripe',
  };
  if (user?.email) {
    payload.proEmail = user.email;
    payload.payerEmail = user.email.trim().toLowerCase();
  }
  await chrome.storage.local.set(payload);
  try {
    await chrome.storage.sync.set({ proUnlocked: true });
  } catch (_) {}
  if (user?.email) registerStripeLicenseBackground(user.email);
}

async function syncExtensionPayProStatus() {
  if (!extpay) return;
  try {
    const user = await extpay.getUser();
    if (isExtPayUserPaid(user)) {
      await persistExtensionPayPro(user);
    }
  } catch (err) {
    console.warn('[Quick Notes] ExtensionPay sync failed:', err);
  }
}

if (extpay) {
  extpay.startBackground();
  extpay.onPaid.addListener(async (paidUser) => {
    let user = paidUser;
    if (!isExtPayUserPaid(user)) {
      try {
        user = await extpay.getUser();
      } catch (err) {
        console.warn('[Quick Notes] ExtensionPay getUser after onPaid failed:', err);
      }
    }
    await persistExtensionPayPro(user || {});
  });
}

syncExtensionPayProStatus();

const DEBUG = false;

function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

const UPDATE_READY_NOTIF_ID = 'extension_update_ready';
const UPDATE_APPLIED_NOTIF_ID = 'extension_update_applied';

function requestExtensionUpdateCheck() {
  if (!chrome.runtime.requestUpdateCheck) return;
  chrome.runtime.requestUpdateCheck((status) => {
    debugLog('Update check:', status);
  });
}

function notifyUpdateReady(version) {
  chrome.notifications.create(UPDATE_READY_NOTIF_ID, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Quick Notes update ready',
    message: `Version ${version} is ready. Reload to apply.`,
    buttons: [{ title: 'Reload now' }],
    requireInteraction: true,
    priority: 2
  });
}

function notifyUpdateApplied(previousVersion) {
  const version = chrome.runtime.getManifest().version;
  const fromText = previousVersion ? ` (from ${previousVersion})` : '';

  chrome.notifications.create(UPDATE_APPLIED_NOTIF_ID, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Quick Notes updated',
    message: `You're now on version ${version}${fromText}.`,
    priority: 1
  });

  chrome.action.setBadgeText({ text: '↑' });
  chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
}

chrome.runtime.onUpdateAvailable.addListener((details) => {
  debugLog('Update available:', details.version);
  notifyUpdateReady(details.version);
});

// Handle extension install / update
chrome.runtime.onInstalled.addListener((details) => {
  syncExtensionPayProStatus();

  if (details.reason === 'install') {
    debugLog('Quick Notes installed');

    chrome.storage.local.set({
      settings: {
        theme: 'dark',
        quickAddMode: false,
        includeContext: true,
        fastMode: false
      }
    });
  }

  if (details.reason === 'update') {
    debugLog('Quick Notes updated:', details.previousVersion, '→', chrome.runtime.getManifest().version);
    notifyUpdateApplied(details.previousVersion);
  }

  rescheduleAllReminders();
  startReminderChecker();
  requestExtensionUpdateCheck();
});

chrome.runtime.onStartup.addListener(() => {
  syncExtensionPayProStatus();
  debugLog('Chrome started, checking reminders');
  rescheduleAllReminders();
  startReminderChecker();
  requestExtensionUpdateCheck();
});

requestExtensionUpdateCheck();

// ============================================
// REMINDER SYSTEM
// ============================================

function startReminderChecker() {
  chrome.alarms.create('reminder_checker', { periodInMinutes: 1 });
  debugLog('Reminder checker started (every 1 min)');
}

function scheduleReminder(noteId, reminderTime) {
  const alarmName = `reminder_${noteId}`;
  const when = new Date(reminderTime).getTime();

  if (when > Date.now()) {
    chrome.alarms.create(alarmName, { when });
    debugLog(`Reminder scheduled for note ${noteId} at ${new Date(when).toLocaleString()}`);
    startReminderChecker();
  }
}

function cancelReminder(noteId) {
  const alarmName = `reminder_${noteId}`;
  chrome.alarms.clear(alarmName);
  debugLog(`Reminder cancelled for note ${noteId}`);
}

async function rescheduleAllReminders() {
  try {
    const result = await chrome.storage.local.get(['reminders']);
    const reminders = result.reminders || {};

    await chrome.alarms.clearAll();

    const now = Date.now();
    let rescheduled = 0;
    let missed = 0;

    for (const [noteId, reminderData] of Object.entries(reminders)) {
      if (reminderData && reminderData.time && !reminderData.notified) {
        if (reminderData.time <= now) {
          missed++;
          debugLog(`Missed reminder for note ${noteId}, triggering now`);

          try {
            await chrome.notifications.create(`note_${noteId}`, {
              type: 'basic',
              iconUrl: chrome.runtime.getURL('icons/icon128.png'),
              title: 'Missed Reminder!',
              message: reminderData.title || 'You have a note reminder!',
              buttons: [
                { title: 'Open Note' },
                { title: 'Snooze 10min' }
              ],
              requireInteraction: true,
              priority: 2
            });
          } catch (err) {
            console.error('Failed to show missed reminder:', err);
          }

          reminders[noteId] = { ...reminderData, notified: true };
        } else {
          rescheduled++;
          scheduleReminder(noteId, reminderData.time);
        }
      }
    }

    await chrome.storage.local.set({ reminders });
    debugLog(`Reminders: ${rescheduled} rescheduled, ${missed} missed (notified now)`);

    startReminderChecker();
  } catch (e) {
    console.error('Failed to reschedule reminders:', e);
  }
}

async function checkDueReminders() {
  const now = Date.now();
  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || {};

  debugLog('Checking reminders at', new Date(now).toLocaleString());

  for (const [noteId, reminderData] of Object.entries(reminders)) {
    if (reminderData && reminderData.time && !reminderData.notified && reminderData.time <= now) {
      debugLog(`Due reminder found for note ${noteId}`);
      await triggerReminder(noteId, reminderData);
      reminders[noteId] = { ...reminderData, notified: true };
    }
  }

  await chrome.storage.local.set({ reminders });
}

async function triggerReminder(noteId, reminderData) {
  debugLog('Triggering notification for:', noteId, reminderData.title);

  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });

  return new Promise((resolve) => {
    const notifId = `note_${noteId}`;
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Quick Notes Reminder',
      message: reminderData.title || 'You have a note reminder!'
    }, (createdId) => {
      if (chrome.runtime.lastError) {
        console.error('Notification error:', chrome.runtime.lastError.message);
      } else {
        debugLog('Notification created:', createdId);
      }
      resolve();
    });
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  debugLog('Alarm triggered:', alarm.name);

  if (alarm.name === 'reminder_checker') {
    await checkDueReminders();
    return;
  }

  if (alarm.name.startsWith('reminder_')) {
    const noteId = alarm.name.replace('reminder_', '');

    const result = await chrome.storage.local.get(['reminders']);
    const reminders = result.reminders || {};
    const reminderData = reminders[noteId];

    if (reminderData && !reminderData.notified) {
      await triggerReminder(noteId, reminderData);
      reminders[noteId] = { ...reminderData, notified: true };
      await chrome.storage.local.set({ reminders });
      debugLog(`Reminder triggered for note: ${noteId}`);
    }
  }
});

function parseNoteIdFromNotification(notificationId) {
  const prefix = 'note_';
  if (!notificationId.startsWith(prefix)) return null;
  return notificationId.slice(prefix.length);
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId === UPDATE_READY_NOTIF_ID) {
    if (buttonIndex === 0) chrome.runtime.reload();
    chrome.notifications.clear(notificationId);
    return;
  }

  const noteId = parseNoteIdFromNotification(notificationId);
  if (noteId) {
    if (buttonIndex === 0) {
      await chrome.storage.local.set({ openNoteId: noteId });
      chrome.action.openPopup();
    } else if (buttonIndex === 1) {
      const snoozeTime = Date.now() + 10 * 60 * 1000;
      const result = await chrome.storage.local.get(['reminders']);
      const reminders = result.reminders || {};

      if (reminders[noteId]) {
        reminders[noteId] = {
          ...reminders[noteId],
          time: snoozeTime,
          notified: false
        };
        await chrome.storage.local.set({ reminders });
        scheduleReminder(noteId, snoozeTime);

        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: 'Snoozed',
          message: 'Reminder will repeat in 10 minutes',
          priority: 1
        });
      }
    }

    chrome.notifications.clear(notificationId);
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === UPDATE_READY_NOTIF_ID) {
    chrome.runtime.reload();
    chrome.notifications.clear(notificationId);
    return;
  }

  if (notificationId === UPDATE_APPLIED_NOTIF_ID) {
    chrome.action.setBadgeText({ text: '' });
    chrome.notifications.clear(notificationId);
    return;
  }

  const noteId = parseNoteIdFromNotification(notificationId);
  if (noteId) {
    await chrome.storage.local.set({ openNoteId: noteId });
    chrome.action.openPopup();
    chrome.notifications.clear(notificationId);
  }
});

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
    return true;
  }

  if (request.action === 'setReminder') {
    const { noteId, reminderTime, noteTitle } = request;
    debugLog('setReminder request:', { noteId, reminderTime, noteTitle });

    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || {};
      reminders[noteId] = {
        time: reminderTime,
        title: noteTitle,
        notified: false
      };
      chrome.storage.local.set({ reminders }, () => {
        scheduleReminder(noteId, reminderTime);
        startReminderChecker();
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (request.action === 'cancelReminder') {
    const { noteId } = request;

    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || {};
      delete reminders[noteId];
      chrome.storage.local.set({ reminders }, () => {
        cancelReminder(noteId);
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (request.action === 'getReminder') {
    const { noteId } = request;

    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || {};
      sendResponse(reminders[noteId] || null);
    });
    return true;
  }
});
