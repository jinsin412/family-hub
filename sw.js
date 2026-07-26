/* 결율 Diary(달콩톡) iPhone PWA 안정화 서비스워커
 * - 오래된 캐시 제거
 * - 네트워크 우선으로 최신 HTML 제공
 * - 기존 index.html의 절대 서비스워커 경로와 인증 초기화 무한대기 코드를 런타임에서 보정
 */
const HOTFIX_VERSION = '2026-07-26-iphone-2';

const OLD_AUTH_BOOTSTRAP = `onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    await initUserProfile(user);
    showApp();
    await loadFamilyData();
  } else {
    currentUser = null;
    familyId = null;
    hideApp();
  }
});`;

const SAFE_AUTH_BOOTSTRAP = `const __withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms))
]);

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser = null;
    familyId = null;
    hideApp();
    return;
  }

  currentUser = user;
  // Firestore 응답을 기다리느라 로그인 화면이 계속 남지 않도록 앱 화면을 먼저 표시합니다.
  showApp();

  try {
    await __withTimeout(initUserProfile(user), 12000, '사용자 정보 불러오기 시간 초과');
    if (familyId) {
      __withTimeout(loadFamilyData(), 15000, '가족 데이터 불러오기 시간 초과')
        .catch(err => {
          console.error('[Family data bootstrap]', err);
          showToast('가족 데이터 연결이 지연되고 있습니다. 잠시 후 다시 열어 주세요.');
        });
    }
  } catch (err) {
    console.error('[Auth bootstrap]', err);
    familyId = null;
    showToast('로그인은 확인됐지만 데이터 연결이 지연되고 있습니다. 네트워크를 확인해 주세요.');
  }
});`;

function patchAppHtml(html) {
  let patched = html;

  // Firebase Hosting 루트와 GitHub Pages 하위 경로 모두에서 동작하도록 상대경로로 보정합니다.
  patched = patched.split("navigator.serviceWorker.register('/sw.js', { scope: '/' })")
    .join("navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, { scope: './' })");

  // Firestore 한 번의 지연이 전체 화면을 무한 로딩 상태로 만들지 않도록 보정합니다.
  if (patched.includes(OLD_AUTH_BOOTSTRAP)) {
    patched = patched.replace(OLD_AUTH_BOOTSTRAP, SAFE_AUTH_BOOTSTRAP);
  }

  // iOS Safari가 오래된 index.html을 재사용하지 않도록 명시합니다.
  if (!patched.includes('data-dalkong-hotfix')) {
    patched = patched.replace(
      '</head>',
      `<meta data-dalkong-hotfix="${HOTFIX_VERSION}" http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/>\n<meta http-equiv="Pragma" content="no-cache"/>\n<meta http-equiv="Expires" content="0"/>\n</head>`
    );
  }

  return patched;
}

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.clients.claim();

    // 새 서비스워커가 설치되면 열려 있는 앱을 한 번만 자동 새로고침합니다.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      try {
        const url = new URL(client.url);
        if (url.searchParams.get('_dalkong_sw') !== HOTFIX_VERSION) {
          url.searchParams.set('_dalkong_sw', HOTFIX_VERSION);
          await client.navigate(url.href);
        }
      } catch (error) {
        console.warn('[SW] client refresh skipped', error);
      }
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('text/html')) return response;

        const html = await response.text();
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        headers.set('Pragma', 'no-cache');
        headers.set('Expires', '0');

        return new Response(patchAppHtml(html), {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } catch (error) {
        return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>연결 확인</title><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:32px;line-height:1.6"><h2>인터넷 연결을 확인해 주세요</h2><p>연결이 복구되면 달콩톡 아이콘을 다시 눌러 주세요.</p></body></html>`, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    })());
  }
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { notification: { body: event.data?.text() || '' } }; }
  const title = payload.notification?.title || payload.data?.title || '결율 Diary';
  const body = payload.notification?.body || payload.data?.message || '새 알림이 있습니다.';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: './icon.svg',
    badge: './icon.svg',
    data: payload.data || {}
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.length) {
      await windows[0].focus();
      return;
    }
    await self.clients.openWindow(self.registration.scope);
  })());
});
