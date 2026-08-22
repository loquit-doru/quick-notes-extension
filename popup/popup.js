// Quick Notes - Local-first notes for browser workflows
// Instant capture, keyboard-friendly, no cloud sync.

import * as db from '../storage/db.js';
import * as backup from '../storage/backup.js';
import { runStorageMigrations } from '../storage/migrations.js';
import { REVIEW_STATUS, getStoreReviewUrl } from '../shared/config.js';
import { describeTrial, migrateFromStartDate, recordActiveDay } from '../shared/trial.js';
import {
  applyListFilters as applyListFiltersPure,
  countNeedsReview,
  isArchivedNote,
  isBrowsableNote
} from '../shared/note-filters.js';
import { noteMatchesCurrentPage, noteMatchesCurrentDomain } from '../shared/url-utils.js';
import { getCurrentTabContext } from '../shared/tab-context.js';
import {
  getAnalyticsSettings,
  setAnalyticsEnabled,
  trackFunnelEvent,
  trackFunnelEventOnce
} from '../shared/analytics.js';

// ⚡ PERFORMANCE: Track load time from the very start
const LOAD_START = performance.now();

// ============================================
// MODAL A11Y (focus trap + stack + inert)
// ============================================

function createModalA11y() {
  const supportsInert = 'inert' in HTMLElement.prototype;
  const stack = [];
  const configs = new Map(); // modalEl -> { onRequestClose, initialFocusEl }
  const openerByModal = new Map(); // modalEl -> HTMLElement | null

  function isVisible(el) {
    return !!(el && el.style && el.style.display !== 'none');
  }

  function isFocusable(el) {
    if (!el) return false;
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return true;
  }

  function getFocusableElements(root) {
    if (!root) return [];
    const candidates = root.querySelectorAll(
      [
        'a[href]',
        'area[href]',
        'button',
        'input',
        'select',
        'textarea',
        '[tabindex]',
        '[contenteditable="true"]'
      ].join(',')
    );
    const focusables = [];
    for (const el of candidates) {
      if (!isFocusable(el)) continue;
      const tabIndex = el.getAttribute('tabindex');
      if (tabIndex === '-1') continue;
      // Skip elements hidden via attribute (common in menus)
      if (el.hasAttribute('hidden')) continue;
      focusables.push(el);
    }
    return focusables;
  }

  function setBackgroundInert(topModal) {
    const bodyChildren = Array.from(document.body.children);
    for (const child of bodyChildren) {
      // Never touch scripts
      if (child.tagName === 'SCRIPT') continue;

      const shouldDisable = child !== topModal;
      if (supportsInert) {
        child.inert = shouldDisable;
      } else {
        if (shouldDisable) {
          child.setAttribute('aria-hidden', 'true');
        } else {
          child.removeAttribute('aria-hidden');
        }
      }

      if (shouldDisable) {
        child.classList.add('a11y-inert');
      } else {
        child.classList.remove('a11y-inert');
      }
    }
  }

  function clearBackgroundInert() {
    const bodyChildren = Array.from(document.body.children);
    for (const child of bodyChildren) {
      if (child.tagName === 'SCRIPT') continue;
      if (supportsInert) child.inert = false;
      child.removeAttribute('aria-hidden');
      child.classList.remove('a11y-inert');
    }
  }

  function getTopModal() {
    return stack.length ? stack[stack.length - 1] : null;
  }

  function focusInitial(modalEl) {
    const cfg = configs.get(modalEl) || {};
    const preferred = cfg.initialFocusEl;
    const focusables = getFocusableElements(modalEl);

    const target =
      (preferred && modalEl.contains(preferred) && isFocusable(preferred) && preferred) ||
      (focusables.length ? focusables[0] : null);

    if (target) {
      target.focus({ preventScroll: true });
      return;
    }

    // As a last resort, focus the modal itself.
    if (!modalEl.hasAttribute('tabindex')) modalEl.setAttribute('tabindex', '-1');
    modalEl.focus({ preventScroll: true });
  }

  function trapTabKey(e, modalEl) {
    if (e.key !== 'Tab') return false;
    const focusables = getFocusableElements(modalEl);
    if (!focusables.length) {
      e.preventDefault();
      return true;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !modalEl.contains(active)) {
        e.preventDefault();
        last.focus({ preventScroll: true });
        return true;
      }
      return false;
    }

    // Forward tab
    if (active === last || !modalEl.contains(active)) {
      e.preventDefault();
      first.focus({ preventScroll: true });
      return true;
    }
    return false;
  }

  // Capture phase so we can stop propagation before app handlers.
  document.addEventListener(
    'keydown',
    (e) => {
      const top = getTopModal();
      if (!top) return;
      if (!isVisible(top)) return;

      if (e.key === 'Escape') {
        const cfg = configs.get(top);
        if (cfg?.onRequestClose) {
          e.preventDefault();
          e.stopPropagation();
          cfg.onRequestClose();
        }
        return;
      }

      if (e.key === 'Tab') {
        const trapped = trapTabKey(e, top);
        if (trapped) {
          e.stopPropagation();
        }
      }
    },
    true
  );

  return {
    register(modalEl, { onRequestClose, initialFocusEl } = {}) {
      if (!modalEl) return;
      configs.set(modalEl, { onRequestClose, initialFocusEl });
    },
    open(modalEl) {
      if (!modalEl) return;
      if (!isVisible(modalEl)) return;

      openerByModal.set(modalEl, document.activeElement instanceof HTMLElement ? document.activeElement : null);

      // De-dupe if already top/open.
      const existingIdx = stack.indexOf(modalEl);
      if (existingIdx !== -1) stack.splice(existingIdx, 1);
      stack.push(modalEl);

      setBackgroundInert(modalEl);
      focusInitial(modalEl);
    },
    close(modalEl) {
      if (!modalEl) return;
      const idx = stack.indexOf(modalEl);
      if (idx !== -1) stack.splice(idx, 1);

      const newTop = getTopModal();
      if (newTop) {
        setBackgroundInert(newTop);
        focusInitial(newTop);
      } else {
        clearBackgroundInert();
      }

      const opener = openerByModal.get(modalEl);
      openerByModal.delete(modalEl);
      if (opener && document.contains(opener) && isFocusable(opener)) {
        opener.focus({ preventScroll: true });
      }
    }
  };
}

const modalA11y = createModalA11y();

// State
let currentNote = null;
let notes = [];
let currentContext = null;
let isFirstRun = false;
let isPro = false;  // Pro status - declared early for use in trial system
let currentFolderId = 'all';  // Current folder filter
let listViewFilter = 'default'; // default | needs-review | page | site | archived
let trashCountCache = 0;
let currentTabContext = null;
let folders = [];  // All folders
let allNotesCache = []; // full list for counts / page memory
let enteredPin = '';  // Current PIN being entered
let isSettingPin = false;  // Whether we're setting a new PIN
let settings = {
  theme: 'dark',
  quickAddMode: false,
  includeContext: true,
  fastMode: false
};

// ============================================
// 🎁 TRIAL SYSTEM (7 days of full access, counted in days actually used)
// ============================================
const TRIAL_STATE_KEY = 'trialUsage';
let trialInfo = {
  activeDays: 0,
  isTrialActive: false,
  daysRemaining: 0,
  isExpired: false
};

const ONBOARDING_STATE_KEY = 'onboardingState';
const BACKUP_BANNER_DISMISS_KEY = 'backupBannerDismissedAt';
const BACKUP_RECENCY_MS = 7 * 24 * 60 * 60 * 1000;

// ============================================
// ⭐ REVIEW PROMPT
// Asked only after Quick Notes has proved useful: never on install, never while
// someone is still evaluating it. Store ranking rewards ratings, but a prompt
// shown too early costs a bad one.
// ============================================
const FIRST_USE_KEY = 'firstUseAt';
const REVIEW_PROMPT_STATE_KEY = 'reviewPromptState';
const REVIEW_MIN_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const REVIEW_MIN_NOTES = 5;
const REVIEW_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const REVIEW_MAX_SNOOZES = 2;
let onboardingState = {
  firstNoteSaved: false,
  reminderCreated: false,
  backupNudged: false,
};

async function loadOnboardingState() {
  const stored = await chrome.storage.local.get([ONBOARDING_STATE_KEY]);
  onboardingState = {
    ...onboardingState,
    ...(stored[ONBOARDING_STATE_KEY] || {}),
  };
}

async function saveOnboardingState(patch) {
  onboardingState = { ...onboardingState, ...patch };
  await chrome.storage.local.set({ [ONBOARDING_STATE_KEY]: onboardingState });
}

function hasMeaningfulNoteContent(title, content) {
  const hasTitle = (title || '').trim() && (title || '').trim().toLowerCase() !== 'untitled';
  const textLength = (content || '').replace(/<[^>]*>/g, '').trim().length;
  return Boolean(hasTitle || textLength >= 12);
}

async function initTrialSystem() {
  const stored = await chrome.storage.local.get([
    TRIAL_STATE_KEY,
    'trialStartDate',
    'proUnlocked'
  ]);

  // If Pro, no trial needed
  if (stored.proUnlocked) {
    trialInfo.isTrialActive = false;
    trialInfo.isExpired = false;
    return;
  }

  // Self-migrating rather than handled in storage/migrations.js, because this runs
  // before runStorageMigrations() during init and the order is not worth disturbing.
  const existing = stored[TRIAL_STATE_KEY] || migrateFromStartDate(stored.trialStartDate);

  const next = recordActiveDay(existing);
  if (next.changed) {
    await chrome.storage.local.set({
      [TRIAL_STATE_KEY]: { activeDays: next.activeDays, lastActiveDay: next.lastActiveDay }
    });
    if (next.activeDays === 1) {
      await trackFunnelEvent('trial_started', { source: 'popup' });
    }
  }

  const status = describeTrial(next);
  trialInfo.activeDays = status.activeDays;
  trialInfo.daysRemaining = status.daysRemaining;
  trialInfo.isTrialActive = status.isTrialActive;
  trialInfo.isExpired = status.isExpired;
}

// ============================================
// 🔒 FREE vs PRO LIMITS (used after trial)
// ============================================
const FREE_LIMITS = {
  maxNotes: 10,
  canSearch: false,
  canExport: true  // Export is FREE - builds trust!
};

function showLimitWarning(message) {
  showToast(message + ' ✨ Upgrade to Pro');
  openProModal('limits');
}

// ============================================
// 🎁 TRIAL BANNER UI
// ============================================
function updateTrialBanner() {
  if (!elements.trialBanner) return;
  
  // Pro users - hide banner
  if (isPro) {
    elements.trialBanner.style.display = 'none';
    return;
  }
  
  // During trial - show countdown
  if (trialInfo.isTrialActive) {
    elements.trialBanner.style.display = 'flex';
    elements.trialBanner.className = 'trial-banner active';
    // "Trial days" rather than "days": the counter only moves on days it is used,
    // and the tooltip says so instead of letting people assume a wall clock.
    elements.trialBanner.title = 'Trial days count only the days you open Quick Notes.';
    if (elements.trialDays) {
      if (trialInfo.daysRemaining === 1) {
        elements.trialDays.textContent = 'Last trial day';
      } else {
        elements.trialDays.textContent = `${trialInfo.daysRemaining} trial days left`;
      }
    }
  }
  // Trial expired - show upgrade prompt
  else if (trialInfo.isExpired) {
    elements.trialBanner.style.display = 'flex';
    elements.trialBanner.className = 'trial-banner expired';
    if (elements.trialDays) {
      elements.trialDays.textContent = 'Trial ended. Keep free limits or upgrade if you need unlimited notes and folders.';
    }
  }
}

// Check current limits (trial or free)
function getCurrentLimits() {
  if (isPro || trialInfo.isTrialActive) {
    return {
      maxNotes: Infinity,
      canSearch: true,
      canExport: true
    };
  }
  return FREE_LIMITS;
}

function canUseFolders() {
  return isPro || trialInfo.isTrialActive;
}

function updateFolderAccessUI() {
  const allowed = canUseFolders();
  const folderFilter = document.getElementById('folderFilter');
  const noteFolderRow = document.querySelector('.note-folder-row');
  if (folderFilter) folderFilter.style.display = allowed ? '' : 'none';
  if (noteFolderRow) noteFolderRow.style.display = allowed ? '' : 'none';
  if (elements.manageFoldersBtn) {
    elements.manageFoldersBtn.title = allowed ? 'More' : 'More';
  }
}

function updateTrashInfoLabel() {
  const el = document.getElementById('trashInfo');
  if (!el) return;
  const days = db.getTrashRetentionDays(isPro);
  el.textContent = days === 1
    ? 'Notes are kept for 24 hours before permanent deletion'
    : 'Notes are kept for 7 days before permanent deletion';
}

// ============================================
// VIEW MANAGEMENT
// ============================================

function showView(view) {
  const searchContainer = document.getElementById('searchContainer');
  const folderFilter = document.getElementById('folderFilter');
  const popupPrimaryAction = document.getElementById('popupPrimaryAction');
  const isListView = view === 'list';

  if (elements.listView) elements.listView.style.display = view === 'list' ? 'block' : 'none';
  if (elements.editorView) elements.editorView.style.display = view === 'editor' ? 'block' : 'none';
  if (elements.trashView) elements.trashView.style.display = view === 'trash' ? 'block' : 'none';

  if (popupPrimaryAction) popupPrimaryAction.style.display = isListView ? 'block' : 'none';
  if (searchContainer) searchContainer.style.display = isListView ? 'block' : 'none';
  if (elements.pageMemorySection) {
    if (!isListView) {
      elements.pageMemorySection.hidden = true;
    } else {
      updatePageMemoryUI();
    }
  }
  if (folderFilter) folderFilter.style.display = isListView ? 'flex' : 'none';
  if (elements.tabBar) elements.tabBar.style.display = view === 'editor' ? 'none' : 'flex';
  syncTabBar(view);
}

// ============================================
// 📑 BOTTOM TAB BAR
// The tabs present state that already existed: three of them are listViewFilter
// values, and Trash is its own view. Nothing new is stored.
// ============================================
const TAB_FILTERS = { notes: 'default', inbox: 'needs-review', page: 'page' };

/** Reflect the current view/filter on the tabs. aria-selected drives the styling. */
function syncTabBar(view) {
  if (!elements.tabBar) return;
  let active = null;
  if (view === 'trash') {
    active = 'trash';
  } else if (view !== 'editor') {
    active = Object.keys(TAB_FILTERS).find((t) => TAB_FILTERS[t] === listViewFilter) || 'notes';
  }
  elements.tabBar.querySelectorAll('.tab-item').forEach((btn) => {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === active));
  });
}

async function setActiveTab(tab) {
  if (tab === 'trash') {
    await openTrash();
    return;
  }
  showView('list');
  if (tab === 'inbox') {
    // Goes through applyPrimaryListFilter so the folder selection is cleared:
    // Inbox and a folder are mutually exclusive, and picking one must drop the
    // other or the list silently shows their intersection.
    applyPrimaryListFilter('needs-review');
  } else if (tab === 'page') {
    setListViewFilter('page');
  } else {
    applyPrimaryListFilter('all');
  }
}

/** Counts come from the same sources the rest of the UI already uses. */
function updateTabBadges() {
  if (!elements.tabBar) return;
  const setBadge = (id, count) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : String(count);
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  };
  setBadge('tabBadge-inbox', countNeedsReview(allNotesCache));
  setBadge('tabBadge-trash', trashCountCache);
  setBadge('tabBadge-page', currentTabContext ? getPageMemoryCounts().page : 0);
}

function setupTabBar() {
  if (!elements.tabBar) return;
  elements.tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-item');
    if (btn?.dataset.tab) setActiveTab(btn.dataset.tab);
  });
}

// Two-step confirm to replace browser confirm() (blocked in extensions)
function twoStepConfirm(btn, originalHtml, onConfirm) {
  if (btn._confirming) {
    clearTimeout(btn._confirmTimer);
    btn._confirming = false;
    btn.innerHTML = originalHtml;
    btn.classList.remove('btn-confirming');
    onConfirm();
    return;
  }
  btn._confirming = true;
  btn.innerHTML = '✓?';
  btn.classList.add('btn-confirming');
  btn._confirmTimer = setTimeout(() => {
    btn._confirming = false;
    btn.innerHTML = originalHtml;
    btn.classList.remove('btn-confirming');
  }, 2500);
}

// DOM Elements
let elements = {};

function initDomElements() {
  elements = {
    listView: document.getElementById('listView'),
    editorView: document.getElementById('editorView'),
    trashView: document.getElementById('trashView'),
    notesList: document.getElementById('notesList'),
    emptyState: document.getElementById('emptyState'),
    searchInput: document.getElementById('searchInput'),
    clearSearch: document.getElementById('clearSearch'),
    newNoteBtn: document.getElementById('newNoteBtn'),
    backBtn: document.getElementById('backBtn'),
    noteTitleInput: document.getElementById('noteTitleInput'),
    noteContentEditor: document.getElementById('noteContentEditor'),
    pinNoteBtn: document.getElementById('pinNoteBtn'),
    deleteNoteBtn: document.getElementById('deleteNoteBtn'),
    noteDate: document.getElementById('noteDate'),
    noteChars: document.getElementById('noteChars'),
    saveStatus: document.getElementById('saveStatus'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    themeSelect: document.getElementById('themeSelect'),
    fastModeToggle: document.getElementById('fastModeToggle'),
    includeContextToggle: document.getElementById('includeContextToggle'),
    quickAddToggle: document.getElementById('quickAddToggle'),
    analyticsToggle: document.getElementById('analyticsToggle'),
    tabBar: document.getElementById('tabBar'),
    // Context
    contextInfo: document.getElementById('contextInfo'),
    contextFavicon: document.getElementById('contextFavicon'),
    contextLink: document.getElementById('contextLink'),
    removeContext: document.getElementById('removeContext'),
    // Reminder
    reminderBtn: document.getElementById('reminderBtn'),
    reminderBar: document.getElementById('reminderBar'),
    reminderText: document.getElementById('reminderText'),
    removeReminderBtn: document.getElementById('removeReminderBtn'),
    reminderModal: document.getElementById('reminderModal'),
    closeReminderBtn: document.getElementById('closeReminderBtn'),
    reminderDateTime: document.getElementById('reminderDateTime'),
    setReminderBtn: document.getElementById('setReminderBtn'),
    // New: Toast & Welcome
    copyToast: document.getElementById('copyToast'),
    welcomeModal: document.getElementById('welcomeModal'),
    welcomeSpeed: document.getElementById('welcomeSpeed'),
    welcomeStartBtn: document.getElementById('welcomeStartBtn'),
    // Trash
    trashList: document.getElementById('trashList'),
    trashBackBtn: document.getElementById('trashBackBtn'),
    emptyTrashBtn: document.getElementById('emptyTrashBtn'),
    trashEmptyState: document.getElementById('trashEmptyState'),
    // Trial banner
    trialBanner: document.getElementById('trialBanner'),
    trialDays: document.getElementById('trialDays'),
    trialUpgradeBtn: document.getElementById('trialUpgradeBtn'),
    backupSafetyBanner: document.getElementById('backupSafetyBanner'),
    backupSafetyActionBtn: document.getElementById('backupSafetyActionBtn'),
    reviewBanner: document.getElementById('reviewBanner'),
    reviewBannerActionBtn: document.getElementById('reviewBannerActionBtn'),
    reviewBannerDismissBtn: document.getElementById('reviewBannerDismissBtn'),
    backupSafetyDismissBtn: document.getElementById('backupSafetyDismissBtn'),
    // Folders
    pageMemorySection: document.getElementById('pageMemorySection'),
    pageMemoryStats: document.getElementById('pageMemoryStats'),
    showPageNotesBtn: document.getElementById('showPageNotesBtn'),
    showSiteNotesBtn: document.getElementById('showSiteNotesBtn'),
    emptyStateIcon: document.getElementById('emptyStateIcon'),
    emptyStateText: document.getElementById('emptyStateText'),
    emptyStateSubtext: document.getElementById('emptyStateSubtext'),
    folderPills: document.getElementById('folderPills'),
    listFilterMenu: document.getElementById('listFilterMenu'),
    listFilterMoreWrap: document.getElementById('listFilterMoreWrap'),
    manageFoldersBtn: document.getElementById('manageFoldersBtn'),
    noteFolderSelect: document.getElementById('noteFolderSelect'),
    foldersModal: document.getElementById('foldersModal'),
    closeFoldersBtn: document.getElementById('closeFoldersBtn'),
    newFolderInput: document.getElementById('newFolderInput'),
    addFolderBtn: document.getElementById('addFolderBtn'),
    foldersList: document.getElementById('foldersList'),
    // PIN Lock
    lockScreen: document.getElementById('lockScreen'),
    lockIcon: document.getElementById('lockIcon'),
    lockMessage: document.getElementById('lockMessage'),
    pinDots: document.getElementById('pinDots'),
    pinKeypad: document.getElementById('pinKeypad'),
    forgotPinBtn: document.getElementById('forgotPinBtn'),
    pinLockToggle: document.getElementById('pinLockToggle'),
    changePinBtn: document.getElementById('changePinBtn'),
    // Reset PIN
    resetPinModal: document.getElementById('resetPinModal'),
    closeResetPinBtn: document.getElementById('closeResetPinBtn'),
    resetConfirmInput: document.getElementById('resetConfirmInput'),
    cancelResetBtn: document.getElementById('cancelResetBtn'),
    confirmResetBtn: document.getElementById('confirmResetBtn')
  };
}

// ============================================
// INITIALIZATION
// ============================================

function setProCheckLoading(visible) {
  const el = document.getElementById('proCheckLoading');
  if (!el) return;
  if (visible) {
    el.removeAttribute('hidden');
    el.setAttribute('aria-busy', 'true');
  } else {
    el.setAttribute('hidden', '');
    el.setAttribute('aria-busy', 'false');
  }
}

function applyProUnlockedUi() {
  document.body.classList.add('is-pro');
  const proHeaderBtn = document.getElementById('proHeaderBtn');
  if (proHeaderBtn) proHeaderBtn.textContent = '✓';
  updateFolderAccessUI();
  updateTrashInfoLabel();
}

async function awaitExtensionPayProCheck() {
  if (!window.QuickNotesPro?.checkExtensionPayPro) return;
  let loadingTimer;
  try {
    loadingTimer = setTimeout(() => setProCheckLoading(true), 120);
    const result = await window.QuickNotesPro.checkExtensionPayPro();
    if (result.unlocked) {
      if (!isPro) {
        await trackFunnelEvent('purchase_restored', { source: result.source || 'auto_check' });
      }
      isPro = true;
      applyProUnlockedUi();
    }
  } finally {
    clearTimeout(loadingTimer);
    setProCheckLoading(false);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initDomElements();
  initModalA11y();
  
  // Clear reminder badge when popup opens
  chrome.action.setBadgeText({ text: '' });
  
  // Setup PIN listeners FIRST (needed for lock screen)
  setupPinListeners();

  // Check PIN lock first
  const isLocked = await checkPinLock();
  if (isLocked) {
    // Wait for unlock before continuing
    return;
  }
  
  await initializeApp();
});

async function initializeApp() {
  // ExtensionPay before trial limits / paywall UI
  await awaitExtensionPayProCheck();
  await loadOnboardingState();

  // Check if first run
  const stored = await chrome.storage.local.get(['hasLaunched']);
  isFirstRun = !stored.hasLaunched;

  // Initialize trial system
  await initTrialSystem();
  await checkProStatus();
  setupProModalHandlers();
  await checkOpenFromNotification();
  
  await loadSettings();
  await runStorageMigrations();
  updateAppVersionFooter();
  await refreshCurrentTabContext();
  await loadFolders();
  await loadNotes();
  await setupAnalyticsControls();
  updatePageMemoryUI();
  updateReviewFilterUI();
  await updateTrashButton();
  await maybeOfferLocalBackupRestore();
  await trackFunnelEventOnce('first_open', 'first_open', { source: isFirstRun ? 'welcome' : 'popup' });
  setupEventListeners();
  setupTabBar();
  setupBackupListeners();
  await updateBackupUI();
  await updateBackupSafetyBanner();
  await ensureFirstUseTimestamp();
  await updateReviewBanner();
  setupToolbar();
  setupKeyboardShortcuts();
  setupFoldersAndPinListeners();
  
  // Update PIN toggle state in settings
  updatePinToggleState();
  
  // Clean expired trash on startup (pass isPro status)
  await db.cleanExpiredTrash(isPro);
  
  // Update trial banner
  updateTrialBanner();
  updateFolderAccessUI();
  updateTrashInfoLabel();

  const loadTime = performance.now() - LOAD_START;
  console.log(`⚡ Quick Notes loaded in ${loadTime.toFixed(1)}ms`);

  // 🎉 FIRST RUN EXPERIENCE - THE WOW MOMENT
  if (isFirstRun) {
    showWelcome(loadTime);
  } else if (settings.quickAddMode) {
    // Quick Add Mode - go directly to editor
    await createNewNote();
  }
}

function initModalA11y() {
  modalA11y.register(elements.settingsModal, {
    onRequestClose: () => closeSettings(),
    initialFocusEl: elements.closeSettingsBtn
  });
  modalA11y.register(elements.reminderModal, {
    onRequestClose: () => closeReminderModal(),
    initialFocusEl: elements.closeReminderBtn
  });
  modalA11y.register(document.getElementById('proModal'), {
    onRequestClose: () => closeProModal(),
    initialFocusEl: document.getElementById('closeProBtn')
  });
  modalA11y.register(elements.welcomeModal, {
    onRequestClose: () => dismissWelcome(),
    initialFocusEl: elements.welcomeStartBtn
  });
  modalA11y.register(elements.foldersModal, {
    onRequestClose: () => closeFoldersModal(),
    initialFocusEl: elements.closeFoldersBtn
  });
  modalA11y.register(elements.resetPinModal, {
    onRequestClose: () => closeResetPinModal(),
    initialFocusEl: elements.closeResetPinBtn
  });
}

// ============================================
// 🎉 FIRST RUN WELCOME - THE WOW MOMENT
// ============================================

function showWelcome(loadTime) {
  if (elements.welcomeSpeed) {
    elements.welcomeSpeed.textContent = `Loaded in ${Math.round(loadTime)}ms`;
  }
  if (elements.welcomeModal) {
    elements.welcomeModal.style.display = 'flex';
    modalA11y.open(elements.welcomeModal);
  }
}

async function dismissWelcome() {
  if (elements.welcomeModal) {
    modalA11y.close(elements.welcomeModal);
    elements.welcomeModal.style.display = 'none';
  }
  await trackFunnelEvent('onboarding_started', { source: 'welcome_modal' });
  // Mark as launched
  await chrome.storage.local.set({ hasLaunched: true });
  // Go directly to editor for first note!
  await createNewNote();
  // Update placeholder for first time
  if (elements.noteContentEditor) {
    elements.noteContentEditor.setAttribute('placeholder', 'Type and press Ctrl+Enter to save ⚡');
  }
}

// ============================================
// SETTINGS
// ============================================

async function loadSettings() {
  const stored = await chrome.storage.local.get(['settings']);
  if (stored.settings) {
    settings = { ...settings, ...stored.settings };
  }

  // Apply theme
  document.body.dataset.theme = settings.theme;
  document.body.dataset.fast = settings.fastMode;

  if (elements.themeSelect) elements.themeSelect.value = settings.theme;
  if (elements.fastModeToggle) elements.fastModeToggle.checked = settings.fastMode;
  if (elements.includeContextToggle) elements.includeContextToggle.checked = settings.includeContext;
  if (elements.quickAddToggle) elements.quickAddToggle.checked = settings.quickAddMode;
}

async function saveSettings() {
  await chrome.storage.local.set({ settings });
}

function updateAppVersionFooter() {
  const el = document.getElementById('appVersionText');
  if (!el) return;
  try {
    const v = chrome.runtime.getManifest().version;
    el.textContent = `Quick Notes v${v}`;
  } catch {
    el.textContent = 'Quick Notes';
  }
}

// ============================================
// NOTES CRUD
// ============================================

async function loadNotes() {
  allNotesCache = await db.getAllNotes();
  syncNotesFromPrimaryFilters();
  renderFromPrimaryFilters();
  updateBackupSafetyBanner();
}

/** Rebuild `notes` from folder + full cache (before list-view filters). */
function syncNotesFromPrimaryFilters() {
  if (currentFolderId && currentFolderId !== 'all') {
    notes = allNotesCache.filter((n) => n.folderId === currentFolderId);
  } else {
    notes = [...allNotesCache];
  }
}

function renderFromPrimaryFilters() {
  if (elements.searchInput?.value.trim()) {
    searchNotes(elements.searchInput.value);
  } else {
    applyListFiltersAndRender();
  }
  updatePageMemoryUI();
  updateReviewFilterUI();
  // Every filter change funnels through here, whoever triggered it — a tab, a
  // folder pill, or the overflow menu — so the tab bar cannot fall out of sync.
  syncTabBar('list');
}

/**
 * Mutually exclusive primary list views (All / Inbox / Personal / Work / Archived).
 * Page/site memory filters use setListViewFilter directly.
 */
function applyPrimaryListFilter(primary) {
  switch (primary) {
    case 'all':
      currentFolderId = 'all';
      listViewFilter = 'default';
      break;
    case 'needs-review':
      currentFolderId = 'all';
      listViewFilter = 'needs-review';
      break;
    case 'personal':
      currentFolderId = 'personal';
      listViewFilter = 'default';
      break;
    case 'work':
      currentFolderId = 'work';
      listViewFilter = 'default';
      break;
    case 'archived':
      currentFolderId = 'all';
      listViewFilter = 'archived';
      break;
    default:
      break;
  }
  syncNotesFromPrimaryFilters();
  renderFromPrimaryFilters();
}

function applyListFilters(noteList) {
  return applyListFiltersPure(noteList, {
    listViewFilter,
    tabContext: currentTabContext
  });
}

function applyListFiltersAndRender(filteredOverride = null) {
  const base = filteredOverride ?? notes;
  const display = applyListFilters(base);
  renderNotesList(display);
  updateEmptyStateForFilter(display);
}

async function refreshCurrentTabContext() {
  currentTabContext = await getCurrentTabContext();
}

function getPageMemoryCounts() {
  if (!currentTabContext?.url) return { page: 0, site: 0 };
  const browsable = allNotesCache.filter(isBrowsableNote);
  return {
    page: browsable.filter((n) => noteMatchesCurrentPage(n, currentTabContext)).length,
    site: browsable.filter((n) => noteMatchesCurrentDomain(n, currentTabContext)).length
  };
}

function updatePageMemoryUI() {
  const section = elements.pageMemorySection;
  if (!section) return;

  const { page, site } = getPageMemoryCounts();
  const hasRelated = page > 0 || site > 0;

  if (!hasRelated || !currentTabContext) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  if (elements.pageMemoryStats) {
    const pageLabel = page === 1 ? '1 on this page' : `${page} on this page`;
    const siteLabel = site === 1 ? '1 on this site' : `${site} on this site`;
    elements.pageMemoryStats.textContent = `${pageLabel} · ${siteLabel}`;
  }

  if (elements.showPageNotesBtn) {
    elements.showPageNotesBtn.classList.toggle('active', listViewFilter === 'page');
    elements.showPageNotesBtn.disabled = page === 0;
  }
  if (elements.showSiteNotesBtn) {
    elements.showSiteNotesBtn.classList.toggle('active', listViewFilter === 'site');
    elements.showSiteNotesBtn.disabled = site === 0;
  }
}

function updateReviewFilterUI() {
  updateFolderUI();
}

function updateEmptyStateForFilter(displayNotes) {
  if (!elements.emptyState) return;
  if (displayNotes.length > 0) return;

  if (listViewFilter === 'needs-review') {
    if (elements.emptyStateIcon) elements.emptyStateIcon.textContent = '📥';
    if (elements.emptyStateText) elements.emptyStateText.textContent = 'Inbox is empty';
    if (elements.emptyStateSubtext) elements.emptyStateSubtext.textContent = 'No new notes';
    return;
  }

  if (listViewFilter === 'archived') {
    if (elements.emptyStateIcon) elements.emptyStateIcon.textContent = '📦';
    if (elements.emptyStateText) elements.emptyStateText.textContent = 'No archived notes';
    if (elements.emptyStateSubtext) elements.emptyStateSubtext.textContent = '';
    return;
  }

  if (listViewFilter === 'page' || listViewFilter === 'site') {
    if (elements.emptyStateIcon) elements.emptyStateIcon.textContent = '🔖';
    if (elements.emptyStateText) {
      elements.emptyStateText.textContent =
        listViewFilter === 'page' ? 'No notes for this page' : 'No notes from this site';
    }
    if (elements.emptyStateSubtext) elements.emptyStateSubtext.textContent = '';
    return;
  }

  if (elements.emptyStateIcon) elements.emptyStateIcon.textContent = '⚡';
  if (elements.emptyStateText) elements.emptyStateText.textContent = 'Capture your first thought';
  if (elements.emptyStateSubtext) {
    elements.emptyStateSubtext.innerHTML = 'Press <kbd>Ctrl+N</kbd> or click New Note';
  }
}

function setListViewFilter(filter) {
  listViewFilter = filter;
  renderFromPrimaryFilters();
}

function updateNotesLimitIndicator() {
  const limitIndicator = document.getElementById('notesLimitIndicator');
  if (!limitIndicator) return;
  
  const limits = getCurrentLimits();
  
  // Pro or trial active - no limits
  if (isPro || trialInfo.isTrialActive) {
    limitIndicator.style.display = 'none';
    return;
  }
  
  // After trial - show limits
  const activeCount = allNotesCache.filter(isBrowsableNote).length;
  const remaining = limits.maxNotes - activeCount;
  if (remaining <= 3 && remaining > 0) {
    limitIndicator.textContent = remaining + ' notes left';
    limitIndicator.className = 'limit-indicator warning';
    limitIndicator.style.display = 'block';
  } else if (remaining <= 0) {
    limitIndicator.textContent = 'Limit reached! ✨ Upgrade';
    limitIndicator.className = 'limit-indicator exceeded';
    limitIndicator.style.display = 'block';
    limitIndicator.onclick = () => openProModal('limit_indicator');
  } else {
    limitIndicator.style.display = 'none';
  }
}
function renderNotesList(filteredNotes = null) {
  // 🔒 Show notes limit indicator for free users
  updateNotesLimitIndicator();
  const displayNotes = filteredNotes ?? applyListFilters(notes);

  if (displayNotes.length === 0) {
    if (elements.notesList) elements.notesList.innerHTML = '';
    if (elements.emptyState) elements.emptyState.style.display = 'block';
    updateEmptyStateForFilter(displayNotes);
    return;
  }

  if (elements.emptyState) elements.emptyState.style.display = 'none';

  if (elements.notesList) {
    elements.notesList.innerHTML = displayNotes.map(note => {
      const hasContext = note.contextUrl && note.contextUrl.length > 0;
      const hasReminder = note.reminder && note.reminder.time && !note.reminder.notified;
      const isNew = note.reviewStatus === REVIEW_STATUS.NEW;
      const isArchived = isArchivedNote(note);
      const showDoneBtn = isNew && !isArchived;

      return `
        <div class="note-card ${note.pinned ? 'pinned' : ''}${showDoneBtn ? ' note-card--inbox' : ''}" data-id="${note.id}">
          <div class="note-card-header">
            <div class="note-card-title">
              ${note.pinned ? '<span class="pin-icon">📌</span>' : ''}
              ${hasReminder ? '<span class="reminder-icon" title="Reminder set">⏰</span>' : ''}
              ${escapeHtml(getNoteCardTitle(note))}
            </div>
            <div class="note-card-actions">
              ${showDoneBtn ? `<button type="button" class="btn-note-done" data-id="${note.id}" title="Mark done" aria-label="Mark done">Done</button>` : ''}
              <button type="button" class="btn-note-menu" data-id="${note.id}" title="More actions" aria-label="More actions">⋯</button>
              <button class="btn-copy-note" data-id="${note.id}" title="Copy to clipboard">📋</button>
            </div>
          </div>
          <div class="note-card-preview ${!getPreview(note.content) ? 'note-card-preview--empty' : ''}">${getPreview(note.content) || 'No content'}</div>
          ${hasContext ? `
            <div class="note-card-context">
              ${note.contextFavicon ? `<img src="${note.contextFavicon}" alt="">` : '🔗'}
              <span>${escapeHtml(getDomain(note.contextUrl))}</span>
            </div>
          ` : ''}
          <div class="note-card-date">${formatDate(note.updatedAt)}</div>
        </div>
      `;
    }).join('');

    closeAllNoteMenus();

    elements.notesList.querySelectorAll('.note-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-copy-note, .btn-note-menu, .btn-note-done, .note-card-menu')) return;
        openNote(card.dataset.id);
      });
    });

    elements.notesList.querySelectorAll('.btn-copy-note').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyNoteToClipboard(btn.dataset.id);
      });
    });

    elements.notesList.querySelectorAll('.btn-note-menu').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNoteCardMenu(btn);
      });
    });

    elements.notesList.querySelectorAll('.btn-note-done').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleNoteReviewAction('mark-reviewed', btn.dataset.id);
      });
    });
  }
}

let openNoteMenuEl = null;

function closeAllNoteMenus() {
  if (openNoteMenuEl) {
    openNoteMenuEl.remove();
    openNoteMenuEl = null;
  }
}

function toggleNoteCardMenu(btn) {
  const noteId = btn.dataset.id;
  const note = allNotesCache.find((n) => n.id === noteId);
  if (!note) return;

  if (openNoteMenuEl?.dataset.noteId === noteId) {
    closeAllNoteMenus();
    return;
  }
  closeAllNoteMenus();

  const menu = document.createElement('div');
  menu.className = 'note-card-menu';
  menu.dataset.noteId = noteId;

  const items = [];
  if (note.reviewStatus === REVIEW_STATUS.NEW && !isArchivedNote(note)) {
    items.push({ action: 'mark-reviewed', label: 'Done' });
  }
  if (!isArchivedNote(note)) {
    items.push({ action: 'archive', label: 'Archive' });
  } else {
    items.push({ action: 'restore', label: 'Restore' });
  }

  menu.innerHTML = items
    .map(
      (item) =>
        `<button type="button" data-action="${item.action}" data-id="${noteId}">${item.label}</button>`
    )
    .join('');

  const card = btn.closest('.note-card');
  if (card) card.appendChild(menu);
  openNoteMenuEl = menu;

  menu.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleNoteReviewAction(b.dataset.action, b.dataset.id);
      closeAllNoteMenus();
    });
  });
}

async function handleNoteReviewAction(action, noteId) {
  if (action === 'mark-reviewed') {
    await db.updateNote(noteId, { reviewStatus: REVIEW_STATUS.REVIEWED });
    showToast('Done');
  } else if (action === 'archive') {
    await db.updateNote(noteId, { reviewStatus: REVIEW_STATUS.ARCHIVED });
    showToast('Note archived');
  } else if (action === 'restore') {
    await db.updateNote(noteId, { reviewStatus: REVIEW_STATUS.REVIEWED });
    showToast('Note restored');
    await loadNotes();
    if (listViewFilter === 'archived') {
      applyPrimaryListFilter('all');
    }
    return;
  }
  await loadNotes();
}

document.addEventListener('click', () => closeAllNoteMenus());

// 🔥 COPY NOTE TO CLIPBOARD - THE VIRAL FEATURE
async function copyNoteToClipboard(noteId) {
  const note = await db.getNote(noteId);
  if (!note) return;

  const text = htmlToPlainTextLines(note.content || '').join('\n');

  // Build clipboard content
  let clipboardText = '';
  if (note.title && note.title !== 'Untitled') {
    clipboardText = `${note.title}\n\n${text}`;
  } else {
    clipboardText = text;
  }

  // Add source URL if present
  if (note.contextUrl) {
    clipboardText += `\n\nSource: ${note.contextUrl}`;
  }

  try {
    await navigator.clipboard.writeText(clipboardText);
    showToast('📋 Copied!');
  } catch (err) {
    console.error('Copy failed:', err);
  }
}

let toastTimer = null;

function showToast(message, { undoFn = null, duration = 2000 } = {}) {
  if (!elements.copyToast) return;

  const msgEl = elements.copyToast.querySelector('.toast-msg');
  const undoBtn = document.getElementById('toastUndo');

  if (msgEl) msgEl.textContent = message;

  if (undoBtn) {
    if (undoFn) {
      undoBtn.style.display = 'inline-flex';
      undoBtn.onclick = () => {
        elements.copyToast.classList.remove('show');
        undoFn();
      };
    } else {
      undoBtn.style.display = 'none';
      undoBtn.onclick = null;
    }
  }

  if (toastTimer) clearTimeout(toastTimer);
  elements.copyToast.classList.add('show');
  toastTimer = setTimeout(() => {
    elements.copyToast.classList.remove('show');
  }, duration);
}

async function createNewNote() {
  // 🔒 LIMIT CHECK: Pro, trial, or within free limits
  const limits = getCurrentLimits();
  const activeCount = allNotesCache.filter(isBrowsableNote).length;
  if (!isPro && !trialInfo.isTrialActive && activeCount >= limits.maxNotes) {
    showLimitWarning('Free limit: ' + limits.maxNotes + ' notes');
    return;
  }
  
  if (settings.includeContext) {
    currentContext = await getCurrentTabContext();
    if (currentContext) {
      currentTabContext = currentContext;
    }
  } else {
    currentContext = null;
  }

  const folderId = (canUseFolders() && currentFolderId !== 'all') ? currentFolderId : null;
  currentNote = await db.createNote('', 'Untitled', folderId);
  await trackFunnelEvent('note_created', { source: isFirstRun ? 'onboarding' : 'manual' });

  // Add context to note
  if (currentContext?.url) {
    currentNote.contextUrl = currentContext.url;
    currentNote.contextTitle = currentContext.title;
    currentNote.contextFavicon = currentContext.favicon;
    await db.updateNote(currentNote.id, {
      contextUrl: currentContext.url,
      contextTitle: currentContext.title,
      contextFavicon: currentContext.favicon
    });
  }

  if (listViewFilter !== 'default' && listViewFilter !== 'needs-review') {
    setListViewFilter('default');
  }

  await loadNotes();
  openEditor();

  if (elements.noteTitleInput) {
    elements.noteTitleInput.focus();
    elements.noteTitleInput.select();
  }

  if (isFirstRun) {
    showToast('Step 1/3: Write one useful note, then press Ctrl+Enter.');
  }
}

async function openNote(id) {
  currentNote = await db.getNote(id);
  if (!currentNote) return;

  if (currentNote.contextUrl) {
    currentContext = {
      url: currentNote.contextUrl,
      title: currentNote.contextTitle,
      favicon: currentNote.contextFavicon,
      favIconUrl: currentNote.contextFavicon
    };
  } else {
    currentContext = null;
  }

  openEditor();
  
  // Load reminder info
  await loadNoteReminder();
}

function openEditor() {
  showView('editor');

  if (elements.noteTitleInput) elements.noteTitleInput.value = currentNote?.title || '';
  if (elements.noteContentEditor) {
    elements.noteContentEditor.innerHTML = sanitizeHtml(currentNote?.content || '');
  }

  if (elements.noteFolderSelect) {
    elements.noteFolderSelect.value = currentNote?.folderId || '';
  }

  updateContextInfo();
  updatePinButton();
  updateNoteMeta();

  // Focus content if title exists, otherwise focus title
  if (currentNote?.title && currentNote.title !== 'Untitled') {
    if (elements.noteContentEditor) elements.noteContentEditor.focus();
  }
}

function closeEditor() {
  if (elements.noteTitleInput) elements.noteTitleInput.blur();
  saveCurrentNote();
  showView('list');

  currentNote = null;
  currentContext = null;
  loadNotes();
}

// Auto-capitalize first letter of text
function autoCapitalizeFirst(text) {
  if (!text) return text;
  // Find first letter and capitalize it
  return text.replace(/^(\s*)([a-z])/, (match, spaces, letter) => spaces + letter.toUpperCase());
}

async function saveCurrentNote() {
  // Save reference immediately to avoid race conditions
  const noteToSave = currentNote;
  if (!noteToSave || !noteToSave.id) return;

  const titleInput = elements.noteTitleInput;
  const rawTitle = titleInput?.value ?? '';
  const trimmedTitle = rawTitle.trim();
  const titleInputFocused = titleInput && document.activeElement === titleInput;

  let title;
  if (trimmedTitle) {
    title = autoCapitalizeFirst(trimmedTitle);
  } else if (titleInputFocused) {
    title = '';
  } else {
    title = 'Untitled';
  }

  let content = sanitizeHtml(elements.noteContentEditor?.innerHTML || '');

  if (titleInput && !titleInputFocused && titleInput.value !== title) {
    titleInput.value = title;
  }

  // Auto-capitalize content (first letter after opening tags)
  content = content.replace(/^(<[^>]*>)*(\s*)([a-z])/, (match, tags, spaces, letter) => 
    (tags || '') + (spaces || '') + letter.toUpperCase()
  );

  // Verify note still exists before saving
  const existingNote = await db.getNote(noteToSave.id);
  if (!existingNote) {
    console.warn('Cannot save - note no longer exists:', noteToSave.id);
    return;
  }

  await db.updateNote(noteToSave.id, { title, content });
  if (currentNote && currentNote.id === noteToSave.id) {
    currentNote.title = title;
    currentNote.content = content;
  }

  if (!onboardingState.firstNoteSaved && hasMeaningfulNoteContent(title, content)) {
    await saveOnboardingState({ firstNoteSaved: true });
    await trackFunnelEventOnce('first_note', 'first_note', { source: isFirstRun ? 'onboarding' : 'editor' });
    showToast('Step 2/3: Add a reminder with the bell icon so this note becomes actionable.');
  }

  backup.scheduleAutoBackup(isPro);
}

// ============================================
// CONTEXT CAPTURE
// ============================================

function updateContextInfo() {
  if (!elements.contextInfo) return;

  if (currentContext && currentContext.url && !currentContext.url.startsWith('chrome://')) {
    elements.contextInfo.style.display = 'flex';

    const fav = currentContext.favicon || currentContext.favIconUrl;
    if (elements.contextFavicon && fav) {
      elements.contextFavicon.src = fav;
      elements.contextFavicon.style.display = 'block';
    } else if (elements.contextFavicon) {
      elements.contextFavicon.style.display = 'none';
    }

    if (elements.contextLink) {
      elements.contextLink.href = currentContext.url;
      elements.contextLink.textContent = currentContext.title || getDomain(currentContext.url);
    }
  } else {
    elements.contextInfo.style.display = 'none';
  }
}

function removeNoteContext() {
  currentContext = null;
  if (currentNote) {
    currentNote.contextUrl = null;
    currentNote.contextTitle = null;
    currentNote.contextFavicon = null;
  }
  updateContextInfo();
  scheduleAutoSave();
}

// ============================================
// UI UPDATES
// ============================================

let saveTimeout = null;
function scheduleAutoSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  
  // Show saving indicator
  if (elements.saveStatus) {
    elements.saveStatus.textContent = '⏳ Saving...';
    elements.saveStatus.classList.add('visible', 'saving');
  }
  
  saveTimeout = setTimeout(async () => {
    await saveCurrentNote();
    
    // Show saved indicator
    if (elements.saveStatus) {
      elements.saveStatus.textContent = '✓ Saved';
      elements.saveStatus.classList.remove('saving');
      elements.saveStatus.classList.add('visible');
      
      // Hide after 2 seconds
      setTimeout(() => {
        if (elements.saveStatus) {
          elements.saveStatus.classList.remove('visible');
        }
      }, 2000);
    }
  }, 500);
  
  updateNoteMeta();
}

function updatePinButton() {
  if (!elements.pinNoteBtn || !currentNote) return;
  elements.pinNoteBtn.textContent = currentNote.pinned ? '📌' : '📍';
  elements.pinNoteBtn.title = currentNote.pinned ? 'Unpin note' : 'Pin note';
}

function updateNoteMeta() {
  if (!currentNote) return;

  if (elements.noteDate) {
    const date = new Date(currentNote.updatedAt);
    elements.noteDate.textContent = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  if (elements.noteChars && elements.noteContentEditor) {
    const text = elements.noteContentEditor.textContent || '';
    elements.noteChars.textContent = `${text.length} chars`;
  }
}

async function togglePin() {
  if (!currentNote) return;
  currentNote = await db.togglePin(currentNote.id);
  updatePinButton();
}

async function cancelNoteReminder(noteId) {
  try {
    await chrome.runtime.sendMessage({ action: 'cancelReminder', noteId });
  } catch (err) {
    console.warn('Failed to cancel reminder:', err);
  }
}

async function deleteNote() {
  if (!currentNote) return;

  const deletedNote = { ...currentNote };
  await cancelNoteReminder(deletedNote.id);
  await db.deleteNote(deletedNote.id);
  currentNote = null;
  currentContext = null;
  showView('list');
  await loadNotes();
  await updateTrashButton();

  showToast('Moved to trash', {
    duration: 3500,
    undoFn: async () => {
      await db.restoreFromTrash(deletedNote.id);
      await loadNotes();
      await updateTrashButton();
      showToast('Note restored');
      openNote(deletedNote.id);
    }
  });
}

// ============================================
// 🗑️ TRASH MANAGEMENT
// ============================================

async function updateTrashButton() {
  const trash = await db.getTrash(isPro);
  trashCountCache = trash.length;
  updateFolderUI();
}

async function openTrash() {
  showView('trash');
  updateTrashInfoLabel();
  await renderTrashList();
}

function closeTrash() {
  showView('list');
}

async function renderTrashList() {
  const trash = await db.getTrash(isPro);

  if (trash.length === 0) {
    if (elements.trashList) elements.trashList.innerHTML = '';
    if (elements.trashEmptyState) elements.trashEmptyState.style.display = 'block';
    if (elements.emptyTrashBtn) elements.emptyTrashBtn.style.display = 'none';
    return;
  }

  if (elements.trashEmptyState) elements.trashEmptyState.style.display = 'none';
  if (elements.emptyTrashBtn) elements.emptyTrashBtn.style.display = 'block';

  if (elements.trashList) {
    const retentionDays = db.getTrashRetentionDays(isPro);
    elements.trashList.innerHTML = trash.map(note => {
      const daysAgo = Math.floor((Date.now() - note.deletedAt) / (1000 * 60 * 60 * 24));
      const expiresIn = Math.max(0, retentionDays - daysAgo);
      return `
        <div class="trash-card" data-id="${note.id}">
          <div class="trash-card-info">
            <div class="trash-card-title">${escapeHtml(note.title || 'Untitled')}</div>
            <div class="trash-card-date">Deleted ${daysAgo === 0 ? 'today' : daysAgo + 'd ago'} • Expires in ${expiresIn}d</div>
          </div>
          <div class="trash-card-actions">
            <button class="btn-restore" data-id="${note.id}">Restore</button>
            <button class="btn-delete-permanent" data-id="${note.id}" title="Permanently delete">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    elements.trashList.querySelectorAll('.btn-restore').forEach(btn => {
      btn.addEventListener('click', () => restoreNote(btn.dataset.id));
    });

    elements.trashList.querySelectorAll('.btn-delete-permanent').forEach(btn => {
      btn.addEventListener('click', async () => {
        twoStepConfirm(btn, '🗑️', async () => {
          await cancelNoteReminder(btn.dataset.id);
          await db.deleteFromTrash(btn.dataset.id);
          await renderTrashList();
          await updateTrashButton();
          showToast('Permanently deleted');
        });
      });
    });
  }
}

async function restoreNote(id) {
  const note = await db.restoreFromTrash(id);
  if (note) {
    showToast('✅ Note restored!');
    await loadNotes();
    await renderTrashList();
    await updateTrashButton();
  }
}

async function emptyTrash() {
  twoStepConfirm(elements.emptyTrashBtn, 'Empty', async () => {
    const trash = await db.getTrash(isPro);
    await Promise.all(trash.map(note => cancelNoteReminder(note.id)));
    await db.emptyTrash();
    await renderTrashList();
    await updateTrashButton();
    showToast('Trash emptied');
  });
}

// ============================================
// SEARCH
// ============================================

async function searchNotes(query) {
  if (!query.trim()) {
    syncNotesFromPrimaryFilters();
    applyListFiltersAndRender();
    if (elements.clearSearch) elements.clearSearch.style.display = 'none';
    updatePageMemoryUI();
    updateReviewFilterUI();
    return;
  }

  // 🔒 LIMIT CHECK: Search available during trial or with Pro
  const limits = getCurrentLimits();
  if (!isPro && !trialInfo.isTrialActive && !limits.canSearch) {
    elements.searchInput.value = '';
    showLimitWarning('Search requires Pro — upgrade to find notes instantly');
    return;
  }

  if (elements.clearSearch) elements.clearSearch.style.display = 'block';

  const searched = await db.searchNotes(query);
  const scopeByFolder =
    listViewFilter !== 'needs-review' &&
    listViewFilter !== 'archived' &&
    currentFolderId &&
    currentFolderId !== 'all';
  const scoped = scopeByFolder
    ? searched.filter((n) => n.folderId === currentFolderId)
    : searched;
  applyListFiltersAndRender(scoped);
}

// ============================================
// KEYBOARD SHORTCUTS (THE USP #2)
// ============================================

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isInEditor = elements.editorView && elements.editorView.style.display !== 'none';
    const isInInput = document.activeElement.tagName === 'INPUT' ||
                      document.activeElement.contentEditable === 'true';

    // "/" - Focus search (when not typing)
    if (e.key === '/' && !isInInput && !isInEditor) {
      e.preventDefault();
      if (elements.searchInput) elements.searchInput.focus();
      return;
    }

    // Escape - Go back / Close modal
    if (e.key === 'Escape') {
      if (elements.welcomeModal?.style.display !== 'none') {
        dismissWelcome();
      } else if (elements.settingsModal?.style.display !== 'none') {
        closeSettings();
      } else if (isInEditor) {
        e.preventDefault();
        closeEditor();
      } else if (document.activeElement === elements.searchInput) {
        elements.searchInput.blur();
        elements.searchInput.value = '';
        searchNotes('');
      }
      return;
    }

    // Ctrl+N - New note
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      createNewNote();
      return;
    }

    // Ctrl+Enter - Save & close
    if (e.ctrlKey && e.key === 'Enter' && isInEditor) {
      e.preventDefault();
      closeEditor();
      return;
    }

    // Ctrl+F - Focus search
    if (e.ctrlKey && e.key === 'f' && !isInEditor) {
      e.preventDefault();
      if (elements.searchInput) elements.searchInput.focus();
      return;
    }
  });
}

// ============================================
// TOOLBAR
// ============================================

function setupToolbar() {
  document.querySelectorAll('.toolbar-btn[data-command]').forEach(btn => {
    btn.addEventListener('click', () => {
      const command = btn.dataset.command;
      document.execCommand(command, false, null);
      if (elements.noteContentEditor) elements.noteContentEditor.focus();
      scheduleAutoSave();
    });
  });
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Welcome modal
  if (elements.welcomeStartBtn) {
    elements.welcomeStartBtn.addEventListener('click', dismissWelcome);
  }

  // New note
  if (elements.newNoteBtn) elements.newNoteBtn.addEventListener('click', createNewNote);

  // Back button
  if (elements.backBtn) elements.backBtn.addEventListener('click', closeEditor);

  // Editor inputs
  if (elements.noteTitleInput) {
    elements.noteTitleInput.addEventListener('input', scheduleAutoSave);
    elements.noteTitleInput.addEventListener('blur', scheduleAutoSave);
  }
  if (elements.noteContentEditor) {
    elements.noteContentEditor.addEventListener('beforeinput', handleEditorBeforeInput);
    elements.noteContentEditor.addEventListener('input', scheduleAutoSave);
    elements.noteContentEditor.addEventListener('paste', handleEditorPaste);
  }

  // Pin & Delete
  if (elements.pinNoteBtn) elements.pinNoteBtn.addEventListener('click', togglePin);
  if (elements.deleteNoteBtn) elements.deleteNoteBtn.addEventListener('click', deleteNote);

  // Reminder
  if (elements.reminderBtn) elements.reminderBtn.addEventListener('click', openReminderModal);
  if (elements.closeReminderBtn) elements.closeReminderBtn.addEventListener('click', closeReminderModal);
  if (elements.setReminderBtn) elements.setReminderBtn.addEventListener('click', setReminder);
  if (elements.removeReminderBtn) elements.removeReminderBtn.addEventListener('click', removeReminder);
  
  // Quick reminder buttons
  document.querySelectorAll('.reminder-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.reminder-quick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const minutes = parseInt(btn.dataset.minutes);
      const reminderDate = new Date(Date.now() + minutes * 60 * 1000);
      
      // Format for datetime-local input
      const formatted = reminderDate.toISOString().slice(0, 16);
      if (elements.reminderDateTime) {
        elements.reminderDateTime.value = formatted;
      }
    });
  });

  // Trash
  if (elements.trashBackBtn) elements.trashBackBtn.addEventListener('click', closeTrash);
  if (elements.emptyTrashBtn) elements.emptyTrashBtn.addEventListener('click', emptyTrash);

  // Trial upgrade button
  if (elements.trialUpgradeBtn) {
    elements.trialUpgradeBtn.addEventListener('click', () => openProModal('trial_banner'));
  }

  if (elements.backupSafetyActionBtn) {
    elements.backupSafetyActionBtn.addEventListener('click', () => {
      openSettings();
      trackFunnelEvent('backup_nudge_clicked', { source: 'banner' });
    });
  }

  if (elements.backupSafetyDismissBtn) {
    elements.backupSafetyDismissBtn.addEventListener('click', async () => {
      await chrome.storage.local.set({ [BACKUP_BANNER_DISMISS_KEY]: Date.now() });
      await trackFunnelEvent('backup_nudge_dismissed', { source: 'banner' });
      await updateBackupSafetyBanner();
      await updateReviewBanner();
    });
  }

  if (elements.reviewBannerActionBtn) {
    elements.reviewBannerActionBtn.addEventListener('click', async () => {
      const url = getStoreReviewUrl(chrome.runtime?.id, navigator.userAgent);
      // Asked once and answered — never bring it up again, whatever they rate.
      await writeReviewPromptState({ done: true });
      await trackFunnelEvent('review_prompt_clicked', { source: 'banner' });
      await updateReviewBanner();
      if (url) chrome.tabs.create({ url });
    });
  }

  if (elements.reviewBannerDismissBtn) {
    elements.reviewBannerDismissBtn.addEventListener('click', async () => {
      const { snoozes } = await readReviewPromptState();
      await writeReviewPromptState({
        snoozes: snoozes + 1,
        snoozedUntil: Date.now() + REVIEW_SNOOZE_MS
      });
      await trackFunnelEvent('review_prompt_dismissed', { snoozes: snoozes + 1 });
      await updateReviewBanner();
    });
  }

  // Remove context
  if (elements.removeContext) {
    elements.removeContext.addEventListener('click', removeNoteContext);
  }

  // Search
  let searchTimeout = null;
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', () => {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => searchNotes(elements.searchInput.value), 100);
    });

  }

  if (elements.clearSearch) {
    elements.clearSearch.addEventListener('click', () => {
      if (elements.searchInput) elements.searchInput.value = '';
      searchNotes('');
    });
  }

  if (elements.showPageNotesBtn) {
    elements.showPageNotesBtn.addEventListener('click', () => {
      setListViewFilter(listViewFilter === 'page' ? 'default' : 'page');
    });
  }
  if (elements.showSiteNotesBtn) {
    elements.showSiteNotesBtn.addEventListener('click', () => {
      setListViewFilter(listViewFilter === 'site' ? 'default' : 'site');
    });
  }
  // Settings
  if (elements.settingsBtn) elements.settingsBtn.addEventListener('click', openSettings);
  if (elements.closeSettingsBtn) elements.closeSettingsBtn.addEventListener('click', closeSettings);

  if (elements.themeSelect) {
    elements.themeSelect.addEventListener('change', () => {
      settings.theme = elements.themeSelect.value;
      document.body.dataset.theme = settings.theme;
      saveSettings();
    });
  }

  if (elements.fastModeToggle) {
    elements.fastModeToggle.addEventListener('change', () => {
      settings.fastMode = elements.fastModeToggle.checked;
      document.body.dataset.fast = settings.fastMode;
      saveSettings();
    });
  }

  if (elements.includeContextToggle) {
    elements.includeContextToggle.addEventListener('change', () => {
      settings.includeContext = elements.includeContextToggle.checked;
      saveSettings();
    });
  }

  if (elements.quickAddToggle) {
    elements.quickAddToggle.addEventListener('change', () => {
      settings.quickAddMode = elements.quickAddToggle.checked;
      saveSettings();
    });
  }

  // Export
  document.querySelectorAll('.btn-export').forEach(btn => {
    btn.addEventListener('click', () => exportNotes(btn.dataset.format));
  });

  // Import
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (e) => {
      if (e.target.files[0]) importNotes(e.target.files[0]);
    });
  }

  // Close modal on overlay click
  if (elements.settingsModal) {
    elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === elements.settingsModal) closeSettings();
    });
  }

  if (elements.welcomeModal) {
    elements.welcomeModal.addEventListener('click', (e) => {
      if (e.target === elements.welcomeModal) dismissWelcome();
    });
  }
}

// ============================================
// MODALS
// ============================================

function openSettings() {
  if (elements.settingsModal) {
    elements.settingsModal.style.display = 'flex';
    modalA11y.open(elements.settingsModal);
  }
  updateBackupUI();
  updateBackupSafetyBanner();
}

function closeSettings() {
  if (elements.settingsModal) {
    modalA11y.close(elements.settingsModal);
    elements.settingsModal.style.display = 'none';
  }
}

async function setupAnalyticsControls() {
  if (!elements.analyticsToggle) return;
  const settings = await getAnalyticsSettings();
  elements.analyticsToggle.checked = settings.enabled !== false;
  elements.analyticsToggle.addEventListener('change', async () => {
    const next = elements.analyticsToggle.checked;
    await setAnalyticsEnabled(next);
    await trackFunnelEvent('analytics_setting_changed', {
      enabled: next,
      source: 'settings',
    });
    showToast(
      next
        ? 'Local usage insights enabled (stored on this device only).'
        : 'Local usage insights disabled.'
    );
  });
}

async function markManualBackupCreated(source) {
  await chrome.storage.local.set({ lastManualBackupAt: Date.now() });
  await trackFunnelEvent('backup_exported', { source });
}

async function updateBackupSafetyBanner() {
  if (!elements.backupSafetyBanner) return;

  const [backupState, dismissedState] = await Promise.all([
    chrome.storage.local.get(['lastManualBackupAt']),
    chrome.storage.local.get([BACKUP_BANNER_DISMISS_KEY]),
  ]);

  const hasNotes = allNotesCache.filter(isBrowsableNote).length > 0;
  const lastBackupAt = Number(backupState.lastManualBackupAt || 0);
  const recentlyBackedUp = lastBackupAt > 0 && Date.now() - lastBackupAt < BACKUP_RECENCY_MS;
  const dismissedAt = Number(dismissedState[BACKUP_BANNER_DISMISS_KEY] || 0);
  const dismissedRecently = dismissedAt > 0 && Date.now() - dismissedAt < BACKUP_RECENCY_MS;

  // The review prompt is a once-ever ask; this tip comes back next week. Whenever
  // both qualify, yield — otherwise this banner, which shows for anyone who has
  // notes and no recent export, would hide the review prompt permanently.
  const reviewVisible = elements.reviewBanner && elements.reviewBanner.style.display !== 'none';

  const shouldShow = hasNotes && !recentlyBackedUp && !dismissedRecently && !reviewVisible;
  elements.backupSafetyBanner.style.display = shouldShow ? 'flex' : 'none';
}

// ============================================
// ⭐ REVIEW PROMPT
// ============================================

/** Stamp first use once, so the prompt can tell how long someone has stayed. */
async function ensureFirstUseTimestamp() {
  const stored = await chrome.storage.local.get([FIRST_USE_KEY]);
  const existing = Number(stored[FIRST_USE_KEY] || 0);
  if (existing > 0) return existing;
  const now = Date.now();
  await chrome.storage.local.set({ [FIRST_USE_KEY]: now });
  return now;
}

async function readReviewPromptState() {
  const stored = await chrome.storage.local.get([REVIEW_PROMPT_STATE_KEY]);
  return {
    done: false,
    shown: false,
    snoozes: 0,
    snoozedUntil: 0,
    ...(stored[REVIEW_PROMPT_STATE_KEY] || {})
  };
}

async function writeReviewPromptState(patch) {
  const next = { ...(await readReviewPromptState()), ...patch };
  await chrome.storage.local.set({ [REVIEW_PROMPT_STATE_KEY]: next });
  return next;
}

async function updateReviewBanner() {
  if (!elements.reviewBanner) return;

  const hide = () => {
    elements.reviewBanner.style.display = 'none';
  };

  const state = await readReviewPromptState();
  if (state.done || state.snoozes >= REVIEW_MAX_SNOOZES) return hide();

  // Say nothing rather than send someone to the wrong store: unpacked builds and
  // unrecognised browsers have no listing to point at.
  if (!getStoreReviewUrl(chrome.runtime?.id, navigator.userAgent)) return hide();

  const firstUseAt = await ensureFirstUseTimestamp();
  const usedLongEnough = Date.now() - firstUseAt >= REVIEW_MIN_AGE_MS;
  const noteCount = allNotesCache.filter(isBrowsableNote).length;
  const stillSnoozed = Number(state.snoozedUntil || 0) > Date.now();

  if (!usedLongEnough || noteCount < REVIEW_MIN_NOTES || stillSnoozed) return hide();

  elements.reviewBanner.style.display = 'flex';
  // Only one nudge on screen: this one wins while it is eligible.
  if (elements.backupSafetyBanner) elements.backupSafetyBanner.style.display = 'none';

  if (!state.shown) {
    await writeReviewPromptState({ shown: true });
    await trackFunnelEvent('review_prompt_shown', { notes: noteCount });
  }
}

// ============================================
// BACKUP (local snapshot — not cloud)
// ============================================

function setupBackupListeners() {
  const downloadBtn = document.getElementById('downloadBackupBtn');
  const restoreBtn = document.getElementById('restoreLocalBackupBtn');

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => downloadFullBackup());
  }
  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => handleRestoreLocalBackup());
  }
}

async function updateBackupUI() {
  const statusEl = document.getElementById('backupStatusText');
  const restoreBtn = document.getElementById('restoreLocalBackupBtn');
  const proHint = document.getElementById('proBackupHint');

  if (proHint) {
    proHint.style.display = isPro ? '' : 'none';
  }

  const meta = await backup.getBackupMeta();
  if (statusEl) {
    if (!isPro) {
      statusEl.textContent = 'Pro feature';
    } else if (!meta) {
      statusEl.textContent = 'Not yet saved';
    } else if (meta.tooLarge) {
      statusEl.textContent = 'Too large — use Download backup';
    } else {
      statusEl.textContent = `${meta.noteCount} notes · ${backup.formatBackupTime(meta.savedAt)}`;
    }
  }

  if (restoreBtn) {
    const canRestore = isPro && (await backup.hasLocalBackup()) && notes.length === 0;
    restoreBtn.style.display = canRestore ? '' : 'none';
  }
}

async function handleRestoreLocalBackup() {
  if (!confirm('Replace empty notes with your last auto-backup on this device?')) return;

  const result = await backup.restoreFromLocalBackup();
  if (result.success) {
    await trackFunnelEvent('backup_restored_local', { source: 'auto_backup' });
    showToast(`Restored ${result.count} notes from auto-backup`);
    await loadNotes();
    await loadFolders();
    await updateBackupUI();
    await updateBackupSafetyBanner();
  } else {
    showToast(result.error || 'Restore failed');
  }
}

async function maybeOfferLocalBackupRestore() {
  if (notes.length > 0) return;
  if (!isPro) return;
  if (!(await backup.hasLocalBackup())) return;

  const restoreBtn = document.getElementById('restoreLocalBackupBtn');
  if (restoreBtn) restoreBtn.style.display = '';
  showToast('No notes found — restore auto-backup in Settings if you reinstalled');
}

async function onProUnlocked(message) {
  isPro = true;
  document.body.classList.add('is-pro');
  await window.QuickNotesPro?.setProUnlocked?.();
  updateTrialBanner();
  updateFolderAccessUI();
  updateTrashInfoLabel();
  backup.scheduleAutoBackup(true);
  await updateBackupUI();
  await updateBackupSafetyBanner();
  showToast(message);
  showToast('Tip: export a JSON backup before uninstalling — notes are not stored in the cloud');
}

// ============================================
// EXPORT/IMPORT
// ============================================

async function exportNotes(format) {
  // Export is FREE for everyone - builds trust!
  const data = await db.exportNotes(format);
  const blob = new Blob([data], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `quick-notes-export.${format}`;
  a.click();

  URL.revokeObjectURL(url);
  showToast('📥 Exported!');
  await trackFunnelEvent('notes_exported', { format });
  if (format === 'json') {
    await markManualBackupCreated('export_json');
  }
  if (isPro) backup.scheduleAutoBackup(true);
  await updateBackupSafetyBanner();
}

async function downloadFullBackup() {
  const notes = await db.getAllNotes();
  const folders = await db.getFolders();
  const payload = {
    version: 1,
    exportedAt: Date.now(),
    notes,
    folders: folders.filter((f) => !f.isSystem)
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quick-notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Backup downloaded — keep this file safe!');
  await markManualBackupCreated('full_backup');
  if (isPro) backup.scheduleAutoBackup(true);
  await updateBackupSafetyBanner();
}

async function importNotes(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      let payload = e.target.result;
      const parsed = JSON.parse(payload);
      const notesToImport = Array.isArray(parsed) ? parsed : parsed?.notes;
      if (!Array.isArray(notesToImport)) {
        throw new Error('Invalid format');
      }
      const sanitized = notesToImport.map((note) => ({
        ...note,
        content: sanitizeHtml(note.content || '')
      }));
      let count = 0;
      const foldersToImport = Array.isArray(parsed?.folders) ? parsed.folders : [];
      for (const folder of foldersToImport) {
        if (!folder?.id || folder.isSystem) continue;
        const existing = (await db.getFolders()).find((f) => f.id === folder.id);
        if (!existing) {
          await db.putFolder({
            id: folder.id,
            name: folder.name || 'Folder',
            isSystem: false,
            createdAt: folder.createdAt || Date.now()
          });
        }
      }
      count = await db.importNotes(JSON.stringify(sanitized));
      showToast(`Imported ${count} notes!`);
      await trackFunnelEvent('backup_restored_import', { source: 'json_import', count });
      await loadNotes();
      backup.scheduleAutoBackup(isPro);
      await updateBackupUI();
      await updateBackupSafetyBanner();
    } catch (err) {
      showToast('Import failed: invalid JSON file');
    }
  };
  reader.readAsText(file);
}

// ============================================
// HELPERS
// ============================================

function normalizePreviewLine(text) {
  return (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/** One preview/clipboard line per block or <br> (Chrome contenteditable shapes). */
function htmlToPlainTextLines(html) {
  if (!html) return [];

  // Legacy notes saved as plain text (no tags)
  if (!/[<][a-z!/]/i.test(html)) {
    return html
      .split(/\r?\n/)
      .map(normalizePreviewLine)
      .filter(Boolean);
  }

  const wrap = document.createElement('div');
  wrap.innerHTML = html;

  // innerText matches what the editor shows (br + block boundaries → newlines)
  const innerText = wrap.innerText || '';
  if (/\r?\n/.test(innerText)) {
    const lines = innerText.split(/\r?\n/).map(normalizePreviewLine).filter(Boolean);
    if (lines.length > 1) return lines;
  }

  const lines = [];
  let currentLine = '';

  function flushLine() {
    const line = normalizePreviewLine(currentLine);
    if (line) lines.push(line);
    currentLine = '';
  }

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      currentLine += (node.textContent || '').replace(/\u00a0/g, ' ');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName;
    if (tag === 'BR') {
      flushLine();
      return;
    }
    if (LINE_BREAK_BLOCK_TAGS.has(tag) || tag === 'UL' || tag === 'OL') {
      flushLine();
      for (const child of node.childNodes) walk(child);
      flushLine();
      return;
    }
    for (const child of node.childNodes) walk(child);
  }

  for (const child of wrap.childNodes) walk(child);
  flushLine();
  return lines;
}

/** Display title for list cards — does not change stored note data. */
function getNoteCardTitle(note) {
  const raw = (note?.title || '').trim();
  const isPlaceholder = !raw || raw.toLowerCase() === 'untitled';
  if (!isPlaceholder) return raw;

  const lines = htmlToPlainTextLines(note?.content || '');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  }
  return 'Untitled';
}

function getPreview(html) {
  const lines = htmlToPlainTextLines(html);
  if (!lines.length) return '';
  const picked = [];
  let totalLen = 0;
  const maxLines = 3;
  for (const line of lines) {
    if (picked.length >= maxLines) break;
    const addLen = (picked.length ? 1 : 0) + line.length;
    if (picked.length && totalLen + addLen > 100) break;
    if (!picked.length && line.length > 100) {
      picked.push(line.slice(0, 100));
      break;
    }
    picked.push(line);
    totalLen += addLen;
  }
  return escapeHtml(picked.join('\n'));
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

const SANITIZE_ALLOWED_TAGS = new Set([
  'B', 'I', 'U', 'BR', 'P', 'STRONG', 'EM', 'UL', 'OL', 'LI', 'DIV'
]);

function sanitizeHtml(html) {
  if (!html) return '';
  const root = document.createElement('div');
  root.innerHTML = html;

  function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createTextNode(node.textContent));
      return frag;
    }

    const out = document.createDocumentFragment();
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        out.appendChild(document.createTextNode(child.textContent));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName;
        if (SANITIZE_ALLOWED_TAGS.has(tag)) {
          const el = document.createElement(tag.toLowerCase());
          for (const grandchild of [...child.childNodes]) {
            el.appendChild(cleanNode(grandchild));
          }
          out.appendChild(el);
        } else {
          out.appendChild(cleanNode(child));
        }
      }
    }
    return out;
  }

  const wrapper = document.createElement('div');
  wrapper.appendChild(cleanNode(root));
  return wrapper.innerHTML;
}

const AUTO_CAP_LOCALE = 'ro-RO';
let autoCapInProgress = false;

function getInputRangeForEditor(e, editor) {
  const targetRanges = typeof e.getTargetRanges === 'function' ? e.getTargetRanges() : [];
  if (targetRanges.length > 0) {
    const r = targetRanges[0];
    if (editor.contains(r.startContainer)) return r;
  }
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return null;
  return range;
}

const LINE_BREAK_BLOCK_TAGS = new Set(['DIV', 'P', 'LI']);

function fragmentToPlainTextWithLineBreaks(root) {
  const parts = [];

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push((node.textContent || '').replace(/\u00a0/g, ' '));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName;
    if (tag === 'BR') {
      parts.push('\n');
      return;
    }
    if (LINE_BREAK_BLOCK_TAGS.has(tag)) {
      if (parts.length > 0 && !parts[parts.length - 1].endsWith('\n')) {
        parts.push('\n');
      }
      for (const child of node.childNodes) walk(child);
      parts.push('\n');
      return;
    }
    for (const child of node.childNodes) walk(child);
  }

  for (const child of root.childNodes) walk(child);
  return parts.join('');
}

function getPlainTextBeforeRange(editor, endRange) {
  const preRange = document.createRange();
  preRange.selectNodeContents(editor);
  preRange.setEnd(endRange.startContainer, endRange.startOffset);
  const wrap = document.createElement('div');
  wrap.appendChild(preRange.cloneContents());
  return fragmentToPlainTextWithLineBreaks(wrap);
}

function getLinePrefixBeforeCaret(editor, endRange) {
  let before = getPlainTextBeforeRange(editor, endRange);
  // fragmentToPlainTextWithLineBreaks appends one \n after the block that contains the caret.
  // That newline is after the caret in the clone; drop only that one so line 2+ prefix keeps letters.
  before = before.replace(/\n$/u, '');
  const lineStart = before.lastIndexOf('\n');
  return lineStart === -1 ? before : before.slice(lineStart + 1);
}

function isAtFirstLetterOfFirstWordOnLine(editor, endRange) {
  return !/\p{L}/u.test(getLinePrefixBeforeCaret(editor, endRange));
}

function insertTextAtCaret(text) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStart(node, node.length);
  range.setEnd(node, node.length);
  sel.removeAllRanges();
  sel.addRange(range);
}

function isLowercaseLetter(ch) {
  if (!ch || ch.length !== 1) return false;
  const upper = ch.toLocaleUpperCase(AUTO_CAP_LOCALE);
  return upper !== ch && upper.toLocaleLowerCase(AUTO_CAP_LOCALE) === ch;
}

function handleEditorBeforeInput(e) {
  if (autoCapInProgress) return;
  if (e.inputType !== 'insertText' || !e.data || e.data.length !== 1) return;
  if (e.isComposing) return;

  const editor = elements.noteContentEditor;
  if (!editor || !editor.contains(e.target)) return;
  if (!isLowercaseLetter(e.data)) return;

  const range = getInputRangeForEditor(e, editor);
  if (!range || !isAtFirstLetterOfFirstWordOnLine(editor, range)) return;

  const upper = e.data.toLocaleUpperCase(AUTO_CAP_LOCALE);
  if (upper === e.data) return;

  e.preventDefault();
  autoCapInProgress = true;
  insertTextAtCaret(upper);
  autoCapInProgress = false;
  scheduleAutoSave();
}

function handleEditorPaste(e) {
  e.preventDefault();
  const html = e.clipboardData.getData('text/html');
  const text = e.clipboardData.getData('text/plain');
  const toInsert = html ? sanitizeHtml(html) : escapeHtml(text).replace(/\n/g, '<br>');
  document.execCommand('insertHTML', false, toInsert);
  scheduleAutoSave();
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 86400000 && date.getDate() === now.getDate()) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getDate() === yesterday.getDate()) return 'Yesterday';

  if (diff < 604800000) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

// ============================================
// ✨ PRO / PAYMENT INTEGRATION (Stripe/ExtensionPay)
// ============================================

const PRO_API = 'https://quick-notes-pro.apiworkersdev.workers.dev';

async function getExtensionId() {
  if (window.QuickNotesPro?.getExtensionId) {
    return window.QuickNotesPro.getExtensionId();
  }
  let { extensionId } = await chrome.storage.local.get(['extensionId']);
  if (!extensionId) {
    extensionId = 'qn_' + crypto.randomUUID();
    await chrome.storage.local.set({ extensionId });
  }
  return extensionId;
}

async function checkProStatus() {
  try {
    if (isPro) {
      applyProUnlockedUi();
      backup.scheduleAutoBackup(true);
      return;
    }

    const { proUnlocked } = await chrome.storage.local.get(['proUnlocked']);
    if (proUnlocked === true) {
      isPro = true;
      applyProUnlockedUi();
      backup.scheduleAutoBackup(true);
      return;
    }

    const pro = window.QuickNotesPro;
    if (pro) {
      const ext = await pro.checkExtensionPayPro?.();
      if (ext?.unlocked) {
        isPro = true;
      } else if (await pro.checkServerProStatus?.()) {
        isPro = true;
      } else if (await pro.trySilentStripeRestore?.()) {
        isPro = true;
      }
    }

    if (!isPro) {
      const extensionId = await getExtensionId();
      const response = await fetch(
        `${PRO_API}/check?id=${encodeURIComponent(extensionId)}`
      );
      const data = await response.json();
      if (data.isPro) {
        isPro = true;
        await window.QuickNotesPro?.setProUnlocked?.();
      }
    }

    if (isPro) applyProUnlockedUi();
  } catch (e) {
    const { proUnlocked } = await chrome.storage.local.get(['proUnlocked']);
    isPro = proUnlocked === true;
    if (isPro) applyProUnlockedUi();
    console.log('Pro check error:', e);
  }
  updateFolderAccessUI();
  updateTrashInfoLabel();
  if (isPro) backup.scheduleAutoBackup(true);
}

function setupProModalHandlers() {
  // Setup Pro modal handlers
  const proHeaderBtn = document.getElementById('proHeaderBtn');
  const closeProBtn = document.getElementById('closeProBtn');
  const upgradeBtn = document.getElementById('upgradeBtn');
  const proModal = document.getElementById('proModal');
  
  if (proHeaderBtn) proHeaderBtn.addEventListener('click', () => openProModal('header'));
  if (closeProBtn) closeProBtn.addEventListener('click', closeProModal);
  if (upgradeBtn) upgradeBtn.addEventListener('click', handleCardPayment);
  
  if (proModal) {
    proModal.addEventListener('click', (e) => {
      if (e.target === proModal) closeProModal();
    });
  }
  
  updateRestoreUiForPaymentMethod();
  
  const restoreBtn = document.getElementById('restoreLicenseBtn');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => handleRestoreLicense(restoreBtn));
  }

  const restoreExtPayBtn = document.getElementById('restoreExtPayBtn');
  if (restoreExtPayBtn) {
    restoreExtPayBtn.addEventListener('click', () => handleRestoreExtensionPay(restoreExtPayBtn));
  }
}

function updateRestoreUiForPaymentMethod() {
  const emailInput = document.getElementById('restoreEmailInput');
  const restoreBtn = document.getElementById('restoreLicenseBtn');
  const hint = document.getElementById('restoreHint');
  if (emailInput) emailInput.placeholder = 'Email from Stripe receipt (optional if saved)';
  if (restoreBtn) restoreBtn.textContent = 'Restore purchase';
  if (hint) {
    hint.innerHTML =
      'We try ExtensionPay, then your <strong>Stripe receipt email</strong>. Same email as your card payment.';
  }
}

const RESTORE_SUPPORT_EMAIL = 'quicknotes.extension@gmail.com';

function formatRestoreError(message) {
  if (!message) return message;
  if (/device limit reached|already active on 3 devices/i.test(message)) {
    return (
      'This purchase is already active on 3 devices. Contact support to reset your activations. ' +
      `(${RESTORE_SUPPORT_EMAIL})`
    );
  }
  if (/too many restore attempts/i.test(message)) {
    return (
      'Prea multe încercări de restaurare pentru acest email. Încearcă din nou peste aproximativ o oră. ' +
      'Nu apăsa Restaurează în mod repetat. / Too many restore attempts for this email. Try again in about an hour. ' +
      `Dacă ai plătit deja, scrie la ${RESTORE_SUPPORT_EMAIL} cu chitanța Stripe.`
    );
  }
  return message;
}

function cardRestoreHelpSuffix() {
  const slug =
    window.QuickNotesPro?.EXTPAY_EXTENSION_ID ||
    (typeof QUICK_NOTES_EXTPAY !== 'undefined' && QUICK_NOTES_EXTPAY.EXTENSION_ID) ||
    'quick-notes-new';
  return (
    ` Try the Stripe email restore button, or ExtensionPay ("${slug}"). ` +
    `If both fail, contact ${RESTORE_SUPPORT_EMAIL} with your Stripe receipt date and last 4 digits.`
  );
}

async function finishProRestore({ message, email }) {
  if (email) {
    await window.QuickNotesPro?.savePayerEmail?.(email);
    await chrome.storage.local.set({ proEmail: email });
  }
  await trackFunnelEvent('purchase_restored', { source: 'manual_restore' });
  await onProUnlocked(message);
  setTimeout(closeProModal, 2000);
}

async function handleRestoreExtensionPay(btn) {
  const statusEl = document.getElementById('restoreExtPayStatus');
  const emailInput = document.getElementById('restoreEmailInput');
  const email = emailInput?.value.trim();

  btn.disabled = true;
  btn.textContent = 'Opening ExtensionPay…';

  if (statusEl) {
    statusEl.textContent =
      'Sign in with the email from your Stripe receipt. Or use "Restore with Stripe email" below. / Sau restaurează cu emailul Stripe mai jos.';
    statusEl.className = 'restore-note';
  }

  try {
    const restore = window.QuickNotesPro?.restoreExtensionPay;
    const result = restore ? await restore({ email, openLogin: true }) : null;

    if (!result) throw new Error('Restore unavailable');

    if (result?.success) {
      btn.textContent = '✓ Restored!';
      btn.classList.add('success');
      if (statusEl) {
        statusEl.textContent = '✨ Pro restored via ExtensionPay!';
        statusEl.className = 'restore-note success';
      }
      await finishProRestore({
        message: '✨ Pro restored via ExtensionPay!',
        email: result.email || email,
      });
      return;
    }

    btn.textContent = 'Restore with ExtensionPay';
    btn.disabled = false;
    if (statusEl) {
      statusEl.textContent = (result.error || 'Could not restore card purchase') + cardRestoreHelpSuffix();
      statusEl.className = 'restore-note error';
    }
  } catch (e) {
    btn.textContent = 'Restore with ExtensionPay';
    btn.disabled = false;
    if (statusEl) {
      statusEl.textContent = 'Error connecting to ExtensionPay.' + cardRestoreHelpSuffix();
      statusEl.className = 'restore-note error';
    }
  }
}

async function handleRestoreLicense(restoreBtn) {
  const emailInput = document.getElementById('restoreEmailInput');
  const statusEl = document.getElementById('restoreStatus');
  const email = emailInput?.value.trim();
  const defaultBtnLabel = 'Restore purchase';
  restoreBtn.disabled = true;
  restoreBtn.textContent = 'Checking...';

  if (statusEl) {
    statusEl.textContent = 'Verificăm licența pe emailul Stripe… / Checking Stripe email restore…';
    statusEl.className = 'restore-note';
  }

  try {
    const restore = window.QuickNotesPro?.restorePurchase;
    const result = restore
      ? await restore({ email, openLogin: false })
      : null;
    if (result.success) {
      restoreBtn.textContent = '✓ Restored!';
      restoreBtn.classList.add('success');
      const via =
        result.method === 'extpay'
          ? 'ExtensionPay'
          : result.method === 'server'
            ? 'license server'
            : result.method === 'stripe'
              ? 'Stripe email'
              : 'purchase';
      if (statusEl) {
        const deviceInfo =
          result.devicesUsed != null
            ? ` (${result.devicesUsed}/${result.maxDevices} devices)`
            : '';
        statusEl.textContent = `✨ Pro restored via ${via}!${deviceInfo}`;
        statusEl.className = 'restore-note success';
      }
      await finishProRestore({
        message: `✨ Pro restored via ${via}!`,
        email: result.email || email,
      });
      return;
    }

    restoreBtn.textContent = defaultBtnLabel;
    restoreBtn.disabled = false;
    if (statusEl) {
      const err = formatRestoreError(
        result?.error ||
          'Could not restore yet. Enter your Stripe receipt email or use ExtensionPay above.'
      );
      const rateLimited =
        result?.rateLimited || /too many restore attempts/i.test(result?.error || '');
      const extHint =
        !rateLimited && result?.needsLogin
          ? ' Try "Restore with ExtensionPay" on this Chrome profile.'
          : '';
      statusEl.textContent =
        err + extHint + (rateLimited ? '' : cardRestoreHelpSuffix());
      statusEl.className = 'restore-note error';
    }
  } catch (e) {
    restoreBtn.textContent = defaultBtnLabel;
    restoreBtn.disabled = false;
    if (statusEl) {
      statusEl.textContent = 'Error checking license.' + cardRestoreHelpSuffix();
      statusEl.className = 'restore-note error';
    }
  }
}

function openProModal(source = 'unknown') {
  const proModal = document.getElementById('proModal');
  if (proModal) {
    proModal.style.display = 'flex';
    if (!isPro) {
      trackFunnelEvent('paywall_viewed', { source });
    }
    
    // If already Pro, hide payment options and show status
    if (isPro) {
      const cardSection = document.getElementById('cardSection');
      const proStatus = document.getElementById('proStatus');
      const proPrice = proModal.querySelector('.pro-price');
      const proGuarantee = proModal.querySelector('.pro-guarantee');
      
      if (cardSection) cardSection.style.display = 'none';
      if (proPrice) proPrice.style.display = 'none';
      if (proGuarantee) proGuarantee.style.display = 'none';
      if (proStatus) proStatus.style.display = 'block';
      const restoreSection = proModal.querySelector('.restore-purchase');
      if (restoreSection) restoreSection.style.display = 'none';
    } else {
      const restoreSection = proModal.querySelector('.restore-purchase');
      if (restoreSection) restoreSection.style.display = '';
    }
    
    // Extend popup height for modal
    document.body.style.minHeight = '520px';
    modalA11y.open(proModal);
  }
}

function closeProModal() {
  const proModal = document.getElementById('proModal');
  if (proModal) {
    modalA11y.close(proModal);
    proModal.style.display = 'none';
    // Reset popup height
    document.body.style.minHeight = '';
  }
}

function handleCardPayment() {
  trackFunnelEvent('upgrade_clicked', { method: 'card' });
  if (window.QuickNotesPro) {
    window.QuickNotesPro.openPaymentPage();
  } else {
    window.open('https://extensionpay.com', '_blank');
  }
}

// ============================================
// 📁 FOLDERS MANAGEMENT
// ============================================

function refreshTabBadges() {
  updateTabBadges();
}

async function loadFolders() {
  folders = await db.getFolders();
  updateFolderUI();
}

const LIST_FILTER_LABELS = {
  all: 'All',
  personal: 'Personal',
  work: 'Work'
};

function updateFolderUI() {
  refreshTabBadges();
  if (!elements.folderPills) return;

  const browsable = allNotesCache.filter(isBrowsableNote);
  const needsCount = countNeedsReview(allNotesCache);
  const archivedTotal = allNotesCache.filter(isArchivedNote).length;
  const pills = [];

  const allCount = browsable.length;
  const allActive =
    currentFolderId === 'all' &&
    (listViewFilter === 'default' || listViewFilter === 'page' || listViewFilter === 'site');
  pills.push({
    kind: 'folder',
    folderId: 'all',
    label: LIST_FILTER_LABELS.all,
    count: allCount,
    active: allActive
  });

  if (canUseFolders()) {
    for (const id of ['personal', 'work']) {
      const folder = folders.find((f) => f.id === id);
      if (!folder) continue;
      const count = browsable.filter((n) => n.folderId === id).length;
      pills.push({
        kind: 'folder',
        folderId: id,
        label: LIST_FILTER_LABELS[id] || folder.name,
        count,
        active: currentFolderId === id && listViewFilter !== 'needs-review' && listViewFilter !== 'archived'
      });
    }
  }

  elements.folderPills.innerHTML = pills
    .map((p) => {
      const badge = p.count > 0 ? `<span class="pill-count">${p.count}</span>` : '';
      const activeClass = p.active ? ' active' : '';
      if (p.kind === 'list') {
        return `<button type="button" class="folder-pill list-filter-pill${activeClass}" data-list-filter="${p.listFilter}">${escapeHtml(p.label)}${badge}</button>`;
      }
      return `<button type="button" class="folder-pill list-filter-pill${activeClass}" data-folder-id="${p.folderId}">${escapeHtml(p.label)}${badge}</button>`;
    })
    .join('');

  updateListFilterOverflowMenu();

  if (elements.noteFolderSelect) {
    const userFolders = folders.filter((f) => f.id !== 'all');
    elements.noteFolderSelect.innerHTML =
      `<option value="">No folder</option>` +
      userFolders.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  }
}

function updateListFilterOverflowMenu() {
  const menu = elements.listFilterMenu;
  if (!menu) return;

  const archivedTotal = allNotesCache.filter(isArchivedNote).length;
  const items = [
    {
      action: 'trash',
      label: trashCountCache > 0 ? `Trash ${trashCountCache}` : 'Trash'
    }
  ];

  if (archivedTotal > 0) {
    items.push({
      action: 'archived',
      label: `Archived ${archivedTotal}`,
      active: listViewFilter === 'archived'
    });
  }

  items.push({ action: 'manage-folders', label: 'Manage folders' });

  menu.innerHTML = items
    .map(
      (item) =>
        `<button type="button" class="list-filter-menu-item${item.active ? ' active' : ''}" role="menuitem" data-overflow-action="${item.action}">${escapeHtml(item.label)}</button>`
    )
    .join('');
}

function closeListFilterMenu() {
  if (elements.listFilterMenu) elements.listFilterMenu.hidden = true;
  if (elements.manageFoldersBtn) {
    elements.manageFoldersBtn.setAttribute('aria-expanded', 'false');
  }
}

function toggleListFilterMenu() {
  const menu = elements.listFilterMenu;
  if (!menu) return;

  if (!menu.hidden) {
    closeListFilterMenu();
    return;
  }

  updateListFilterOverflowMenu();
  menu.hidden = false;
  if (elements.manageFoldersBtn) {
    elements.manageFoldersBtn.setAttribute('aria-expanded', 'true');
  }
}

function handleListFilterOverflowAction(action) {
  closeListFilterMenu();

  if (action === 'trash') {
    openTrash();
    return;
  }
  if (action === 'archived') {
    applyPrimaryListFilter(listViewFilter === 'archived' ? 'all' : 'archived');
    return;
  }
  if (action === 'manage-folders') {
    openFoldersModal();
  }
}

async function filterByFolder(folderId) {
  if (!canUseFolders() && folderId !== 'all') {
    showLimitWarning('Folders require Pro');
    return;
  }
  if (folderId === 'personal') {
    applyPrimaryListFilter('personal');
  } else if (folderId === 'work') {
    applyPrimaryListFilter('work');
  } else {
    applyPrimaryListFilter('all');
  }
}

function openFoldersModal() {
  if (!canUseFolders()) {
    showLimitWarning('Folders require Pro');
    return;
  }
  if (elements.foldersModal) {
    elements.foldersModal.style.display = 'flex';
    renderFoldersList();
    modalA11y.open(elements.foldersModal);
  }
}

function closeFoldersModal() {
  if (elements.foldersModal) {
    modalA11y.close(elements.foldersModal);
    elements.foldersModal.style.display = 'none';
  }
}

function renderFoldersList() {
  if (!elements.foldersList) return;
  
  const userFolders = folders.filter(f => !f.isSystem);
  elements.foldersList.innerHTML = userFolders.map(f => `
    <div class="folder-item" data-id="${f.id}">
      <span class="folder-item-name">${escapeHtml(f.name)}</span>
      <div class="folder-item-actions">
        <button class="btn-rename-folder" data-id="${f.id}" title="Rename folder" aria-label="Rename folder">✏️</button>
        <button class="btn-delete-folder" data-id="${f.id}" title="Delete folder" aria-label="Delete folder">🗑️</button>
      </div>
    </div>
  `).join('') || '<p style="color: var(--text-muted); font-size: 12px; padding: 10px;">No custom folders yet</p>';
}

async function renameFolderById(folderId) {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return;
  const newName = prompt('Rename folder', folder.name);
  if (!newName || !newName.trim()) return;
  try {
    await db.renameFolder(folderId, newName.trim());
    await loadFolders();
    renderFoldersList();
    showToast('Folder renamed');
  } catch (err) {
    showToast(err.message || 'Could not rename folder');
  }
}

async function addFolder() {
  if (!canUseFolders()) {
    showLimitWarning('Folders require Pro');
    return;
  }
  const name = elements.newFolderInput?.value?.trim();
  if (!name) return;
  
  await db.createFolder(name);
  elements.newFolderInput.value = '';
  await loadFolders();
  renderFoldersList();
}

async function deleteFolderById(folderId) {
  const btn = elements.foldersList?.querySelector(`.btn-delete-folder[data-id="${folderId}"]`);
  if (!btn) return;
  twoStepConfirm(btn, '🗑️', async () => {
    await db.deleteFolder(folderId);
    await loadFolders();
    renderFoldersList();
    if (currentFolderId === folderId) {
      currentFolderId = 'all';
      filterByFolder('all');
    }
  });
}

// ============================================
// 🔐 PIN LOCK SYSTEM
// ============================================

async function checkPinLock() {
  const { pinHash } = await chrome.storage.local.get(['pinHash']);
  if (pinHash) {
    showLockScreen();
    return true;
  }
  return false;
}

function showLockScreen() {
  if (elements.lockScreen) {
    elements.lockScreen.style.display = 'flex';
    enteredPin = '';
    updatePinDots();
  }
}

function hideLockScreen() {
  if (elements.lockScreen) {
    elements.lockScreen.style.display = 'none';
    enteredPin = '';
    
    // Initialize app after unlocking
    if (!isSettingPin) {
      initializeApp();
    }
  }
}

function updatePinDots() {
  const dots = elements.pinDots?.querySelectorAll('.pin-dot');
  if (!dots) return;
  
  dots.forEach((dot, i) => {
    dot.classList.remove('filled', 'error');
    if (i < enteredPin.length) {
      dot.classList.add('filled');
    }
  });
}

async function handlePinKey(key) {
  if (key === 'delete') {
    enteredPin = enteredPin.slice(0, -1);
    updatePinDots();
    return;
  }
  
  if (enteredPin.length >= 4) return;
  
  enteredPin += key;
  updatePinDots();
  
  if (enteredPin.length === 4) {
    if (isSettingPin) {
      // Setting new PIN
      await savePinHash(enteredPin);
      isSettingPin = false;
      hideLockScreen();
      showToast('PIN set successfully! 🔒');
      updatePinToggleState();
    } else {
      // Verifying PIN
      const isValid = await verifyPin(enteredPin);
      if (isValid) {
        hideLockScreen();
        // Show secret recovery hint after setting PIN
        showPinSetupHint();
      } else {
        showPinError();
      }
    }
  }
}

function showPinSetupHint() {
  // Tip: tap lock icon 5 times to recover PIN
  setTimeout(() => {
    showToast('Tip: tap 🔒 5x to reset PIN if forgotten');
  }, 300);
}

async function savePinHash(pin) {
  // Simple hash for PIN (not cryptographically secure, but ok for local use)
  const hash = await hashPin(pin);
  await chrome.storage.local.set({ pinHash: hash });
}

async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'quick-notes-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPin(pin) {
  const { pinHash } = await chrome.storage.local.get(['pinHash']);
  const enteredHash = await hashPin(pin);
  return pinHash === enteredHash;
}

function showPinError() {
  const dots = elements.pinDots?.querySelectorAll('.pin-dot');
  dots?.forEach(dot => dot.classList.add('error'));
  
  if (elements.lockMessage) {
    elements.lockMessage.textContent = 'Wrong PIN. Try again.';
    elements.lockMessage.classList.add('error');
  }
  
  setTimeout(() => {
    enteredPin = '';
    updatePinDots();
    if (elements.lockMessage) {
      elements.lockMessage.textContent = 'Enter your PIN';
      elements.lockMessage.classList.remove('error');
    }
  }, 500);
}

function startSetPin() {
  isSettingPin = true;
  showLockScreen();
  if (elements.lockMessage) {
    elements.lockMessage.textContent = 'Create a 4-digit PIN';
  }
}

async function updatePinToggleState() {
  const { pinHash } = await chrome.storage.local.get(['pinHash']);
  const hasPin = !!pinHash;
  
  if (elements.pinLockToggle) {
    elements.pinLockToggle.checked = hasPin;
  }
  if (elements.changePinBtn) {
    elements.changePinBtn.style.display = hasPin ? 'block' : 'none';
  }
}

function openResetPinModal() {
  if (elements.resetPinModal) {
    elements.resetPinModal.style.display = 'flex';
    modalA11y.open(elements.resetPinModal);
    if (elements.resetConfirmInput) {
      elements.resetConfirmInput.value = '';
    }
    if (elements.confirmResetBtn) {
      elements.confirmResetBtn.disabled = true;
    }
  }
}

function closeResetPinModal() {
  if (elements.resetPinModal) {
    modalA11y.close(elements.resetPinModal);
    elements.resetPinModal.style.display = 'none';
  }
}

async function resetPin() {
  await chrome.storage.local.remove(['pinHash']);
  closeResetPinModal();
  hideLockScreen();
  updatePinToggleState();
  showToast('PIN removed successfully');
}

// ============================================
// 📁🔐 SETUP EVENT LISTENERS
// ============================================

// Secret tap counter for forgot PIN
let lockIconTapCount = 0;
let lockIconTapTimer = null;

// PIN listeners need to be setup BEFORE lock check
function setupPinListeners() {
  // PIN keypad
  if (elements.pinKeypad) {
    elements.pinKeypad.addEventListener('click', (e) => {
      const key = e.target.dataset.key;
      if (key) handlePinKey(key);
    });
  }
  
  // Secret: Tap lock icon 5 times to reveal forgot PIN button
  if (elements.lockIcon) {
    elements.lockIcon.addEventListener('click', () => {
      lockIconTapCount++;
      
      // Reset counter after 2 seconds of no taps
      if (lockIconTapTimer) clearTimeout(lockIconTapTimer);
      lockIconTapTimer = setTimeout(() => {
        lockIconTapCount = 0;
      }, 2000);
      
      // After 5 taps, reveal forgot PIN button
      if (lockIconTapCount >= 5) {
        if (elements.forgotPinBtn) {
          elements.forgotPinBtn.style.display = 'block';
        }
        lockIconTapCount = 0;
      }
    });
  }
  
  // Forgot PIN
  if (elements.forgotPinBtn) {
    elements.forgotPinBtn.addEventListener('click', openResetPinModal);
  }
  
  // Reset PIN modal
  if (elements.closeResetPinBtn) {
    elements.closeResetPinBtn.addEventListener('click', closeResetPinModal);
  }
  
  if (elements.cancelResetBtn) {
    elements.cancelResetBtn.addEventListener('click', closeResetPinModal);
  }
  
  if (elements.resetConfirmInput) {
    elements.resetConfirmInput.addEventListener('input', (e) => {
      const isReset = e.target.value.toUpperCase() === 'RESET';
      if (elements.confirmResetBtn) {
        elements.confirmResetBtn.disabled = !isReset;
      }
    });
  }
  
  if (elements.confirmResetBtn) {
    elements.confirmResetBtn.addEventListener('click', resetPin);
  }
}

function setupFoldersAndPinListeners() {
  // Folder pill clicks (event delegation)
  if (elements.folderPills) {
    elements.folderPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.list-filter-pill');
      if (!pill) return;

      const listFilter = pill.dataset.listFilter;
      if (listFilter === 'needs-review') {
        applyPrimaryListFilter(listViewFilter === 'needs-review' ? 'all' : 'needs-review');
        return;
      }

      const folderId = pill.dataset.folderId;
      if (folderId === 'personal') {
        applyPrimaryListFilter('personal');
      } else if (folderId === 'work') {
        applyPrimaryListFilter('work');
      } else if (folderId === 'all') {
        applyPrimaryListFilter('all');
      }
    });
  }

  if (elements.manageFoldersBtn) {
    elements.manageFoldersBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleListFilterMenu();
    });
  }

  if (elements.listFilterMenu) {
    elements.listFilterMenu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-overflow-action]');
      if (!item) return;
      e.stopPropagation();
      handleListFilterOverflowAction(item.dataset.overflowAction);
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#listFilterMoreWrap')) {
      closeListFilterMenu();
    }
  });
  
  // Close folders modal
  if (elements.closeFoldersBtn) {
    elements.closeFoldersBtn.addEventListener('click', closeFoldersModal);
  }
  
  // Add folder
  if (elements.addFolderBtn) {
    elements.addFolderBtn.addEventListener('click', addFolder);
  }
  
  // Enter in folder input
  if (elements.newFolderInput) {
    elements.newFolderInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addFolder();
    });
  }
  
  // Delete folder buttons (delegation)
  if (elements.foldersList) {
    elements.foldersList.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-folder')) {
        deleteFolderById(e.target.dataset.id);
      }
      if (e.target.classList.contains('btn-rename-folder')) {
        renameFolderById(e.target.dataset.id);
      }
    });
  }
  
  // Note folder change in editor
  if (elements.noteFolderSelect) {
    elements.noteFolderSelect.addEventListener('change', async (e) => {
      if (!canUseFolders()) {
        e.target.value = currentNote?.folderId || '';
        showLimitWarning('Folders require Pro');
        return;
      }
      if (currentNote) {
        await db.updateNote(currentNote.id, { folderId: e.target.value || null });
        currentNote.folderId = e.target.value || null;
      }
    });
  }
  
  // PIN toggle in settings (PRO only)
  if (elements.pinLockToggle) {
    elements.pinLockToggle.addEventListener('change', async (e) => {
      if (e.target.checked) {
        // PIN Lock is PRO-only feature
        if (!isPro && !trialInfo.isTrialActive) {
          e.target.checked = false;
          showLimitWarning('PIN Lock is a PRO feature.');
          return;
        }
        startSetPin();
      } else {
        await chrome.storage.local.remove(['pinHash']);
        updatePinToggleState();
        showToast('PIN disabled');
      }
    });
  }
  
  // Change PIN button
  if (elements.changePinBtn) {
    elements.changePinBtn.addEventListener('click', startSetPin);
  }
}

// ============================================
// 🔔 REMINDER SYSTEM
// ============================================

let selectedReminderTime = null;

function openReminderModal() {
  if (!currentNote) return;
  
  // Reset state
  selectedReminderTime = null;
  document.querySelectorAll('.reminder-quick-btn').forEach(b => b.classList.remove('active'));
  
  // Set default datetime to 1 hour from now
  const defaultTime = new Date(Date.now() + 60 * 60 * 1000);
  if (elements.reminderDateTime) {
    elements.reminderDateTime.value = defaultTime.toISOString().slice(0, 16);
  }
  
  if (elements.reminderModal) {
    elements.reminderModal.style.display = 'flex';
    modalA11y.open(elements.reminderModal);
  }
}

function closeReminderModal() {
  if (elements.reminderModal) {
    modalA11y.close(elements.reminderModal);
    elements.reminderModal.style.display = 'none';
  }
}

async function setReminder() {
  if (!currentNote) return;
  
  const dateTimeValue = elements.reminderDateTime?.value;
  if (!dateTimeValue) {
    showToast('Please select a date and time');
    return;
  }
  
  const reminderTime = new Date(dateTimeValue).getTime();
  
  if (reminderTime <= Date.now()) {
    showToast('Please select a future time');
    return;
  }
  
  // Send to service worker to set alarm
  const response = await chrome.runtime.sendMessage({
    action: 'setReminder',
    noteId: currentNote.id,
    reminderTime: reminderTime,
    noteTitle: currentNote.title || 'Quick Note'
  });
  
  if (response?.success) {
    // Update note with reminder info
    await db.updateNote(currentNote.id, { reminder: { time: reminderTime, notified: false } });
    currentNote.reminder = { time: reminderTime, notified: false };
    await trackFunnelEvent('reminder_created', { source: 'editor' });
    
    await loadNotes();
    
    updateReminderBar();
    closeReminderModal();
    
    // Show confirmation with formatted time
    const reminderDate = new Date(reminderTime);
    const timeStr = reminderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = reminderDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    showToast(`⏰ Reminder set for ${dateStr} at ${timeStr}`);

    if (!onboardingState.reminderCreated) {
      await saveOnboardingState({ reminderCreated: true });
      showToast('Step 3/3: Open Settings and download a JSON backup before uninstalling.');
      await trackFunnelEvent('onboarding_backup_nudge_shown', { source: 'reminder' });
    }
  }
}

async function removeReminder() {
  if (!currentNote) return;
  
  // Cancel alarm in service worker
  await chrome.runtime.sendMessage({
    action: 'cancelReminder',
    noteId: currentNote.id
  });
  
  // Update note
  await db.updateNote(currentNote.id, { reminder: null });
  currentNote.reminder = null;
  
  updateReminderBar();
  showToast('🔕 Reminder removed');
}

function updateReminderBar() {
  if (!elements.reminderBar || !elements.reminderText) return;
  
  if (currentNote?.reminder?.time && !currentNote.reminder.notified) {
    const reminderDate = new Date(currentNote.reminder.time);
    const now = new Date();
    
    // Check if reminder is in the past
    if (reminderDate <= now) {
      elements.reminderBar.style.display = 'none';
      return;
    }
    
    // Format the date nicely
    let displayText;
    const diff = reminderDate - now;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      displayText = `${days} day${days > 1 ? 's' : ''} from now`;
    } else if (hours > 0) {
      displayText = `${hours} hour${hours > 1 ? 's' : ''} from now`;
    } else if (minutes > 0) {
      displayText = `${minutes} min from now`;
    } else {
      displayText = 'Very soon';
    }
    
    // Also show actual time
    const timeStr = reminderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = reminderDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    
    elements.reminderText.textContent = `${dateStr} ${timeStr} (${displayText})`;
    elements.reminderBar.style.display = 'flex';
    
    // Update button to show it has reminder
    if (elements.reminderBtn) {
      elements.reminderBtn.textContent = '🔔';
      elements.reminderBtn.title = 'Edit reminder';
    }
  } else {
    elements.reminderBar.style.display = 'none';
    if (elements.reminderBtn) {
      elements.reminderBtn.textContent = '🔔';
      elements.reminderBtn.title = 'Set reminder';
    }
  }
}

async function loadNoteReminder() {
  if (!currentNote) return;
  
  // Get reminder from service worker storage
  const reminder = await chrome.runtime.sendMessage({
    action: 'getReminder',
    noteId: currentNote.id
  });
  
  if (reminder) {
    currentNote.reminder = reminder;
  }
  
  updateReminderBar();
}

// Check if opened from notification
async function checkOpenFromNotification() {
  const result = await chrome.storage.local.get(['openNoteId']);
  if (result.openNoteId) {
    // Clear the intent
    await chrome.storage.local.remove(['openNoteId']);
    
    // Open the note
    const note = await db.getNote(result.openNoteId);
    if (note) {
      openNote(result.openNoteId);
    }
  }
}
