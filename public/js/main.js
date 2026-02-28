/* =========================================
   MAIN.JS - Ana JavaScript Dosyası
   Tüm socket bağlantıları, global değişkenler ve ana işlevler
   ========================================= */

// =========================================
// GLOBAL DEĞİŞKENLER
// =========================================
const socket = io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ['websocket', 'polling']
});

// Oyun durumu
let currentRoom = null;
let myTeam = null;
let perspective = 'A';
let gameState = {
    board: [],
    turn: 'A',
    winner: null,
    capturedA: [],
    capturedB: [],
    players: [],
    moveHistory: []
};

// Kullanıcı bilgileri
let username = localStorage.getItem('dama_username');
if (!username) {
    username = `Oyuncu-${Math.floor(Math.random() * 10000) + 1}`;
    localStorage.setItem('dama_username', username);
}

// Performans optimizasyonu
let lastRender = 0;
let renderQueue = [];
let isRendering = false;

// =========================================
// DOM ELEMENTLERİ
// =========================================
const elements = {
    // Loading ve welcome
    pageLoading: document.getElementById('pageLoading'),
    welcomeMessage: document.getElementById('welcomeMessage'),
    
    // Kullanıcı
    usernameDisplay: document.getElementById('usernameDisplay'),
    editUsernameBtn: document.getElementById('editUsernameBtn'),
    userStatus: document.getElementById('userStatus'),
    userWins: document.getElementById('userWins'),
    userGames: document.getElementById('userGames'),
    
    // Modal
    editUsernameModal: document.getElementById('editUsernameModal'),
    newUsernameInput: document.getElementById('newUsernameInput'),
    saveUsernameBtn: document.getElementById('saveUsernameBtn'),
    cancelUsernameBtn: document.getElementById('cancelUsernameBtn'),
    modalClose: document.querySelector('.modal-close'),
    
    // Lobby
    lobbyControls: document.getElementById('lobbyControls'),
    roomCodeInput: document.getElementById('roomCodeInput'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    joinRoomBtn: document.getElementById('joinRoomBtn'),
    status: document.getElementById('status'),
    
    // Oyun alanı
    gameArea: document.getElementById('gameArea'),
    roomCode: document.querySelector('#roomCode span'),
    playerTeam: document.getElementById('playerTeam'),
    leaveRoomBtn: document.getElementById('leaveRoomBtn'),
    turnIndicator: document.getElementById('turnIndicator'),
    playersList: document.getElementById('players'),
    gameStatus: document.getElementById('gameStatus'),
    capturedPieces: document.getElementById('capturedPieces'),
    moveHistory: document.getElementById('moveHistory'),
    
    // Tahta
    board: document.getElementById('board'),
    
    // Overlay
    gameOverlay: document.getElementById('gameOverlay'),
    winnerText: document.getElementById('winnerText'),
    gameStats: document.getElementById('gameStats'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    backToLobbyBtn: document.getElementById('backToLobbyBtn'),
    
    // Sohbet
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    sendChatBtn: document.getElementById('sendChatBtn'),
    onlineCount: document.getElementById('onlineCount'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    
    // Footer
    buildTime: document.getElementById('buildTime'),
    
    // Offline notification
    offlineNotification: document.getElementById('offlineNotification')
};

// =========================================
// SOCKET BAĞLANTI OLAYLARI
// =========================================
socket.on('connect', () => {
    console.log('✅ Socket bağlantısı kuruldu:', socket.id);
    updateStatus('✅ Sunucuya bağlandı', 'success');
    socket.emit('setUsername', username);
    
    // Kayıtlı oda varsa yeniden katıl
    const savedRoom = sessionStorage.getItem('currentRoom');
    if (savedRoom) {
        currentRoom = savedRoom;
        elements.roomCodeInput.value = savedRoom;
        updateStatus(`🔄 Yeniden bağlanılıyor: ${savedRoom}`, 'info');
        setTimeout(() => {
            socket.emit('joinRoom', savedRoom);
        }, 1000);
    }
});

socket.on('connect_error', (error) => {
    console.error('❌ Bağlantı hatası:', error);
    updateStatus('❌ Sunucuya bağlanılamıyor', 'error');
});

socket.on('disconnect', (reason) => {
    console.log('❌ Socket bağlantısı koptu:', reason);
    updateStatus('❌ Bağlantı koptu, yeniden bağlanılıyor...', 'error');
});

socket.on('reconnect', (attemptNumber) => {
    console.log('🔄 Yeniden bağlanıldı:', attemptNumber);
    updateStatus('✅ Yeniden bağlanıldı', 'success');
    if (currentRoom) {
        socket.emit('joinRoom', currentRoom);
    }
});

socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('🔄 Yeniden bağlanma denemesi:', attemptNumber);
    updateStatus(`🔄 Yeniden bağlanma denemesi ${attemptNumber}/10...`, 'info');
});

socket.on('reconnect_error', (error) => {
    console.error('❌ Yeniden bağlanma hatası:', error);
    updateStatus('❌ Yeniden bağlanılamıyor', 'error');
});

socket.on('reconnect_failed', () => {
    console.error('❌ Yeniden bağlanma başarısız');
    updateStatus('❌ Sunucuya bağlanılamadı, sayfayı yenileyin', 'error');
});

// =========================================
// SOCKET OLAY DİNLEYİCİLERİ
// =========================================
socket.on('onlineCount', (data) => {
    if (elements.onlineCount) {
        const count = data.count || 0;
        elements.onlineCount.innerHTML = `<i class="fas fa-users"></i> ${count}`;
        
        // Tooltip olarak online kullanıcıları göster
        if (data.users && data.users.length > 0) {
            elements.onlineCount.title = `Online: ${data.users.join(', ')}`;
        }
    }
});

socket.on('userUpdate', (data) => {
    console.log('👤 Kullanıcı güncellemesi:', data);
    if (data.id === socket.id) return;
    
    // Sohbette kullanıcı adı değişikliği bildirimi
    addSystemMessage(`👤 ${data.oldName} ismini ${data.username} olarak değiştirdi`);
});

socket.on('roomCreated', (data) => {
    console.log('🎲 Oda oluşturuldu:', data);
    currentRoom = data.roomCode;
    sessionStorage.setItem('currentRoom', data.roomCode);
    elements.roomCodeInput.value = data.roomCode;
    updateStatus(`🎲 Oda oluşturuldu: ${data.roomCode} - Rakip bekleniyor...`, 'success');
});

socket.on('joined', (data) => {
    console.log('🚪 Odaya katılındı:', data);
    currentRoom = data.roomCode;
    sessionStorage.setItem('currentRoom', data.roomCode);
    updateStatus(`🚪 Odaya katıldınız: ${data.roomCode} - Rakip bekleniyor...`, 'success');
    
    if (data.players && data.players.length > 0) {
        elements.roomCode.textContent = data.roomCode;
    }
});

socket.on('playerLeft', (data) => {
    console.log('👋 Oyuncu ayrıldı:', data);
    updateStatus(`👋 ${data.username || 'Bir oyuncu'} ayrıldı`, 'warning');
    if (elements.gameStatus) {
        elements.gameStatus.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Rakip ayrıldı - Oyun bekliyor`;
    }
});

socket.on('error', (data) => {
    console.error('❌ Hata:', data);
    updateStatus(`❌ ${data.message || 'Bir hata oluştu'}`, 'error');
    
    // Oda bulunamadı hatasında session'ı temizle
    if (data.code === 'ROOM_NOT_FOUND' || data.message.includes('bulunamadı')) {
        sessionStorage.removeItem('currentRoom');
        currentRoom = null;
    }
});

// =========================================
// YARDIMCI FONKSİYONLAR
// =========================================

/**
 * Status mesajını günceller
 */
function updateStatus(message, type = 'info') {
    if (!elements.status) return;
    
    const icons = {
        info: 'fa-info-circle',
        success: 'fa-check-circle',
        error: 'fa-exclamation-triangle',
        warning: 'fa-exclamation-circle',
        loading: 'fa-spinner fa-pulse'
    };
    
    const icon = icons[type] || icons.info;
    elements.status.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    
    // Renk sınıflarını ekle
    elements.status.className = 'status-message glass-effect';
    elements.status.classList.add(`status-${type}`);
}

/**
 * Sistem mesajı ekler (sohbet için)
 */
function addSystemMessage(message) {
    if (!elements.chatMessages) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message system';
    msgDiv.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
    
    elements.chatMessages.appendChild(msgDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

/**
 * XSS koruması için HTML escape
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Performans için requestAnimationFrame ile render
 */
function queueRender(renderFunc) {
    renderQueue.push(renderFunc);
    
    if (!isRendering) {
        isRendering = true;
        requestAnimationFrame(() => {
            const now = performance.now();
            if (now - lastRender > 16) { // 60 FPS
                while (renderQueue.length > 0) {
                    const func = renderQueue.shift();
                    if (func) func();
                }
                lastRender = now;
            }
            isRendering = false;
        });
    }
}

// =========================================
// KULLANICI İŞLEMLERİ
// =========================================

// İsim güncelleme
elements.usernameDisplay.textContent = username;

elements.editUsernameBtn.addEventListener('click', () => {
    elements.newUsernameInput.value = username;
    elements.editUsernameModal.style.display = 'flex';
});

elements.saveUsernameBtn.addEventListener('click', () => {
    const newName = elements.newUsernameInput.value.trim();
    if (newName && newName.length <= 20) {
        username = newName;
        elements.usernameDisplay.textContent = username;
        localStorage.setItem('dama_username', username);
        socket.emit('setUsername', username);
        elements.editUsernameModal.style.display = 'none';
        updateStatus(`✅ İsmin "${username}" olarak değiştirildi`, 'success');
        addSystemMessage(`✅ İsminiz "${username}" olarak değiştirildi`);
    } else {
        updateStatus('⚠️ Geçersiz isim (max 20 karakter)', 'warning');
    }
});

elements.cancelUsernameBtn.addEventListener('click', () => {
    elements.editUsernameModal.style.display = 'none';
});

elements.modalClose?.addEventListener('click', () => {
    elements.editUsernameModal.style.display = 'none';
});

elements.newUsernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        elements.saveUsernameBtn.click();
    }
});

window.addEventListener('click', (e) => {
    if (e.target === elements.editUsernameModal) {
        elements.editUsernameModal.style.display = 'none';
    }
});

// =========================================
// ODA İŞLEMLERİ
// =========================================

elements.createRoomBtn.addEventListener('click', () => {
    socket.emit('createRoom');
    updateStatus('🔄 Oda oluşturuluyor...', 'loading');
});

elements.joinRoomBtn.addEventListener('click', () => {
    const code = elements.roomCodeInput.value.trim().toUpperCase();
    if (code && code.length === 6) {
        socket.emit('joinRoom', code);
        updateStatus(`🔄 Odaya katılınıyor: ${code}...`, 'loading');
    } else {
        updateStatus('⚠️ Geçerli bir oda kodu girin (6 karakter)', 'warning');
    }
});

elements.roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        elements.joinRoomBtn.click();
    }
});

elements.leaveRoomBtn.addEventListener('click', leaveRoom);
elements.backToLobbyBtn.addEventListener('click', leaveRoom);

function leaveRoom() {
    sessionStorage.removeItem('currentRoom');
    currentRoom = null;
    elements.gameArea.classList.add('hidden');
    elements.lobbyControls.style.display = 'flex';
    updateStatus('🏠 Ana sayfaya döndünüz', 'info');
    
    // Oyun durumunu sıfırla
    gameState = {
        board: [],
        turn: 'A',
        winner: null,
        capturedA: [],
        capturedB: [],
        players: [],
        moveHistory: []
    };
}

// =========================================
// OYUN BİTİŞ OVERLAY
// =========================================

elements.playAgainBtn.addEventListener('click', () => {
    if (currentRoom) {
        socket.emit('playAgain', currentRoom);
        elements.gameOverlay.style.display = 'none';
    }
});

// =========================================
// PERFORMANS OPTİMİZASYONU
// =========================================

// Sayfa görünürlük değişiminde
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Arka planda gereksiz işlemleri durdur
        document.body.classList.add('page-hidden');
    } else {
        // Geri dönünce devam et
        document.body.classList.remove('page-hidden');
        // Tahtayı yeniden render et
        if (typeof renderBoard === 'function') {
            queueRender(renderBoard);
        }
    }
});

// Resize optimizasyonu
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (typeof renderBoard === 'function') {
            queueRender(renderBoard);
        }
    }, 150);
});

// Scroll optimizasyonu
let scrolling = false;
window.addEventListener('scroll', () => {
    scrolling = true;
    requestAnimationFrame(() => {
        scrolling = false;
    });
});

// Build time
if (elements.buildTime) {
    elements.buildTime.textContent = new Date().getFullYear();
}

// =========================================
// OFFİLNE BİLDİRİMİ
// =========================================
window.addEventListener('offline', () => {
    if (elements.offlineNotification) {
        elements.offlineNotification.classList.remove('hidden');
    }
    updateStatus('📴 İnternet bağlantısı kesildi', 'error');
});

window.addEventListener('online', () => {
    if (elements.offlineNotification) {
        elements.offlineNotification.classList.add('hidden');
    }
    updateStatus('📶 İnternet bağlantısı geri geldi', 'success');
    setTimeout(() => {
        window.location.reload();
    }, 2000);
});

// =========================================
// BAŞLANGIÇ YÜKLEME
// =========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Uygulama başlatılıyor...');
    
    // Loading overlay'i kaldır
    setTimeout(() => {
        if (elements.pageLoading) {
            elements.pageLoading.classList.add('fade-out');
        }
    }, 1500);
    
    // Welcome mesajını kaldır
    setTimeout(() => {
        if (elements.welcomeMessage) {
            elements.welcomeMessage.classList.add('fade-out');
        }
    }, 2800);
    
    // Kullanıcı istatistiklerini yükle
    const wins = localStorage.getItem('dama_wins') || 0;
    const games = localStorage.getItem('dama_games') || 0;
    if (elements.userWins) elements.userWins.textContent = wins;
    if (elements.userGames) elements.userGames.textContent = games;
});

// =========================================
// HATA YAKALAMA
// =========================================
window.addEventListener('error', (event) => {
    console.error('❌ Global hata:', event.error);
    updateStatus('❌ Bir hata oluştu', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ İşlenmeyen promise reddi:', event.reason);
    updateStatus('❌ Bir hata oluştu', 'error');
});

// =========================================
// EKSPORT (Global fonksiyonlar)
// =========================================
window.socket = socket;
window.currentRoom = currentRoom;
window.myTeam = myTeam;
window.perspective = perspective;
window.gameState = gameState;
window.username = username;
window.elements = elements;
window.updateStatus = updateStatus;
window.addSystemMessage = addSystemMessage;
window.escapeHtml = escapeHtml;
window.queueRender = queueRender;
window.leaveRoom = leaveRoom;