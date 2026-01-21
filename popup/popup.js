// Quick Notes - The fastest notes extension on Chrome
// Instant capture. Zero friction. Keyboard-first.

import * as db from '../storage/db.js';

// ⚡ PERFORMANCE: Track load time from the very start
const LOAD_START = performance.now();

// State
let currentNote = null;
let notes = [];
let currentContext = null;
let isFirstRun = false;
let settings = {
  theme: 'dark',
  quickAddMode: false,
  includeContext: true,
  fastMode: false
};

// ============================================
// 🔒 FREE vs PRO LIMITS
// ============================================
const FREE_LIMITS = {
  maxNotes: 10,
  maxCharsPerNote: 500,
  canSearch: false,
  canExport: false
};

function showLimitWarning(message) {
  showToast(message + ' ✨ Upgrade to Pro');
  openProModal();
}

// DOM Elements
let elements = {};

function initDomElements() {
  elements = {
    listView: document.getElementById('listView'),
    editorView: document.getElementById('editorView'),
    notesList: document.getElementById('notesList'),
    emptyState: document.getElementById('emptyState'),
    searchInput: document.getElementById('searchInput'),
    searchHint: document.querySelector('.search-hint'),
    clearSearch: document.getElementById('clearSearch'),
    newNoteBtn: document.getElementById('newNoteBtn'),
    backBtn: document.getElementById('backBtn'),
    noteTitleInput: document.getElementById('noteTitleInput'),
    noteContentEditor: document.getElementById('noteContentEditor'),
    pinNoteBtn: document.getElementById('pinNoteBtn'),
    deleteNoteBtn: document.getElementById('deleteNoteBtn'),
    noteDate: document.getElementById('noteDate'),
    noteChars: document.getElementById('noteChars'),
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
    // New: Toast & Welcome
    copyToast: document.getElementById('copyToast'),
    welcomeModal: document.getElementById('welcomeModal'),
    welcomeSpeed: document.getElementById('welcomeSpeed'),
    welcomeStartBtn: document.getElementById('welcomeStartBtn')
  };
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  initDomElements();

  // Check if first run
  const stored = await chrome.storage.local.get(['hasLaunched']);
  isFirstRun = !stored.hasLaunched;

  await loadSettings();
  await loadNotes();
  setupEventListeners();
  setupToolbar();
  setupKeyboardShortcuts();

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
});

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

// ============================================
// NOTES CRUD
// ============================================

async function loadNotes() {
  notes = await db.getAllNotes();
  renderNotesList();
}

function updateNotesLimitIndicator() {
  const limitIndicator = document.getElementById('notesLimitIndicator');
  if (!limitIndicator) return;
  
  if (!isPro) {
    const remaining = FREE_LIMITS.maxNotes - notes.length;
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
      return `
        <div class="note-card ${note.pinned ? 'pinned' : ''}" data-id="${note.id}">
          <div class="note-card-header">
            <div class="note-card-title">
              ${note.pinned ? '<span class="pin-icon">📌</span>' : ''}
              ${escapeHtml(note.title || 'Untitled')}
            </div>
            <button class="btn-copy-note" data-id="${note.id}" title="Copy to clipboard">📋</button>
          </div>
          <div class="note-card-preview">${getPreview(note.content)}</div>
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

  // Convert HTML content to plain text
  const div = document.createElement('div');
  div.innerHTML = note.content || '';
  const text = div.textContent || div.innerText || '';

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

function showToast(message) {
  if (!elements.copyToast) return;
  
  elements.copyToast.textContent = message;
  elements.copyToast.classList.add('show');
  
  setTimeout(() => {
    elements.copyToast.classList.remove('show');
  }, 1500);
}

async function createNewNote() {
  // 🔒 FREE LIMIT: Max notes check
  if (!isPro && notes.length >= FREE_LIMITS.maxNotes) {
    showLimitWarning('Free limit: ' + FREE_LIMITS.maxNotes + ' notes');
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

  currentNote = await db.createNote('', 'Untitled');

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
}

function openEditor() {
  if (elements.listView) elements.listView.style.display = 'none';
  if (elements.editorView) elements.editorView.style.display = 'block';

  const searchContainer = document.getElementById('searchContainer');
  if (searchContainer) searchContainer.style.display = 'none';
  if (elements.shortcutsFooter) elements.shortcutsFooter.style.display = 'none';

  if (elements.noteTitleInput) elements.noteTitleInput.value = currentNote?.title || '';
  if (elements.noteContentEditor) elements.noteContentEditor.innerHTML = currentNote?.content || '';

  updateContextInfo();
  updatePinButton();
  updateNoteMeta();

  // Focus content if title exists
  if (currentNote?.title && currentNote.title !== 'Untitled') {
    if (elements.noteContentEditor) elements.noteContentEditor.focus();
  }
}

function closeEditor() {
  saveCurrentNote();

  if (elements.editorView) elements.editorView.style.display = 'none';
  if (elements.listView) elements.listView.style.display = 'block';

  const searchContainer = document.getElementById('searchContainer');
  if (searchContainer) searchContainer.style.display = 'block';
  if (elements.shortcutsFooter) elements.shortcutsFooter.style.display = 'flex';

  currentNote = null;
  currentContext = null;
  loadNotes();
}

async function saveCurrentNote() {
  if (!currentNote) return;

  const title = elements.noteTitleInput?.value?.trim() || 'Untitled';
  const content = elements.noteContentEditor?.innerHTML || '';

  await db.updateNote(currentNote.id, { title, content });
  currentNote.title = title;
  currentNote.content = content;
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
  saveTimeout = setTimeout(saveCurrentNote, 500);
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

async function deleteNote() {
  if (!currentNote) return;
  if (confirm('Delete this note?')) {
    await db.deleteNote(currentNote.id);
    closeEditor();
  }
}

// ============================================
// SEARCH
// ============================================

async function searchNotes(query) {
  if (!query.trim()) {
    renderNotesList();
    if (elements.clearSearch) elements.clearSearch.style.display = 'none';
    if (elements.searchHint) elements.searchHint.style.display = 'block';
    return;
  }

  // 🔒 FREE LIMIT: Search is Pro only
  if (!isPro && !FREE_LIMITS.canSearch) {
    elements.searchInput.value = '';
    showLimitWarning('Search is a Pro feature');
    return;
  }

  if (elements.clearSearch) elements.clearSearch.style.display = 'block';
  if (elements.searchHint) elements.searchHint.style.display = 'none';

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
  if (elements.noteTitleInput) elements.noteTitleInput.addEventListener('input', scheduleAutoSave);
  if (elements.noteContentEditor) {
    elements.noteContentEditor.addEventListener('input', scheduleAutoSave);
  }

  // Pin & Delete
  if (elements.pinNoteBtn) elements.pinNoteBtn.addEventListener('click', togglePin);
  if (elements.deleteNoteBtn) elements.deleteNoteBtn.addEventListener('click', deleteNote);

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

    elements.searchInput.addEventListener('focus', () => {
      if (elements.searchHint) elements.searchHint.style.display = 'none';
    });

    elements.searchInput.addEventListener('blur', () => {
      if (!elements.searchInput.value && elements.searchHint) {
        elements.searchHint.style.display = 'block';
      }
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
}

function closeSettings() {
  if (elements.settingsModal) elements.settingsModal.style.display = 'none';
}

// ============================================
// EXPORT/IMPORT
// ============================================

async function exportNotes(format) {
  // 🔒 FREE LIMIT: Export is Pro only
  if (!isPro && !FREE_LIMITS.canExport) {
    showLimitWarning('Export is a Pro feature');
    return;
  }
  
  const data = await db.exportNotes(format);
  const blob = new Blob([data], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `quick-notes-export.${format}`;
  a.click();

  URL.revokeObjectURL(url);
}

async function importNotes(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const count = await db.importNotes(e.target.result);
      alert(`Imported ${count} notes!`);
      loadNotes();
    } catch (err) {
      alert('Failed to import notes. Make sure the file is valid JSON.');
    }
  };
  reader.readAsText(file);
}

// ============================================
// HELPERS
// ============================================

function getPreview(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  const text = div.textContent || div.innerText || '';
  return escapeHtml(text.slice(0, 100));
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
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

let isPro = false;

async function checkProStatus() {
  try {
    if (window.QuickNotesPro) {
      isPro = await window.QuickNotesPro.isPro();
    } else {
      const { proUnlocked } = await chrome.storage.sync.get(['proUnlocked']);
      isPro = proUnlocked === true;
    }
    
    if (isPro) {
      document.body.classList.add('is-pro');
      const proHeaderBtn = document.getElementById('proHeaderBtn');
      if (proHeaderBtn) proHeaderBtn.style.display = 'none';
    }
  } catch (e) {
    console.log('Pro check error:', e);
  }
}

async function initProFeatures() {
  await checkProStatus();
  
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
      if (cryptoSection) cryptoSection.style.display = method === 'crypto' ? 'block' : 'none';
    });
  });
  
  // Copy crypto address
  const copyBtn = document.getElementById('copyAddressBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const address = window.QuickNotesPro?.CRYPTO_CONFIG?.receiverAddress || '0x607Fc9D41858Aa23065275043698a9262F8f9bf9';
      try {
        await navigator.clipboard.writeText(address);
        copyBtn.textContent = '✓';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '📋';
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    });
  }
  
  // Verify crypto transaction
  const verifyBtn = document.getElementById('verifyTxBtn');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', async () => {
      const txInput = document.getElementById('txHashInput');
      const statusEl = document.getElementById('cryptoStatus');
      const txHash = txInput?.value.trim();
      
      if (!txHash) {
        if (statusEl) {
          statusEl.textContent = 'Please enter a transaction hash';
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
        const result = await window.QuickNotesPro.verifyCryptoPayment(txHash);
        
        if (result.success) {
          verifyBtn.textContent = '✓ Verified!';
          verifyBtn.classList.add('success');
          if (statusEl) {
            statusEl.textContent = '✨ Pro unlocked! Thank you!';
            statusEl.className = 'crypto-note success';
          }
          isPro = true;
          document.body.classList.add('is-pro');
          showToast('✨ Pro unlocked!');
          setTimeout(closeProModal, 2000);
        } else {
          verifyBtn.textContent = 'Verify';
          verifyBtn.disabled = false;
          if (statusEl) {
            statusEl.textContent = result.error || 'Verification failed';
            statusEl.className = 'crypto-note error';
          }
        }
      } catch (e) {
        verifyBtn.textContent = 'Verify';
        verifyBtn.disabled = false;
        if (statusEl) {
          statusEl.textContent = 'Error verifying transaction';
          statusEl.className = 'crypto-note error';
        }
      }
    });
  }
}

function openProModal() {
  const proModal = document.getElementById('proModal');
  if (proModal) proModal.style.display = 'flex';
}

function closeProModal() {
  const proModal = document.getElementById('proModal');
  if (proModal) proModal.style.display = 'none';
}

function handleCardPayment() {
  if (window.QuickNotesPro) {
    window.QuickNotesPro.openPaymentPage();
  } else {
    window.open('https://extensionpay.com', '_blank');
  }
}

// Initialize Pro features on load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initProFeatures, 100);
});












