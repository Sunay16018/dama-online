/* =========================================
   PERFORMANCE.JS - Performans Optimizasyonu
   Tüm performans iyileştirmeleri, lazy loading, throttling
   ========================================= */

(function() {
    'use strict';

    // =========================================
    // PERFORMANS AYARLARI
    // =========================================
    const config = {
        debug: false,
        fpsLimit: 60,
        frameInterval: 1000 / 60,
        lazyLoadThreshold: 50,
        debounceDelay: 150,
        throttleDelay: 100,
        cacheVersion: 'v1',
        preloadImages: true,
        enableWorkers: true,
        enableIdleCallback: true
    };

    // =========================================
    // PERFORMANS METRİKLERİ
    // =========================================
    const metrics = {
        fps: 0,
        frameCount: 0,
        lastTime: performance.now(),
        frames: [],
        memory: null,
        cpu: null,
        loadTime: null
    };

    // =========================================
    // RAF OPTİMİZASYONU
    // =========================================
    let rafId = null;
    let rafCallbacks = new Set();
    let isRafRunning = false;

    function startRAF() {
        if (isRafRunning) return;
        isRafRunning = true;
        
        function loop() {
            const now = performance.now();
            
            // FPS hesapla
            if (now - metrics.lastTime >= 1000) {
                metrics.fps = metrics.frameCount;
                metrics.frameCount = 0;
                metrics.lastTime = now;
                
                if (config.debug) {
                    console.log(`📊 FPS: ${metrics.fps}`);
                }
            }
            
            // Callback'leri çalıştır
            rafCallbacks.forEach(callback => {
                try {
                    callback(now);
                } catch (e) {
                    console.error('RAF callback hatası:', e);
                }
            });
            
            metrics.frameCount++;
            rafId = requestAnimationFrame(loop);
        }
        
        rafId = requestAnimationFrame(loop);
    }

    function stopRAF() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
            isRafRunning = false;
        }
    }

    function addRAFCallback(callback) {
        rafCallbacks.add(callback);
        if (!isRafRunning) {
            startRAF();
        }
    }

    function removeRAFCallback(callback) {
        rafCallbacks.delete(callback);
        if (rafCallbacks.size === 0) {
            stopRAF();
        }
    }

    // =========================================
    // INTERSECTION OBSERVER (LAZY LOADING)
    // =========================================
    const lazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const element = entry.target;
                
                // Lazy load images
                if (element.tagName === 'IMG' && element.dataset.src) {
                    element.src = element.dataset.src;
                    element.removeAttribute('data-src');
                }
                
                // Lazy load backgrounds
                if (element.dataset.bg) {
                    element.style.backgroundImage = `url(${element.dataset.bg})`;
                    element.removeAttribute('data-bg');
                }
                
                // Add visible class
                element.classList.add('visible');
                
                // Stop observing
                lazyObserver.unobserve(element);
            } else {
                entry.target.classList.remove('visible');
            }
        });
    }, {
        rootMargin: `${config.lazyLoadThreshold}px`,
        threshold: 0.01
    });

    // =========================================
    // DEBOUNCE FONKSİYONU
    // =========================================
    function debounce(func, wait = config.debounceDelay) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // =========================================
    // THROTTLE FONKSİYONU
    // =========================================
    function throttle(func, limit = config.throttleDelay) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // =========================================
    // MEMORY OPTIMIZATION
    // =========================================
    function checkMemory() {
        if (performance.memory) {
            metrics.memory = {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            };
            
            // Bellek limitine yaklaşıldı mı?
            const usagePercent = (metrics.memory.used / metrics.memory.limit) * 100;
            
            if (usagePercent > 80) {
                console.warn(`⚠️ Bellek kullanımı yüksek: %${usagePercent.toFixed(1)}`);
                clearMemory();
            }
        }
    }

    function clearMemory() {
        // Gereksiz referansları temizle
        if (window.gc) {
            window.gc();
        }
        
        // Canvas'ları temizle
        document.querySelectorAll('canvas').forEach(canvas => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
        
        // Gereksiz DOM elementlerini temizle
        document.querySelectorAll('.temp-element').forEach(el => el.remove());
        
        if (config.debug) {
            console.log('🧹 Bellek temizlendi');
        }
    }

    // =========================================
    // CSS CONTAINMENT
    // =========================================
    function applyCSSContainment() {
        const style = document.createElement('style');
        style.textContent = `
            .board-wrapper {
                contain: content;
            }
            .chat-sidebar {
                contain: strict;
            }
            .piece {
                contain: layout paint;
            }
            .page-hidden .piece,
            .page-hidden .move-hint,
            .page-hidden .confetti {
                animation: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    // =========================================
    // WEB WORKER (Ağır işlemler için)
    // =========================================
    let worker = null;
    
    function initWorker() {
        if (!window.Worker || !config.enableWorkers) return;
        
        try {
            const workerCode = `
                self.addEventListener('message', (e) => {
                    const { type, data } = e.data;
                    
                    if (type === 'calculateMoves') {
                        // Ağır hesaplamalar burada
                        const result = calculateMoves(data);
                        self.postMessage({ type: 'movesCalculated', result });
                    }
                    
                    if (type === 'ping') {
                        self.postMessage({ type: 'pong', time: Date.now() });
                    }
                });
                
                function calculateMoves(data) {
                    // Simulate heavy calculation
                    let result = [];
                    for (let i = 0; i < 1000000; i++) {
                        result.push(i * Math.random());
                    }
                    return result;
                }
            `;
            
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            worker = new Worker(URL.createObjectURL(blob));
            
            worker.onmessage = (e) => {
                if (e.data.type === 'pong') {
                    const latency = Date.now() - e.data.time;
                    if (config.debug) {
                        console.log(`📡 Worker latency: ${latency}ms`);
                    }
                }
            };
            
            // Worker sağlık kontrolü
            setInterval(() => {
                if (worker) {
                    worker.postMessage({ type: 'ping', time: Date.now() });
                }
            }, 30000);
            
        } catch (e) {
            console.warn('Worker başlatılamadı:', e);
        }
    }

    // =========================================
    // IDLE CALLBACK (Boş zaman işlemleri)
    // =========================================
    function runWhenIdle(tasks) {
        if (!window.requestIdleCallback || !config.enableIdleCallback) {
            // Fallback: setTimeout
            setTimeout(tasks, 1000);
            return;
        }
        
        requestIdleCallback((deadline) => {
            while (deadline.timeRemaining() > 0 && tasks.length > 0) {
                const task = tasks.shift();
                if (task) task();
            }
            
            if (tasks.length > 0) {
                runWhenIdle(tasks);
            }
        }, { timeout: 2000 });
    }

    // =========================================
    // PRELOAD (Ön yükleme)
    // =========================================
    function preloadAssets() {
        const assets = [
            '/images/icon-192x192.png',
            '/images/icon-512x512.png',
            '/css/main.css',
            '/css/board.css',
            '/css/chat.css',
            '/css/animations.css'
        ];
        
        assets.forEach(asset => {
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = asset;
            document.head.appendChild(link);
        });
    }

    // =========================================
    // PERFORMANCE MONITORING
    // =========================================
    function startMonitoring() {
        // Her 5 saniyede bir bellek kontrolü
        setInterval(checkMemory, 5000);
        
        // Sayfa yüklenme süresini ölç
        if (window.performance) {
            const perfData = performance.timing;
            metrics.loadTime = perfData.loadEventEnd - perfData.navigationStart;
            
            if (config.debug) {
                console.log(`📈 Sayfa yüklenme süresi: ${metrics.loadTime}ms`);
            }
        }
        
        // RAF ile FPS takibi
        addRAFCallback(() => {});
    }

    // =========================================
    // INITIALIZATION
    // =========================================
    function init() {
        console.log('⚡ Performans modülü başlatılıyor...');
        
        // CSS containment ekle
        applyCSSContainment();
        
        // Intersection observer başlat
        document.querySelectorAll('[data-src], [data-bg]').forEach(el => {
            lazyObserver.observe(el);
        });
        
        // Web worker başlat
        initWorker();
        
        // Asset'leri ön yükle
        if (config.preloadImages) {
            preloadAssets();
        }
        
        // Performans izlemeyi başlat
        startMonitoring();
        
        // Visibility change optimizasyonu
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopRAF();
            } else {
                startRAF();
            }
        });
        
        // Boş zaman işlemleri
        runWhenIdle([
            () => console.log('⚡ Boş zaman işlemi 1'),
            () => console.log('⚡ Boş zaman işlemi 2'),
            () => console.log('⚡ Boş zaman işlemi 3')
        ]);
        
        console.log('✅ Performans modülü hazır');
    }

    // DOM yüklendiğinde başlat
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // =========================================
    // DIŞA AKTARILAN FONKSİYONLAR
    // =========================================
    window.performanceUtils = {
        debounce,
        throttle,
        addRAFCallback,
        removeRAFCallback,
        clearMemory,
        checkMemory,
        metrics
    };
})();