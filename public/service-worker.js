/* =========================================
   SERVICE-WORKER.JS - PWA Servis Çalışanı
   Offline destek, cache yönetimi, push bildirimler
   ========================================= */

const CACHE_NAME = 'dama-cache-v2';
const OFFLINE_URL = '/offline.html';

// Cache'lenecek dosyalar
const STATIC_ASSETS = [
    '/',
    '/offline.html',
    '/manifest.json',
    '/css/main.css',
    '/css/board.css',
    '/css/chat.css',
    '/css/animations.css',
    '/js/main.js',
    '/js/game.js',
    '/js/board.js',
    '/js/chat.js',
    '/js/performance.js',
    '/images/icon-72x72.png',
    '/images/icon-96x96.png',
    '/images/icon-128x128.png',
    '/images/icon-144x144.png',
    '/images/icon-152x152.png',
    '/images/icon-192x192.png',
    '/images/icon-384x384.png',
    '/images/icon-512x512.png',
    '/images/maskable-icon-192x192.png',
    '/images/maskable-icon-512x512.png',
    '/images/favicon.ico',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// =========================================
// KURULUM (INSTALL)
// =========================================
self.addEventListener('install', (event) => {
    console.log('📦 Service Worker kuruluyor...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('✅ Cache açıldı, dosyalar ekleniyor...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('✅ Tüm statik dosyalar cache'lendi');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ Cache hatası:', error);
            })
    );
});

// =========================================
// AKTİVASYON (ACTIVATE)
// =========================================
self.addEventListener('activate', (event) => {
    console.log('⚡ Service Worker aktifleştiriliyor...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Eski cache siliniyor:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Service Worker aktif');
            return self.clients.claim();
        })
    );
});

// =========================================
// FETCH (Ağ İstekleri)
// =========================================
self.addEventListener('fetch', (event) => {
    // Sadece GET isteklerini cache'le
    if (event.request.method !== 'GET') return;
    
    // Socket.io isteklerini cache'leme
    if (event.request.url.includes('/socket.io/')) {
        return;
    }
    
    // API isteklerini cache'leme
    if (event.request.url.includes('/api/')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache'de varsa döndür
                if (response) {
                    return response;
                }
                
                // Cache'de yoksa ağdan al
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Sadece geçerli yanıtları cache'le
                        if (networkResponse && networkResponse.status === 200) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        return networkResponse;
                    })
                    .catch((error) => {
                        console.log('❌ Ağ hatası, offline sayfası gösteriliyor:', error);
                        
                        // HTML sayfası ise offline sayfasını göster
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match(OFFLINE_URL);
                        }
                    });
            })
    );
});

// =========================================
// PUSH BİLDİRİMLERİ
// =========================================
self.addEventListener('push', (event) => {
    console.log('📨 Push bildirimi alındı:', event);
    
    let data = {
        title: 'Dama Oyunu',
        body: 'Yeni bir bildirim var!',
        icon: '/images/icon-192x192.png',
        badge: '/images/icon-72x72.png',
        vibrate: [200, 100, 200],
        data: {
            url: '/'
        }
    };
    
    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        vibrate: data.vibrate,
        data: data.data,
        actions: [
            {
                action: 'open',
                title: 'Oyuna Git'
            },
            {
                action: 'close',
                title: 'Kapat'
            }
        ],
        tag: 'dama-notification',
        renotify: true,
        requireInteraction: false,
        silent: false
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// =========================================
// BİLDİRİM TIKLAMA
// =========================================
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Bildirim tıklandı:', event);
    
    event.notification.close();
    
    if (event.action === 'close') {
        return;
    }
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Açık pencere varsa onu kullan
            for (const client of clientList) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // Yoksa yeni pencere aç
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// =========================================
// SENKRONİZASYON (Background Sync)
// =========================================
self.addEventListener('sync', (event) => {
    console.log('🔄 Senkronizasyon:', event.tag);
    
    if (event.tag === 'sync-messages') {
        event.waitUntil(syncMessages());
    }
    
    if (event.tag === 'sync-games') {
        event.waitUntil(syncGames());
    }
});

async function syncMessages() {
    console.log('📨 Bekleyen mesajlar senkronize ediliyor...');
    // TODO: IndexedDB'den mesajları al ve gönder
}

async function syncGames() {
    console.log('🎮 Bekleyen oyunlar senkronize ediliyor...');
    // TODO: Oyun durumunu senkronize et
}

// =========================================
// PERİYODİK SENKRONİZASYON
// =========================================
self.addEventListener('periodicsync', (event) => {
    console.log('⏰ Periyodik senkronizasyon:', event.tag);
    
    if (event.tag === 'update-game') {
        event.waitUntil(updateGame());
    }
});

async function updateGame() {
    console.log('🔄 Oyun güncelleniyor...');
    // TODO: Oyun verilerini güncelle
}

// =========================================
// OFFLINE SAYFASI İÇİN ÖZEL İŞLEMLER
// =========================================
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    
    if (event.data === 'clearCache') {
        caches.delete(CACHE_NAME);
    }
});

// =========================================
// PERİYODİK CACHE TEMİZLİĞİ
// =========================================
setInterval(() => {
    caches.open(CACHE_NAME).then((cache) => {
        cache.keys().then((keys) => {
            console.log(`📊 Cache'de ${keys.length} dosya var`);
        });
    });
}, 3600000); // Her saat başı