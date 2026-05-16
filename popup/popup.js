// Quick Notes - The fastest notes extension on Chrome
// Instant capture. Zero friction. Keyboard-first.

import * as db from '../storage/db.js';
import * as backup from '../storage/backup.js';

// ⚡ PERFORMANCE: Track load time from the very start
const LOAD_START = performance.now();

// State
let currentNote = null;
let notes = [];
let currentContext = null;
let isFirstRun = false;
let isPro = false;  // Pro status - declared early for use in trial system
let currentFolderId = 'all';  // Current folder filter
let folders = [];  // All folders
let enteredPin = '';  // Current PIN being entered
let isSettingPin = false;  // Whether we're setting a new PIN
let settings = {
  theme: 'dark',
  quickAddMode: false,
  includeContext: true,
  fastMode: false
};

// ============================================
// 🎁 TRIAL SYSTEM (7 days full access)
// ============================================
const TRIAL_DAYS = 7;
let trialInfo = {
  startDate: null,
  isTrialActive: false,
  daysRemaining: 0,
  isExpired: false
};

async function initTrialSystem() {
  const stored = await chrome.storage.local.get(['trialStartDate', 'proUnlocked']);
  
  // If Pro, no trial needed
  if (stored.proUnlocked) {
    trialInfo.isTrialActive = false;
    trialInfo.isExpired = false;
    return;
  }
  
  // First time? Start trial
  if (!stored.trialStartDate) {
    const now = Date.now();
    await chrome.storage.local.set({ trialStartDate: now });
    trialInfo.startDate = now;
  } else {
    trialInfo.startDate = stored.trialStartDate;
  }
  
  // Calculate trial status
  const elapsed = Date.now() - trialInfo.startDate;
  const daysElapsed = Math.floor(elapsed / (1000 * 60 * 60 * 24));
  trialInfo.daysRemaining = Math.max(0, TRIAL_DAYS - daysElapsed);
  trialInfo.isTrialActive = trialInfo.daysRemaining > 0;
  trialInfo.isExpired = trialInfo.daysRemaining === 0;
}

// ============================================
// 🔒 FREE vs PRO LIMITS (used after trial)
// ============================================
const FREE_LIMITS = {
  maxNotes: 5,
  maxCharsPerNote: 500,
  canSearch: false,
  canExport: true  // Export is FREE - builds trust!
};

function showLimitWarning(message) {
  showToast(message + ' ✨ Upgrade to Pro');
  openProModal();
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
    if (elements.trialDays) {
      if (trialInfo.daysRemaining === 1) {
        elements.trialDays.textContent = '⏰ Last day of trial!';
      } else {
        elements.trialDays.textContent = `🎁 ${trialInfo.daysRemaining} days left in trial`;
      }
    }
  } 
  // Trial expired - show upgrade prompt
  else if (trialInfo.isExpired) {
    elements.trialBanner.style.display = 'flex';
    elements.trialBanner.className = 'trial-banner expired';
    if (elements.trialDays) {
      elements.trialDays.textContent = '✨ Trial ended — upgrade for unlimited notes, search & folders';
    }
  }
}

// Check current limits (trial or free)
function getCurrentLimits() {
  if (isPro || trialInfo.isTrialActive) {
    return {
      maxNotes: Infinity,
      maxCharsPerNote: Infinity,
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
    elements.manageFoldersBtn.title = allowed ? 'Manage folders' : 'Folders (Pro)';
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
  const isListView = view === 'list';

  if (elements.listView) elements.listView.style.display = view === 'list' ? 'block' : 'none';
  if (elements.editorView) elements.editorView.style.display = view === 'editor' ? 'block' : 'none';
  if (elements.trashView) elements.trashView.style.display = view === 'trash' ? 'block' : 'none';

  if (searchContainer) searchContainer.style.display = isListView ? 'block' : 'none';
  if (folderFilter) folderFilter.style.display = isListView ? 'flex' : 'none';
  if (elements.shortcutsFooter) elements.shortcutsFooter.style.display = isListView ? 'flex' : 'none';
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
    speedBadge: document.getElementById('speedBadge'),
    shortcutsFooter: document.getElementById('shortcutsFooter'),
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
    trashToggleBtn: document.getElementById('trashToggleBtn'),
    trashCount: document.getElementById('trashCount'),
    trashList: document.getElementById('trashList'),
    trashBackBtn: document.getElementById('trashBackBtn'),
    emptyTrashBtn: document.getElementById('emptyTrashBtn'),
    trashEmptyState: document.getElementById('trashEmptyState'),
    // Trial banner
    trialBanner: document.getElementById('trialBanner'),
    trialDays: document.getElementById('trialDays'),
    trialUpgradeBtn: document.getElementById('trialUpgradeBtn'),
    // Folders
    folderPills: document.getElementById('folderPills'),
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

  // Check if first run
  const stored = await chrome.storage.local.get(['hasLaunched']);
  isFirstRun = !stored.hasLaunched;

  // Initialize trial system
  await initTrialSystem();
  await checkProStatus();
  setupProModalHandlers();
  await checkOpenFromNotification();
  
  await loadSettings();
  updateAppVersionFooter();
  await loadFolders();
  await loadNotes();
  await updateTrashButton();
  await maybeOfferLocalBackupRestore();
  setupEventListeners();
  setupBackupListeners();
  updateBackupUI();
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

  // ⚡ Display load time - THE USP
  const loadTime = performance.now() - LOAD_START;
  if (elements.speedBadge) {
    elements.speedBadge.textContent = `${Math.round(loadTime)}ms`;
    elements.speedBadge.title = `Loaded in ${loadTime.toFixed(1)}ms`;
  }

  console.log(`⚡ Quick Notes loaded in ${loadTime.toFixed(1)}ms`);

  // 🎉 FIRST RUN EXPERIENCE - THE WOW MOMENT
  if (isFirstRun) {
    showWelcome(loadTime);
  } else if (settings.quickAddMode) {
    // Quick Add Mode - go directly to editor
    await createNewNote();
  }
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
  }
}

async function dismissWelcome() {
  if (elements.welcomeModal) {
    elements.welcomeModal.style.display = 'none';
  }
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
  if (currentFolderId && currentFolderId !== 'all') {
    notes = await db.getNotesByFolder(currentFolderId);
  } else {
    notes = await db.getAllNotes();
  }
  renderNotesList();
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
  const remaining = limits.maxNotes - notes.length;
  if (remaining <= 3 && remaining > 0) {
    limitIndicator.textContent = remaining + ' notes left';
    limitIndicator.className = 'limit-indicator warning';
    limitIndicator.style.display = 'block';
  } else if (remaining <= 0) {
    limitIndicator.textContent = 'Limit reached! ✨ Upgrade';
    limitIndicator.className = 'limit-indicator exceeded';
    limitIndicator.style.display = 'block';
    limitIndicator.onclick = openProModal;
  } else {
    limitIndicator.style.display = 'none';
  }
}
function renderNotesList(filteredNotes = null) {
  // 🔒 Show notes limit indicator for free users
  updateNotesLimitIndicator();
  const displayNotes = filteredNotes || notes;

  if (displayNotes.length === 0) {
    if (elements.notesList) elements.notesList.innerHTML = '';
    if (elements.emptyState) elements.emptyState.style.display = 'block';
    return;
  }

  if (elements.emptyState) elements.emptyState.style.display = 'none';

  if (elements.notesList) {
    elements.notesList.innerHTML = displayNotes.map(note => {
      const hasContext = note.contextUrl && note.contextUrl.length > 0;
      const hasReminder = note.reminder && note.reminder.time && !note.reminder.notified;
      return `
        <div class="note-card ${note.pinned ? 'pinned' : ''}" data-id="${note.id}">
          <div class="note-card-header">
            <div class="note-card-title">
              ${note.pinned ? '<span class="pin-icon">📌</span>' : ''}
              ${hasReminder ? '<span class="reminder-icon" title="Reminder set">⏰</span>' : ''}
              ${escapeHtml(note.title || 'Untitled')}
            </div>
            <button class="btn-copy-note" data-id="${note.id}" title="Copy to clipboard">📋</button>
          </div>
          <div class="note-card-preview ${!getPreview(note.content) ? 'note-card-preview--empty' : ''}">${getPreview(note.content) || 'No content'}</div>
          ${hasContext ? `
            <div class="note-card-context">
              ${note.contextFavicon ? `<img src="${note.contextFavicon}" alt="">` : '🔗'}
              <span>${getDomain(note.contextUrl)}</span>
            </div>
          ` : ''}
          <div class="note-card-date">${formatDate(note.updatedAt)}</div>
        </div>
      `;
    }).join('');

    // Add click handlers for cards
    elements.notesList.querySelectorAll('.note-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't open if clicking copy button
        if (e.target.closest('.btn-copy-note')) return;
        openNote(card.dataset.id);
      });
    });

    // 🔥 VIRAL FEATURE: Copy button handlers
    elements.notesList.querySelectorAll('.btn-copy-note').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyNoteToClipboard(btn.dataset.id);
      });
    });
  }
}

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
  if (!isPro && !trialInfo.isTrialActive && notes.length >= limits.maxNotes) {
    showLimitWarning('Free limit: ' + limits.maxNotes + ' notes');
    return;
  }
  
  // Get context from current tab if enabled
  if (settings.includeContext) {
    try {
      currentContext = await chrome.runtime.sendMessage({ action: 'getContext' });
    } catch (e) {
      currentContext = null;
    }
  } else {
    currentContext = null;
  }

  // Create note in current folder (unless it's "all")
  const folderId = (canUseFolders() && currentFolderId !== 'all') ? currentFolderId : null;
  currentNote = await db.createNote('', 'Untitled', folderId);

  // Add context to note
  if (currentContext && currentContext.url && !currentContext.url.startsWith('chrome://')) {
    currentNote.contextUrl = currentContext.url;
    currentNote.contextTitle = currentContext.title;
    currentNote.contextFavicon = currentContext.favIconUrl;
    await db.updateNote(currentNote.id, {
      contextUrl: currentContext.url,
      contextTitle: currentContext.title,
      contextFavicon: currentContext.favIconUrl
    });
  }

  notes.unshift(currentNote);
  openEditor();

  if (elements.noteTitleInput) {
    elements.noteTitleInput.focus();
    elements.noteTitleInput.select();
  }
}

async function openNote(id) {
  currentNote = await db.getNote(id);
  if (!currentNote) return;

  // Restore context from note
  if (currentNote.contextUrl) {
    currentContext = {
      url: currentNote.contextUrl,
      title: currentNote.contextTitle,
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

  const limits = getCurrentLimits();
  if (limits.maxCharsPerNote !== Infinity && elements.noteContentEditor) {
    const charCount = (elements.noteContentEditor.textContent || '').length;
    if (charCount > limits.maxCharsPerNote) {
      showLimitWarning(`${limits.maxCharsPerNote} character limit reached`);
      return;
    }
  }

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
  backup.scheduleAutoBackup(isPro);
}

// ============================================
// CONTEXT CAPTURE
// ============================================

function updateContextInfo() {
  if (!elements.contextInfo) return;

  if (currentContext && currentContext.url && !currentContext.url.startsWith('chrome://')) {
    elements.contextInfo.style.display = 'flex';

    if (elements.contextFavicon && currentContext.favIconUrl) {
      elements.contextFavicon.src = currentContext.favIconUrl;
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
  const count = trash.length;
  
  if (elements.trashToggleBtn) {
    if (count > 0) {
      elements.trashToggleBtn.style.display = 'flex';
      if (elements.trashCount) {
        elements.trashCount.textContent = count;
      }
    } else {
      elements.trashToggleBtn.style.display = 'none';
    }
  }
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
    renderNotesList();
    if (elements.clearSearch) elements.clearSearch.style.display = 'none';
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

  const filtered = await db.searchNotes(query);
  renderNotesList(filtered);
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
  if (elements.trashToggleBtn) elements.trashToggleBtn.addEventListener('click', openTrash);
  if (elements.trashBackBtn) elements.trashBackBtn.addEventListener('click', closeTrash);
  if (elements.emptyTrashBtn) elements.emptyTrashBtn.addEventListener('click', emptyTrash);

  // Trial upgrade button
  if (elements.trialUpgradeBtn) {
    elements.trialUpgradeBtn.addEventListener('click', openProModal);
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
  if (elements.settingsModal) elements.settingsModal.style.display = 'flex';
  updateBackupUI();
}

function closeSettings() {
  if (elements.settingsModal) elements.settingsModal.style.display = 'none';
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
    showToast(`Restored ${result.count} notes from auto-backup`);
    await loadNotes();
    await loadFolders();
    updateBackupUI();
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
  updateBackupUI();
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
  if (isPro) backup.scheduleAutoBackup(true);
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
  if (isPro) backup.scheduleAutoBackup(true);
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
      loadNotes();
      backup.scheduleAutoBackup(isPro);
      updateBackupUI();
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
// ✨ PRO / PAYMENT INTEGRATION (Card + Crypto)
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
  
  if (proHeaderBtn) proHeaderBtn.addEventListener('click', openProModal);
  if (closeProBtn) closeProBtn.addEventListener('click', closeProModal);
  if (upgradeBtn) upgradeBtn.addEventListener('click', handleCardPayment);
  
  if (proModal) {
    proModal.addEventListener('click', (e) => {
      if (e.target === proModal) closeProModal();
    });
  }
  
  // Payment method toggle
  document.querySelectorAll('.payment-method').forEach(btn => {
    btn.addEventListener('click', () => {
      const method = btn.dataset.method;
      document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('active'));
      btn.classList.add('active');
      
      const cardSection = document.getElementById('cardSection');
      const cryptoSection = document.getElementById('cryptoSection');
      if (cardSection) cardSection.style.display = method === 'card' ? 'block' : 'none';
      if (cryptoSection) {
        cryptoSection.style.display = method === 'crypto' ? 'block' : 'none';
        // Generate QR code when crypto section is shown
        if (method === 'crypto') generateCryptoQR();
      }
      updateRestoreUiForPaymentMethod();
    });
  });
  updateRestoreUiForPaymentMethod();
  
  // Copy crypto address
  const copyBtn = document.getElementById('copyAddressBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const address = window.QuickNotesPro?.CRYPTO_CONFIG?.receiverAddress || '0x607Fc9D41858Aa23065275043698a9262F8f9bf9';
      try {
        await navigator.clipboard.writeText(address);
        copyBtn.textContent = '✅ Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy Address';
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    });
  }
  
  // Verify crypto transaction via server
  const verifyBtn = document.getElementById('verifyTxBtn');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', async () => {
      const emailInput = document.getElementById('cryptoEmailInput');
      const txInput = document.getElementById('txHashInput');
      const statusEl = document.getElementById('cryptoStatus');
      const email = emailInput?.value.trim();
      const txHash = txInput?.value.trim();
      
      if (!email) {
        if (statusEl) {
          statusEl.textContent = 'Please enter your email';
          statusEl.className = 'crypto-note error';
        }
        return;
      }
      
      if (!txHash) {
        if (statusEl) {
          statusEl.textContent = 'Please enter the transaction hash';
          statusEl.className = 'crypto-note error';
        }
        return;
      }
      
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying...';
      if (statusEl) {
        statusEl.textContent = 'Checking transaction on Base...';
        statusEl.className = 'crypto-note';
      }
      
      try {
        const extensionId = await getExtensionId();
        const response = await fetch(`${PRO_API}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash, extensionId, email })
        });
        const result = await response.json();
        
        if (result.success) {
          verifyBtn.textContent = '✓ Verified!';
          verifyBtn.classList.add('success');
          if (statusEl) {
            const deviceInfo = result.devicesUsed ? ` (${result.devicesUsed}/${result.maxDevices} devices)` : '';
            statusEl.textContent = `✨ Pro unlocked!${deviceInfo}`;
            statusEl.className = 'crypto-note success';
          }
          await onProUnlocked('✨ Pro unlocked!');
          await chrome.storage.local.set({ proEmail: email });
          setTimeout(closeProModal, 2000);
        } else {
          verifyBtn.textContent = 'Verify & Activate';
          verifyBtn.disabled = false;
          if (statusEl) {
            statusEl.textContent = result.error || 'Verification failed';
            statusEl.className = 'crypto-note error';
          }
        }
      } catch (e) {
        verifyBtn.textContent = 'Verify & Activate';
        verifyBtn.disabled = false;
        if (statusEl) {
          statusEl.textContent = 'Error verifying transaction';
          statusEl.className = 'crypto-note error';
        }
      }
    });
  }
  
  const restoreBtn = document.getElementById('restoreLicenseBtn');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => handleRestoreLicense(restoreBtn));
  }

  const restoreExtPayBtn = document.getElementById('restoreExtPayBtn');
  if (restoreExtPayBtn) {
    restoreExtPayBtn.addEventListener('click', () => handleRestoreExtensionPay(restoreExtPayBtn));
  }
}

function getActivePaymentMethod() {
  const active = document.querySelector('.payment-method.active');
  return active?.dataset.method || 'card';
}

function updateRestoreUiForPaymentMethod() {
  const method = getActivePaymentMethod();
  const emailInput = document.getElementById('restoreEmailInput');
  const restoreBtn = document.getElementById('restoreLicenseBtn');
  const hint = document.getElementById('restoreHint');
  if (method === 'crypto') {
    if (emailInput) emailInput.placeholder = 'Email used for crypto purchase';
    if (restoreBtn) restoreBtn.textContent = 'Restore crypto license';
    if (hint) {
      hint.innerHTML =
        'Crypto: enter the <strong>email</strong> you used when verifying your transaction.';
    }
  } else {
    if (emailInput) emailInput.placeholder = 'Email from Stripe receipt (optional if saved)';
    if (restoreBtn) restoreBtn.textContent = 'Restore purchase';
    if (hint) {
      hint.innerHTML =
        'We try ExtensionPay, then your <strong>Stripe receipt email</strong>. Same email as your card payment.';
    }
  }
}

const RESTORE_SUPPORT_EMAIL = 'quicknotes.extension@gmail.com';

function formatRestoreError(message) {
  if (!message) return message;
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
    statusEl.className = 'crypto-note';
  }

  try {
    const restore = window.QuickNotesPro?.restoreExtensionPay;
    const result = restore ? await restore({ email, openLogin: true }) : null;

    if (!result) throw new Error('Restore unavailable');

    if (result.success) {
      btn.textContent = '✓ Restored!';
      btn.classList.add('success');
      if (statusEl) {
        statusEl.textContent = '✨ Pro restored via ExtensionPay!';
        statusEl.className = 'crypto-note success';
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
      statusEl.className = 'crypto-note error';
    }
  } catch (e) {
    btn.textContent = 'Restore with ExtensionPay';
    btn.disabled = false;
    if (statusEl) {
      statusEl.textContent = 'Error connecting to ExtensionPay.' + cardRestoreHelpSuffix();
      statusEl.className = 'crypto-note error';
    }
  }
}

async function handleRestoreLicense(restoreBtn) {
  const emailInput = document.getElementById('restoreEmailInput');
  const statusEl = document.getElementById('restoreStatus');
  const email = emailInput?.value.trim();
  const method = getActivePaymentMethod();
  const isCard = method !== 'crypto';

  if (!isCard && !email) {
    if (statusEl) {
      statusEl.textContent = 'Please enter your email (crypto purchases only)';
      statusEl.className = 'crypto-note error';
    }
    return;
  }

  const defaultBtnLabel = isCard ? 'Restore purchase' : 'Restore crypto license';
  restoreBtn.disabled = true;
  restoreBtn.textContent = 'Checking...';

  if (statusEl) {
    statusEl.textContent = isCard
      ? 'Verificăm licența pe emailul Stripe… / Checking Stripe email restore…'
      : 'Checking crypto license…';
    statusEl.className = 'crypto-note';
  }

  try {
    if (isCard) {
      const restore = window.QuickNotesPro?.restorePurchase;
      const result = restore
        ? await restore({ email, openLogin: false })
        : null;

      if (result?.success) {
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
          statusEl.className = 'crypto-note success';
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
        statusEl.className = 'crypto-note error';
      }
      return;
    }

    const restore = window.QuickNotesPro?.restoreLicenseByEmail;
    const result = restore ? await restore(email) : null;

    if (!result) {
      throw new Error('Restore unavailable');
    }

    if (result.success) {
      restoreBtn.textContent = '✓ Restored!';
      restoreBtn.classList.add('success');
      if (statusEl) {
        const deviceInfo = result.devicesUsed ? ` (${result.devicesUsed}/${result.maxDevices} devices)` : '';
        statusEl.textContent = `✨ Crypto license restored!${deviceInfo}`;
        statusEl.className = 'crypto-note success';
      }
      await finishProRestore({ message: '✨ Pro restored!', email });
      return;
    }

    restoreBtn.textContent = defaultBtnLabel;
    restoreBtn.disabled = false;
    if (statusEl) {
      statusEl.textContent = (result.error || 'No crypto license found for this email.') + cardRestoreHelpSuffix();
      statusEl.className = 'crypto-note error';
    }
  } catch (e) {
    restoreBtn.textContent = defaultBtnLabel;
    restoreBtn.disabled = false;
    if (statusEl) {
      statusEl.textContent = 'Error checking license.' + cardRestoreHelpSuffix();
      statusEl.className = 'crypto-note error';
    }
  }
}

function openProModal() {
  const proModal = document.getElementById('proModal');
  if (proModal) {
    proModal.style.display = 'flex';
    
    // If already Pro, hide payment options and show status
    if (isPro) {
      const paymentMethods = proModal.querySelector('.payment-methods');
      const cardSection = document.getElementById('cardSection');
      const cryptoSection = document.getElementById('cryptoSection');
      const proStatus = document.getElementById('proStatus');
      const proFeatures = proModal.querySelector('.pro-features');
      const proPrice = proModal.querySelector('.pro-price');
      const proGuarantee = proModal.querySelector('.pro-guarantee');
      
      if (paymentMethods) paymentMethods.style.display = 'none';
      if (cardSection) cardSection.style.display = 'none';
      if (cryptoSection) cryptoSection.style.display = 'none';
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
  }
}

function closeProModal() {
  const proModal = document.getElementById('proModal');
  if (proModal) {
    proModal.style.display = 'none';
    // Reset popup height
    document.body.style.minHeight = '';
  }
}

function handleCardPayment() {
  if (window.QuickNotesPro) {
    window.QuickNotesPro.openPaymentPage();
  } else {
    window.open('https://extensionpay.com', '_blank');
  }
}

// Start crypto payment verification
function generateCryptoQR() {
  // No auto-verification - manual email process
}

// ============================================
// 📁 FOLDERS MANAGEMENT
// ============================================

async function loadFolders() {
  folders = await db.getFolders();
  updateFolderUI();
}

function updateFolderUI() {
  const visibleFolders = canUseFolders() ? folders : folders.filter((f) => f.id === 'all');

  if (elements.folderPills) {
    elements.folderPills.innerHTML = visibleFolders.map(f => {
      const count = f.id === 'all'
        ? notes.length
        : notes.filter(n => n.folderId === f.id).length;
      const badge = count > 0 ? `<span class="pill-count">${count}</span>` : '';
      return `<button class="folder-pill${f.id === currentFolderId ? ' active' : ''}" data-folder-id="${f.id}">${escapeHtml(f.name)}${badge}</button>`;
    }).join('');
  }

  // Update editor folder dropdown
  if (elements.noteFolderSelect) {
    const userFolders = folders.filter(f => f.id !== 'all');
    elements.noteFolderSelect.innerHTML =
      `<option value="">No folder</option>` +
      userFolders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  }
}

async function filterByFolder(folderId) {
  if (!canUseFolders() && folderId !== 'all') {
    showLimitWarning('Folders require Pro');
    return;
  }
  currentFolderId = folderId;
  notes = await db.getNotesByFolder(folderId);
  renderNotesList(notes);
  // Sync active pill
  if (elements.folderPills) {
    elements.folderPills.querySelectorAll('.folder-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.folderId === folderId);
    });
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
  }
}

function closeFoldersModal() {
  if (elements.foldersModal) {
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
      const pill = e.target.closest('.folder-pill');
      if (pill) filterByFolder(pill.dataset.folderId);
    });
  }

  // Manage folders button
  if (elements.manageFoldersBtn) {
    elements.manageFoldersBtn.addEventListener('click', openFoldersModal);
  }
  
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
  }
}

function closeReminderModal() {
  if (elements.reminderModal) {
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
    
    // Refresh notes list to show reminder icon
    notes = await db.getAllNotes();
    renderNotesList();
    
    updateReminderBar();
    closeReminderModal();
    
    // Show confirmation with formatted time
    const reminderDate = new Date(reminderTime);
    const timeStr = reminderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = reminderDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    showToast(`⏰ Reminder set for ${dateStr} at ${timeStr}`);
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
