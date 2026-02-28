/* =========================================
   CHAT.JS - Sohbet Sistemi
   Tüm sohbet işlemleri, mesaj gönderme/alma
   ========================================= */

// =========================================
// GLOBAL DEĞİŞKENLER
// =========================================
let chatHistory = [];
let typingTimeout = null;
let messageQueue = [];
let isSending = false;

// =========================================
// SOCKET OLAY DİNLEYİCİLERİ
// =========================================

/**
 * Yeni mesaj geldiğinde
 */
socket.on('chatMessage', (data) => {
    console.log('💬 Yeni mesaj:', data);
    
    // Mesajı queue'ya ekle (performans için)
    messageQueue.push(data);
    
    if (!isSending) {
        processMessageQueue();
    }
    
    // Bildirim (sayfa aktif değilse)
    if (document.hidden && data.username !== username) {
        showNotification(data);
    }
});

/**
 * Mesaj kuyruğunu işler
 */
function processMessageQueue() {
    if (messageQueue.length === 0) {
        isSending = false;
        return;
    }
    
    isSending = true;
    
    requestAnimationFrame(() => {
        const data = messageQueue.shift();
        addMessageToChat(data);
        
        setTimeout(() => {
            processMessageQueue();
        }, 16); // 60 FPS
    });
}

/**
 * Mesajı sohbete ekler
 */
function addMessageToChat(data) {
    if (!elements.chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.username === username ? 'own-message' : 'other-message'}`;
    messageDiv.dataset.messageId = data.id || Date.now();
    
    const time = new Date().toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    
    // Mesaj içeriğini formatla (link, emoji vb.)
    const formattedMessage = formatMessage(data.message);
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-sender">${escapeHtml(data.username)}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${formattedMessage}</div>
    `;
    
    elements.chatMessages.appendChild(messageDiv);
    chatHistory.push(data);
    
    // Sohbet geçmişini temizle (çok uzarsa)
    if (chatHistory.length > 200) {
        chatHistory = chatHistory.slice(-150);
    }
    
    // Scroll'u en alta indir
    scrollToBottom();
}

/**
 * Mesajı formatlar (link, emoji, vb.)
 */
function formatMessage(text) {
    // Linkleri bul
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    text = text.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
    
    // Emojileri bul (basit)
    const emojiMap = {
        ':)': '😊',
        ':(': '😞',
        ':D': '😃',
        ';(': '😢',
        '<3': '❤️',
        ':)': '😊',
        ':P': '😛',
        ':O': '😮',
        ':*': '😘',
        ':angry:': '😠',
        ':cry:': '😢',
        ':laugh:': '😂',
        ':wink:': '😉',
        ':cool:': '😎'
    };
    
    Object.keys(emojiMap).forEach(key => {
        const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        text = text.replace(regex, emojiMap[key]);
    });
    
    return text;
}

/**
 * Bildirim gösterir
 */
function showNotification(data) {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
        new Notification('💬 Yeni mesaj', {
            body: `${data.username}: ${data.message.substring(0, 50)}${data.message.length > 50 ? '...' : ''}`,
            icon: '/images/icon-192x192.png',
            silent: true
        });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

/**
 * Scroll'u en alta indirir
 */
function scrollToBottom() {
    if (!elements.chatMessages) return;
    
    requestAnimationFrame(() => {
        elements.chatMessages.scrollTo({
            top: elements.chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    });
}

// =========================================
// MESAJ GÖNDERME
// =========================================

/**
 * Mesaj gönderir
 */
function sendMessage() {
    const message = elements.chatInput?.value.trim();
    if (!message) return;
    
    // Mesajı temizle ve kontrol et
    if (message.length > 200) {
        updateStatus('❌ Mesaj çok uzun (max 200 karakter)', 'error');
        return;
    }
    
    // XSS koruması
    const cleanMessage = message
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .trim();
    
    // Socket'e gönder
    socket.emit('chatMessage', { message: cleanMessage });
    
    // Input'u temizle
    elements.chatInput.value = '';
    elements.chatInput.style.height = 'auto';
    
    // Karakter sayacını sıfırla
    updateCharCount(0);
}

/**
 * Karakter sayacını günceller
 */
function updateCharCount(length) {
    let counter = elements.chatInput.parentNode.querySelector('.char-counter');
    
    if (!counter && length > 0) {
        counter = document.createElement('span');
        counter.className = 'char-counter';
        elements.chatInput.parentNode.appendChild(counter);
    }
    
    if (counter) {
        counter.textContent = `${length}/200`;
        
        if (length > 180) {
            counter.classList.add('warning');
            counter.classList.remove('danger');
        } else if (length > 190) {
            counter.classList.add('danger');
            counter.classList.remove('warning');
        } else {
            counter.classList.remove('warning', 'danger');
        }
        
        if (length === 0) {
            counter.remove();
        }
    }
}

// =========================================
// OLAY DİNLEYİCİLERİ
// =========================================

/**
 * Gönder butonu tıklandığında
 */
elements.sendChatBtn?.addEventListener('click', sendMessage);

/**
 * Input'ta Enter tuşuna basıldığında
 */
elements.chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

/**
 * Input değiştiğinde (karakter sayacı, yazıyor göstergesi)
 */
elements.chatInput?.addEventListener('input', (e) => {
    const length = e.target.value.length;
    updateCharCount(length);
    
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
    
    // Yazıyor göstergesi
    clearTimeout(typingTimeout);
    if (length > 0) {
        socket.emit('typing', { room: currentRoom || 'global' });
        
        typingTimeout = setTimeout(() => {
            socket.emit('stopTyping', { room: currentRoom || 'global' });
        }, 2000);
    } else {
        socket.emit('stopTyping', { room: currentRoom || 'global' });
    }
});

/**
 * Sohbet temizle butonu
 */
elements.clearChatBtn?.addEventListener('click', () => {
    if (elements.chatMessages) {
        elements.chatMessages.innerHTML = `
            <div class="chat-welcome">
                <i class="fas fa-hand-wave"></i>
                <p>Sohbet temizlendi</p>
                <small>🔔 Nazik ol, eğlen.</small>
            </div>
        `;
    }
    chatHistory = [];
});

// =========================================
// SOHBET GEÇMİŞİ
// =========================================

/**
 * Sohbet geçmişini yükler
 */
function loadChatHistory() {
    if (!elements.chatMessages) return;
    
    if (chatHistory.length === 0) {
        // Hoşgeldin mesajını göster
        elements.chatMessages.innerHTML = `
            <div class="chat-welcome">
                <i class="fas fa-hand-wave"></i>
                <p>Sohbete hoşgeldin! Nazik ol, eğlen.</p>
                <small>🔔 Küfür ve hakaret yasaktır</small>
            </div>
        `;
    } else {
        // Geçmiş mesajları yükle
        elements.chatMessages.innerHTML = '';
        chatHistory.forEach(data => addMessageToChat(data));
    }
    
    scrollToBottom();
}

/**
 * Sohbeti temizler
 */
function clearChat() {
    chatHistory = [];
    loadChatHistory();
}

// =========================================
// KULLANICI LİSTESİ (OPSİYONEL)
// =========================================

/**
 * Online kullanıcı listesini günceller
 */
socket.on('onlineCount', (data) => {
    if (elements.onlineCount) {
        const count = data.count || 0;
        elements.onlineCount.innerHTML = `<i class="fas fa-users"></i> ${count}`;
        
        // Kullanıcı listesini güncelle
        updateUserList(data.users);
    }
});

/**
 * Kullanıcı listesini günceller
 */
function updateUserList(users) {
    let list = document.querySelector('.user-list');
    
    if (!list && users && users.length > 1) {
        // Kullanıcı listesi paneli yoksa oluştur
        const chatHeader = document.querySelector('.chat-header');
        if (chatHeader) {
            list = document.createElement('div');
            list.className = 'user-list';
            chatHeader.parentNode.insertBefore(list, elements.chatMessages);
        }
    }
    
    if (list && users) {
        list.innerHTML = users.map(user => `
            <div class="user-list-item">
                <span class="user-status-dot ${user === username ? 'online' : ''}"></span>
                <span class="user-name">${escapeHtml(user)}</span>
                ${user === username ? '<span class="user-badge">(sen)</span>' : ''}
            </div>
        `).join('');
    }
}

// =========================================
// BAŞLANGIÇ İŞLEMLERİ
// =========================================

// Sayfa yüklendiğinde sohbet geçmişini yükle
document.addEventListener('DOMContentLoaded', () => {
    loadChatHistory();
    
    // Bildirim izni iste
    if ('Notification' in window && Notification.permission === 'default') {
        setTimeout(() => {
            Notification.requestPermission();
        }, 5000);
    }
});

// =========================================
// DIŞA AKTARILAN FONKSİYONLAR
// =========================================
window.sendMessage = sendMessage;
window.loadChatHistory = loadChatHistory;
window.clearChat = clearChat;
window.scrollToBottom = scrollToBottom;