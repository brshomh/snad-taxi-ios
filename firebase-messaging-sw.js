// Service Worker لاستقبال الإشعارات في الخلفية
// Firebase Cloud Messaging Service Worker

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB-demo-key",
  authDomain: "snad-taxi.firebaseapp.com",
  projectId: "snad-taxi",
  storageBucket: "snad-taxi.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
});

const messaging = firebase.messaging();

// استقبال الإشعارات في الخلفية (حتى عند إغلاق التطبيق)
messaging.onBackgroundMessage(function(payload) {
  const { title, body, icon, badge, data } = payload.notification || {};
  const notificationTitle = title || 'سند تاكسي 🚗';
  const notificationOptions = {
    body: body || 'لديك رسالة جديدة',
    icon: icon || '/assets/passenger_logo.png',
    badge: badge || '/assets/passenger_logo.png',
    tag: data?.tag || 'snad-notification',
    data: data || {},
    actions: data?.actions ? JSON.parse(data.actions) : [],
    vibrate: [200, 100, 200],
    requireInteraction: true
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// الضغط على الإشعار يفتح التطبيق
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
