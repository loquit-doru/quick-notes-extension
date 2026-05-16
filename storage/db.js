// Quick Notes - IndexedDB Storage
// Direct IndexedDB for maximum speed

const DB_NAME = 'QuickNotesDB';
const DB_VERSION = 4;  // Bumped for folders support
const STORE_NAME = 'notes';
const TRASH_STORE = 'trash';
const FOLDERS_STORE = 'folders';

let db = null;

// Trash retention: 24 hours for FREE, 7 days for PRO
const TRASH_RETENTION_FREE = 1;  // 1 day = 24H
const TRASH_RETENTION_PRO = 7;   // 7 days

// Default folders
const DEFAULT_FOLDERS = [
  { id: 'all', name: '📋 All Notes', isSystem: true },
  { id: 'personal', name: '👤 Personal', isSystem: false },
  { id: 'work', name: '💼 Work', isSystem: false }
];

// Get retention days based on pro status
export function getTrashRetentionDays(isPro) {
  return isPro ? TRASH_RETENTION_PRO : TRASH_RETENTION_FREE;
}

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Initialize database
export async function initDB() {
  if (db) return db;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('pinned', 'pinned', { unique: false });
        store.createIndex('folderId', 'folderId', { unique: false });
      } else {
        // Add folder index to existing store
        const tx = event.target.transaction;
        const store = tx.objectStore(STORE_NAME);
        if (!store.indexNames.contains('folderId')) {
          store.createIndex('folderId', 'folderId', { unique: false });
        }
      }
      
      // Add trash store for deleted notes recovery
      if (!database.objectStoreNames.contains(TRASH_STORE)) {
        const trashStore = database.createObjectStore(TRASH_STORE, { keyPath: 'id' });
        trashStore.createIndex('deletedAt', 'deletedAt', { unique: false });
      }
      
      // Add folders store
      if (!database.objectStoreNames.contains(FOLDERS_STORE)) {
        const foldersStore = database.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
        // Add default folders
        DEFAULT_FOLDERS.forEach(folder => {
          foldersStore.add({ ...folder, createdAt: Date.now() });
        });
      }
    };
  });
}

// Create note
export async function createNote(content = '', title = 'Untitled', folderId = null) {
  await initDB();
  
  const note = {
    id: generateId(),
    title,
    content,
    pinned: false,
    folderId: folderId,  // Folder support
    createdAt: Date.now(),
    updatedAt: Date.now(),
    // Context fields
    contextUrl: null,
    contextTitle: null,
    contextFavicon: null,
    // Reminder field
    reminder: null  // { time: timestamp, notified: false }
  };
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(note);
    
    request.onsuccess = () => resolve(note);
    request.onerror = () => reject(request.error);
  });
}

// Get all notes (sorted: pinned first, then by date)
export async function getAllNotes() {
  await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const notes = request.result;
      // Sort: pinned first, then by updatedAt descending
      notes.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
      resolve(notes);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get single note
export async function getNote(id) {
  await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Update note
export async function updateNote(id, updates) {
  await initDB();

  const note = await getNote(id);
  if (!note) {
    console.warn('Note not found:', id);
    return null;
  }

  const updatedNote = {
    ...note,
    ...updates,
    updatedAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(updatedNote);

    request.onsuccess = () => resolve(updatedNote);
    request.onerror = () => reject(request.error);
  });
}

// Delete note (move to trash instead of permanent delete)
export async function deleteNote(id) {
  await initDB();
  
  // Get note first to save to trash
  const note = await getNote(id);
  if (note) {
    // Add to trash with deletion timestamp
    const trashedNote = {
      ...note,
      deletedAt: Date.now()
    };
    
    const trashTx = db.transaction(TRASH_STORE, 'readwrite');
    const trashStore = trashTx.objectStore(TRASH_STORE);
    await new Promise((resolve, reject) => {
      const req = trashStore.put(trashedNote);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  
  // Now delete from main store
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Permanently delete note (skip trash)
export async function permanentDeleteNote(id) {
  await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Get all trashed notes
export async function getTrash(isPro = false) {
  await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRASH_STORE, 'readonly');
    const store = tx.objectStore(TRASH_STORE);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const trashedNotes = request.result;
      const now = Date.now();
      const retentionDays = isPro ? TRASH_RETENTION_PRO : TRASH_RETENTION_FREE;
      const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
      
      // Filter out expired notes and sort by deletedAt
      const validNotes = trashedNotes
        .filter(note => (now - note.deletedAt) < retentionMs)
        .sort((a, b) => b.deletedAt - a.deletedAt);
      
      resolve(validNotes);
    };
    request.onerror = () => reject(request.error);
  });
}

// Restore note from trash
export async function restoreFromTrash(id) {
  await initDB();
  
  // Get from trash
  const trashTx = db.transaction(TRASH_STORE, 'readwrite');
  const trashStore = trashTx.objectStore(TRASH_STORE);
  
  const note = await new Promise((resolve, reject) => {
    const req = trashStore.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  
  if (!note) return null;
  
  // Remove deletedAt and restore to main store
  delete note.deletedAt;
  note.updatedAt = Date.now();
  
  const mainTx = db.transaction(STORE_NAME, 'readwrite');
  const mainStore = mainTx.objectStore(STORE_NAME);
  
  await new Promise((resolve, reject) => {
    const req = mainStore.put(note);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  
  // Remove from trash
  const deleteTx = db.transaction(TRASH_STORE, 'readwrite');
  const deleteStore = deleteTx.objectStore(TRASH_STORE);
  
  await new Promise((resolve, reject) => {
    const req = deleteStore.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  
  return note;
}

// Permanently delete from trash
export async function deleteFromTrash(id) {
  await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRASH_STORE, 'readwrite');
    const store = tx.objectStore(TRASH_STORE);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Empty trash
export async function emptyTrash() {
  await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRASH_STORE, 'readwrite');
    const store = tx.objectStore(TRASH_STORE);
    const request = store.clear();
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Clean up expired trash (call periodically)
export async function cleanExpiredTrash(isPro = false) {
  await initDB();
  
  const now = Date.now();
  const retentionDays = isPro ? TRASH_RETENTION_PRO : TRASH_RETENTION_FREE;
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  
  const tx = db.transaction(TRASH_STORE, 'readwrite');
  const store = tx.objectStore(TRASH_STORE);
  
  const request = store.getAll();
  request.onsuccess = () => {
    const allTrashed = request.result;
    for (const note of allTrashed) {
      if ((now - note.deletedAt) >= retentionMs) {
        store.delete(note.id);
      }
    }
  };
}

// Toggle pin
export async function togglePin(id) {
  const note = await getNote(id);
  if (!note) return null;
  
  return updateNote(id, { pinned: !note.pinned });
}

// Search notes
export async function searchNotes(query) {
  const notes = await getAllNotes();
  const q = query.toLowerCase();
  
  return notes.filter(note => 
    note.title?.toLowerCase().includes(q) ||
    note.content?.toLowerCase().includes(q) ||
    note.contextUrl?.toLowerCase().includes(q) ||
    note.contextTitle?.toLowerCase().includes(q)
  );
}

// Export notes
export async function exportNotes(format = 'json') {
  const notes = await getAllNotes();
  
  if (format === 'json') {
    return JSON.stringify(notes, null, 2);
  }
  
  if (format === 'md') {
    return notes.map(note => {
      let md = `# ${note.title}\n\n`;
      if (note.contextUrl) {
        md += `> Source: [${note.contextTitle || note.contextUrl}](${note.contextUrl})\n\n`;
      }
      // Convert HTML to plain text
      const div = document.createElement('div');
      div.innerHTML = note.content;
      md += div.textContent || '';
      md += `\n\n---\n*Created: ${new Date(note.createdAt).toLocaleString()}*\n`;
      return md;
    }).join('\n\n');
  }
  
  if (format === 'txt') {
    return notes.map(note => {
      let txt = `=== ${note.title} ===\n`;
      if (note.contextUrl) {
        txt += `Source: ${note.contextUrl}\n`;
      }
      const div = document.createElement('div');
      div.innerHTML = note.content;
      txt += (div.textContent || '') + '\n';
      return txt;
    }).join('\n\n');
  }
  
  return JSON.stringify(notes);
}

// Import notes (preserves folderId, reminder, context when present)
export async function importNotes(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON');
  }

  const imported = Array.isArray(parsed)
    ? parsed
    : (parsed && Array.isArray(parsed.notes) ? parsed.notes : null);

  if (!imported) {
    throw new Error('Invalid format: expected a JSON array of notes');
  }

  await initDB();
  let count = 0;

  for (const item of imported) {
    if (!item || typeof item !== 'object') continue;

    const note = {
      id: typeof item.id === 'string' ? item.id : generateId(),
      title: typeof item.title === 'string' ? item.title : 'Imported',
      content: typeof item.content === 'string' ? item.content : '',
      pinned: Boolean(item.pinned),
      folderId: item.folderId ?? null,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      contextUrl: item.contextUrl ?? null,
      contextTitle: item.contextTitle ?? null,
      contextFavicon: item.contextFavicon ?? null,
      reminder: item.reminder ?? null
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(note);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    count++;
  }

  return count;
}

// ============================================
// 📁 FOLDERS MANAGEMENT
// ============================================

// Get all folders
export async function getFolders() {
  await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readonly');
    const store = tx.objectStore(FOLDERS_STORE);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const folders = request.result;
      // Sort: system folders first, then by name
      folders.sort((a, b) => {
        if (a.isSystem && !b.isSystem) return -1;
        if (!a.isSystem && b.isSystem) return 1;
        return a.name.localeCompare(b.name);
      });
      resolve(folders);
    };
    request.onerror = () => reject(request.error);
  });
}

// Put folder with explicit id (restore / import)
export async function putFolder(folder) {
  await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    const store = tx.objectStore(FOLDERS_STORE);
    const request = store.put(folder);
    request.onsuccess = () => resolve(folder);
    request.onerror = () => reject(request.error);
  });
}

// Create folder
export async function createFolder(name) {
  await initDB();
  
  const folder = {
    id: generateId(),
    name,
    isSystem: false,
    createdAt: Date.now()
  };
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    const store = tx.objectStore(FOLDERS_STORE);
    const request = store.add(folder);
    
    request.onsuccess = () => resolve(folder);
    request.onerror = () => reject(request.error);
  });
}

// Delete folder (moves notes to "All")
export async function deleteFolder(folderId) {
  await initDB();
  
  // First, move all notes from this folder to null (All Notes)
  const notes = await getAllNotes();
  for (const note of notes) {
    if (note.folderId === folderId) {
      await updateNote(note.id, { folderId: null });
    }
  }
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    const store = tx.objectStore(FOLDERS_STORE);
    const request = store.delete(folderId);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Rename folder
export async function renameFolder(folderId, newName) {
  await initDB();

  const folder = await new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readonly');
    const store = tx.objectStore(FOLDERS_STORE);
    const req = store.get(folderId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!folder || folder.isSystem) {
    throw new Error('Cannot rename system folder');
  }

  folder.name = newName;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    const store = tx.objectStore(FOLDERS_STORE);
    const req = store.put(folder);
    req.onsuccess = () => resolve(folder);
    req.onerror = () => reject(req.error);
  });
}

// Get notes by folder
export async function getNotesByFolder(folderId) {
  const allNotes = await getAllNotes();
  
  if (folderId === 'all' || !folderId) {
    return allNotes;
  }
  
  return allNotes.filter(note => note.folderId === folderId);
}