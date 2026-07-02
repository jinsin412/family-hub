/* 결율 Diary — FCM 백그라운드 푸시 서비스워커
 * 배포 위치: 사이트 루트 (index.html과 같은 폴더)
 * 파일명 변경 금지: firebase-messaging-sw.js
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD6LRCM-dCm0wCZvia1D0rYzNSTWpOJKRU",
  authDomain: "jscho-6d363.firebaseapp.com",
  projectId: "jscho-6d363",
  storageBucket: "jscho-6d363.firebasestorage.app",
  messagingSenderId: "221858858688",
  appId: "1:221858858688:web:1f0d1bc2af082d1e23cf25"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || '결율 Diary';
  const body  = payload.notification?.body  || payload.data?.message || '새 알림이 있습니다';
  self.registration.showNotification(title, {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: payload.data,
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
