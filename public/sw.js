/* Service Worker for Creativity PWA */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Creativity', body: 'New notification!' };
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (err) {
    console.warn('Failed to parse push data, using default:', err);
    if (event.data) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: '/pwa-icon.png',
    badge: '/pwa-icon.png',
    data: data.url || '/',
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'View' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Creativity', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data)
  );
});
