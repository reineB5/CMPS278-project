

const OFFLINE_DB_NAME = 'offline-files-db';
const OFFLINE_STORE_NAME = 'files';

self.addEventListener('install', (event) => {
  console.log('[SW] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(self.clients.claim());
});

// Helper: open IndexedDB in the SW
function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        const store = db.createObjectStore(OFFLINE_STORE_NAME, { keyPath: 'id' });
        store.createIndex('id', 'id', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getOfflineFile(id) {
  return openOfflineDb().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE_NAME, 'readonly');
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

// Intercept special offline URLs: /offline/files/<id>
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/offline/files/')) {
    const id = url.pathname.split('/').pop();

    event.respondWith(
      (async () => {
        try {
          const record = await getOfflineFile(id);
          if (!record || !record.blob) {
            return new Response('Offline copy not found', { status: 404 });
          }

          const headers = new Headers({
            'Content-Type': record.mimeType || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${record.name || 'file'}"`,
          });

          return new Response(record.blob, { headers });
        } catch (error) {
          console.error('[SW] Failed to serve offline file', error);
          return new Response('Error serving offline file', { status: 500 });
        }
      })()
    );
  }
});
