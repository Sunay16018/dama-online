/* =========================================
   ICON-LOADER.JS - Tüm İkonları Otomatik Yükle
   Sende olan 8 PNG'yi akıllıca kullanır
   ========================================= */

(function() {
    'use strict';

    // =========================================
    // MEVCUT PNG DOSYALARIN (8 TANE)
    // =========================================
    const icons = {
        // Taşlar ve tahta
        board: '/images/dama-tahtasi.png',
        redNormal: '/images/kirmizi-normal.png',
        redKing: '/images/kirmizi-king.png',
        blueNormal: '/images/mavi-normal.png',
        blueKing: '/images/mavi-king.png',
        
        // İkonlar
        icon144: '/images/icon-144x144.png',
        icon192: '/images/icon-192x192.png',
        icon512: '/images/icon-512x512.png'
    };

    // =========================================
    // TÜM BOYUTLARI OTOMATİK OLUŞTUR
    // =========================================
    function generateAllIcons() {
        const head = document.querySelector('head');
        
        // 1. ANA FAVICON (192x192'den üret)
        addFavicon(icons.icon192);
        
        // 2. TÜM BOYUTLAR İÇİN LİNKLER (192'den türet)
        const sizes = [16, 32, 48, 57, 60, 64, 70, 72, 76, 96, 114, 120, 144, 150, 152, 180, 192];
        
        sizes.forEach(size => {
            // Apple Touch Icon
            addLink('apple-touch-icon', size, icons.icon192);
            
            // Standart Favicon
            if ([16, 32, 96].includes(size)) {
                addLink('icon', size, icons.icon192);
            }
        });
        
        // 3. MANIFEST DOSYASINI GÜNCELLE
        updateManifest();
        
        // 4. META TAGLERİ EKLE
        addMetaTags();
        
        console.log('✅ Tüm ikonlar otomatik oluşturuldu!');
    }

    // =========================================
    // FAVICON EKLE
    // =========================================
    function addFavicon(href) {
        let link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = href;
        document.getElementsByTagName('head')[0].appendChild(link);
    }

    // =========================================
    // LİNK EKLE
    // =========================================
    function addLink(rel, size, href) {
        const link = document.createElement('link');
        link.rel = rel;
        link.sizes = `${size}x${size}`;
        link.href = href; // Aynı resmi kullan, tarayıcı ölçekler
        document.head.appendChild(link);
    }

    // =========================================
    // META TAGLERİ EKLE
    // =========================================
    function addMetaTags() {
        // Windows için
        let msTile = document.querySelector("meta[name='msapplication-TileImage']") || document.createElement('meta');
        msTile.name = 'msapplication-TileImage';
        msTile.content = icons.icon144;
        document.head.appendChild(msTile);
        
        let msColor = document.querySelector("meta[name='msapplication-TileColor']") || document.createElement('meta');
        msColor.name = 'msapplication-TileColor';
        msColor.content = '#1a472a';
        document.head.appendChild(msColor);
        
        // Tema rengi
        let themeColor = document.querySelector("meta[name='theme-color']") || document.createElement('meta');
        themeColor.name = 'theme-color';
        themeColor.content = '#1a472a';
        document.head.appendChild(themeColor);
        
        // iOS için
        let appleStatus = document.querySelector("meta[name='apple-mobile-web-app-status-bar-style']") || document.createElement('meta');
        appleStatus.name = 'apple-mobile-web-app-status-bar-style';
        appleStatus.content = 'black-translucent';
        document.head.appendChild(appleStatus);
        
        let appleTitle = document.querySelector("meta[name='apple-mobile-web-app-title']") || document.createElement('meta');
        appleTitle.name = 'apple-mobile-web-app-title';
        appleTitle.content = 'Online Dama';
        document.head.appendChild(appleTitle);
    }

    // =========================================
    // MANIFEST DOSYASINI GÜNCELLE
    // =========================================
    function updateManifest() {
        // Mevcut manifest varsa oku, yoksa oluştur
        let manifest = {
            name: "1vs1 Online Dama",
            short_name: "Dama Pro",
            description: "Gerçek zamanlı online dama oyunu",
            start_url: "/",
            display: "standalone",
            background_color: "#1a472a",
            theme_color: "#ffd966",
            orientation: "portrait",
            scope: "/",
            lang: "tr-TR",
            icons: [
                {
                    src: icons.icon144,
                    sizes: "144x144",
                    type: "image/png",
                    purpose: "any"
                },
                {
                    src: icons.icon192,
                    sizes: "192x192",
                    type: "image/png",
                    purpose: "any maskable"
                },
                {
                    src: icons.icon512,
                    sizes: "512x512",
                    type: "image/png",
                    purpose: "any maskable"
                }
            ]
        };
        
        // Manifest'i sayfaya ekle
        let manifestLink = document.querySelector("link[rel='manifest']") || document.createElement('link');
        manifestLink.rel = 'manifest';
        
        // Blob olarak oluştur
        const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
        manifestLink.href = URL.createObjectURL(manifestBlob);
        
        document.head.appendChild(manifestLink);
    }

    // =========================================
    // CSS DEĞİŞKENLERİNİ EKLE (Taşlar için)
    // =========================================
    function addCSSVariables() {
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --board-image: url('${icons.board}');
                --red-normal: url('${icons.redNormal}');
                --red-king: url('${icons.redKing}');
                --blue-normal: url('${icons.blueNormal}');
                --blue-king: url('${icons.blueKing}');
            }
            
            .board {
                background-image: var(--board-image);
            }
            
            .piece.team-A {
                background-image: var(--red-normal);
            }
            
            .piece.team-A.king {
                background-image: var(--red-king);
            }
            
            .piece.team-B {
                background-image: var(--blue-normal);
            }
            
            .piece.team-B.king {
                background-image: var(--blue-king);
            }
        `;
        document.head.appendChild(style);
    }

    // =========================================
    // PRELOAD (Ön Yükleme)
    // =========================================
    function preloadIcons() {
        const iconValues = Object.values(icons);
        iconValues.forEach(src => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'image';
            link.href = src;
            document.head.appendChild(link);
        });
    }

    // =========================================
    // BAŞLAT
    // =========================================
    function init() {
        console.log('🔄 İkon yükleyici başlatılıyor...');
        console.log('📸 Mevcut PNGler:', Object.keys(icons).length);
        
        // CSS değişkenlerini ekle
        addCSSVariables();
        
        // İkonları ön yükle
        preloadIcons();
        
        // Tüm ikon linklerini oluştur
        generateAllIcons();
        
        // 404 kontrolü
        checkIcons();
    }

    // =========================================
    // İKON KONTROLÜ (404 varsa uyar)
    // =========================================
    function checkIcons() {
        Object.values(icons).forEach(src => {
            const img = new Image();
            img.onload = () => console.log(`✅ ${src} yüklendi`);
            img.onerror = () => console.warn(`⚠️ ${src} bulunamadı!`);
            img.src = src;
        });
    }

    // Sayfa yüklendiğinde başlat
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();