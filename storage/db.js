// Quick Notes - IndexedDB Storage
// Direct IndexedDB for maximum speed

const DB_NAME = 'QuickNotesDB';
const DB_VERSION = 2;
const STORE_NAME = 'notes';

let db = null;

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
      }
    };
  });
}

// Create note
export async function createNote(content = '', title = 'Untitled') {
  await initDB();
  
  const note = {
    id: generateId(),
    title,
    content,
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    // Context fields
    contextUrl: null,
    contextTitle: null,
    contextFavicon: null
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
  
  return new Promise(async (resolve, reject) => {
    const note = await getNote(id);
    if (!note) {
      console.warn('Note not found:', id);
      return resolve(null); // Don't throw, just return null
    }
    
    const updatedNote = {
      ...note,
      ...updates,
      updatedAt: Date.now()
    };
    
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(updatedNote);
    
    request.onsuccess = () => resolve(updatedNote);
    request.onerror = () => reject(request.error);
  });
}

// Delete note
export async function deleteNote(id) {
  await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
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

// Import notes
export async function importNotes(jsonString) {
  const imported = JSON.parse(jsonString);
  let count = 0;
  
  for (const note of imported) {
    await createNote(note.content || '', note.title || 'Imported');
    count++;
  }
  
  return count;
}

