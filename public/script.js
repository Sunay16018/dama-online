const socket = io();

// DOM elementleri
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const gameArea = document.getElementById('gameArea');
const lobbyControls = document.getElementById('lobbyControls');
const turnIndicator = document.getElementById('turnIndicator');
const playersEl = document.getElementById('players');
const roomCodeEl = document.getElementById('roomCode');
const gameStatus = document.getElementById('gameStatus');
const gameOverlay = document.getElementById('gameOverlay');
const winnerText = document.getElementById('winnerText');
const roomCodeInput = document.getElementById('roomCodeInput');
const playerTeam = document.getElementById('playerTeam');
const capturedPiecesEl = document.getElementById('capturedPieces');

// Sohbet elementleri
const chatArea = document.getElementById('chatArea');
const toggleChatBtn = document.getElementById('toggleChatBtn');
const closeChatBtn = document.getElementById('closeChatBtn');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const usernameDisplay = document.getElementById('usernameDisplay');
const editUsernameBtn = document.getElementById('editUsernameBtn');
const editUsernameModal = document.getElementById('editUsernameModal');
const newUsernameInput = document.getElementById('newUsernameInput');
const saveUsernameBtn = document.getElementById('saveUsernameBtn');
const cancelUsernameBtn = document.getElementById('cancelUsernameBtn');

// Oyun değişkenleri
let currentRoom = null;
let myTeam = null;
let perspective = 'A';
let boardState = [];
let selectedPiece = null;
let validMoves = { normal: [], captures: [] };
let turn = 'A';
let gameWinner = null;
let capturedA = [];
let capturedB = [];
let isAnimating = false;
let animationQueue = [];

// Kullanıcı değişkenleri
let username = localStorage.getItem('dama_username');
if (!username) {
    const randomNum = Math.floor(Math.random() * 1000) + 1;
    username = `Oyuncu-${randomNum}`;
    localStorage.setItem('dama_username', username);
}
usernameDisplay.textContent = username;

// Sayfa yenilendiğinde session'dan oda kodunu al
const savedRoom = sessionStorage.getItem('currentRoom');

if (savedRoom) {
    currentRoom = savedRoom;
    roomCodeInput.value = savedRoom;
    statusEl.textContent = `🔄 Yeniden bağlanılıyor: ${savedRoom}`;
    setTimeout(() => {
        socket.emit('joinRoom', savedRoom);
    }, 1000);
}

// Socket bağlantı
socket.on('connect', () => {
    console.log('✅ Bağlandı:', socket.id);
    statusEl.textContent = '✅ Sunucuya bağlandı';
    
    // Kullanıcı adını sunucuya bildir
    socket.emit('setUsername', username);
    
    if (savedRoom && !currentRoom) {
        socket.emit('joinRoom', savedRoom);
    }
});

socket.on('connect_error', () => {
    statusEl.textContent = '❌ Sunucuya bağlanılamıyor';
});

// İsim değiştirme işlemleri
editUsernameBtn.addEventListener('click', () => {
    newUsernameInput.value = username;
    editUsernameModal.style.display = 'flex';
});

saveUsernameBtn.addEventListener('click', () => {
    const newName = newUsernameInput.value.trim();
    if (newName && newName.length <= 20) {
        username = newName;
        usernameDisplay.textContent = username;
        localStorage.setItem('dama_username', username);
        socket.emit('setUsername', username);
        editUsernameModal.style.display = 'none';
        statusEl.textContent = `✅ İsmin "${username}" olarak değiştirildi`;
    }
});

cancelUsernameBtn.addEventListener('click', () => {
    editUsernameModal.style.display = 'none';
});

// Enter tuşu ile kaydet
newUsernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        saveUsernameBtn.click();
    }
});

// Modal dışına tıklayınca kapat
window.addEventListener('click', (e) => {
    if (e.target === editUsernameModal) {
        editUsernameModal.style.display = 'none';
    }
});

// Sohbet butonları
toggleChatBtn.addEventListener('click', () => {
    chatArea.style.display = 'flex';
    toggleChatBtn.style.display = 'none';
    chatInput.focus();
});

closeChatBtn.addEventListener('click', () => {
    chatArea.style.display = 'none';
    toggleChatBtn.style.display = 'flex';
});

// Mesaj gönderme
function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        socket.emit('chatMessage', {
            username: username,
            message: message,
            room: 'global'
        });
        chatInput.value = '';
    }
}

sendChatBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Gelen sohbet mesajları
socket.on('chatMessage', (data) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.username === username ? 'own-message' : 'other-message'}`;
    
    const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-sender">${data.username}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(data.message)}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// HTML escape fonksiyonu (XSS koruması)
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Butonlar
document.getElementById('createRoomBtn').addEventListener('click', () => {
    socket.emit('createRoom');
    statusEl.textContent = '🔄 Oda oluşturuluyor...';
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code) {
        socket.emit('joinRoom', code);
        statusEl.textContent = `🔄 Odaya katılınıyor: ${code}`;
    } else {
        statusEl.textContent = '⚠️ Oda kodu girin';
    }
});

document.getElementById('leaveRoomBtn').addEventListener('click', () => {
    leaveRoom();
});

document.getElementById('playAgainBtn').addEventListener('click', () => {
    socket.emit('playAgain', currentRoom);
    gameOverlay.style.display = 'none';
});

document.getElementById('backToLobbyBtn').addEventListener('click', () => {
    leaveRoom();
});

function leaveRoom() {
    sessionStorage.removeItem('currentRoom');
    currentRoom = null;
    gameArea.style.display = 'none';
    lobbyControls.style.display = 'flex';
    statusEl.textContent = '🏠 Ana sayfaya döndünüz';
}

// Oda oluşturuldu
socket.on('roomCreated', (roomCode) => {
    currentRoom = roomCode;
    sessionStorage.setItem('currentRoom', roomCode);
    roomCodeInput.value = roomCode;
    statusEl.textContent = `🎲 Oda oluşturuldu: ${roomCode} - Rakip bekleniyor...`;
});

// Odaya katılındı
socket.on('joined', (roomCode) => {
    currentRoom = roomCode;
    sessionStorage.setItem('currentRoom', roomCode);
    statusEl.textContent = `🚪 Odaya katıldınız: ${roomCode} - Rakip bekleniyor...`;
});

// Oyun başladı
socket.on('gameStart', (data) => {
    console.log('Oyun başladı:', data);
    boardState = data.board;
    turn = data.turn;
    myTeam = data.myTeam;
    perspective = data.perspective;
    gameWinner = null;
    capturedA = data.capturedA || [];
    capturedB = data.capturedB || [];
    
    gameArea.style.display = 'flex';
    lobbyControls.style.display = 'none';
    roomCodeEl.textContent = `📌 Oda: ${currentRoom}`;
    playerTeam.textContent = myTeam === 'A' ? '🔴 Kırmızı' : '🔵 Mavi';
    playerTeam.style.color = myTeam === 'A' ? '#ff6b6b' : '#6b9fff';
    playerTeam.dataset.team = myTeam;
    
    gameOverlay.style.display = 'none';
    selectedPiece = null;
    validMoves = { normal: [], captures: [] };
    renderBoard();
    updateTurnInfo();
    updateCapturedPieces();
});

// Tahta güncelleme
socket.on('updateBoard', (data) => {
    const { board, turn: newTurn, capturedA: newCapturedA, capturedB: newCapturedB, lastMove, perspective: newPerspective } = data;
    
    perspective = newPerspective;
    
    if (lastMove) {
        animateMove(lastMove, board, () => {
            boardState = board;
            turn = newTurn;
            capturedA = newCapturedA || [];
            capturedB = newCapturedB || [];
            selectedPiece = null;
            validMoves = { normal: [], captures: [] };
            renderBoard();
            updateTurnInfo();
            updateCapturedPieces();
        });
    } else {
        boardState = board;
        turn = newTurn;
        capturedA = newCapturedA || [];
        capturedB = newCapturedB || [];
        selectedPiece = null;
        validMoves = { normal: [], captures: [] };
        renderBoard();
        updateTurnInfo();
        updateCapturedPieces();
    }
});

// Animasyonlu hamle
function animateMove(move, newBoard, callback) {
    if (isAnimating) {
        animationQueue.push({ move, newBoard, callback });
        return;
    }
    
    isAnimating = true;
    const [fromRow, fromCol] = move.from;
    const [toRow, toCol] = move.to;
    
    const pieceElement = document.querySelector(`[data-row="${fromRow}"][data-col="${fromCol}"] .piece`);
    if (!pieceElement) {
        isAnimating = false;
        callback();
        return;
    }
    
    const targetSquare = document.querySelector(`[data-row="${toRow}"][data-col="${toCol}"]`);
    if (!targetSquare) {
        isAnimating = false;
        callback();
        return;
    }
    
    const clone = pieceElement.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.width = pieceElement.offsetWidth + 'px';
    clone.style.height = pieceElement.offsetHeight + 'px';
    clone.style.left = pieceElement.getBoundingClientRect().left + 'px';
    clone.style.top = pieceElement.getBoundingClientRect().top + 'px';
    clone.style.zIndex = '1000';
    clone.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    clone.style.pointerEvents = 'none';
    
    document.body.appendChild(clone);
    pieceElement.style.opacity = '0';
    
    const targetRect = targetSquare.getBoundingClientRect();
    
    if (move.capture) {
        const [captureRow, captureCol] = move.capture;
        const capturedPiece = document.querySelector(`[data-row="${captureRow}"][data-col="${captureCol}"] .piece`);
        
        if (capturedPiece) {
            createExplosionEffect(capturedPiece.getBoundingClientRect());
            capturedPiece.style.opacity = '0';
        }
    }
    
    setTimeout(() => {
        clone.style.left = targetRect.left + 'px';
        clone.style.top = targetRect.top + 'px';
        clone.style.transform = 'scale(1.1)';
    }, 10);
    
    setTimeout(() => {
        clone.remove();
        pieceElement.style.opacity = '1';
        isAnimating = false;
        callback();
        
        if (animationQueue.length > 0) {
            const next = animationQueue.shift();
            animateMove(next.move, next.newBoard, next.callback);
        }
    }, 300);
}

// Patlama efekti
function createExplosionEffect(rect) {
    for (let i = 0; i < 8; i++) {
        const particle = document.createElement('div');
        particle.className = 'explosion-particle';
        particle.style.left = rect.left + rect.width/2 + 'px';
        particle.style.top = rect.top + rect.height/2 + 'px';
        particle.style.backgroundColor = `hsl(${Math.random() * 60 + 30}, 100%, 50%)`;
        particle.style.setProperty('--angle', Math.random() * 360 + 'deg');
        particle.style.setProperty('--distance', Math.random() * 50 + 20 + 'px');
        document.body.appendChild(particle);
        
        setTimeout(() => particle.remove(), 500);
    }
}

// Olası hamleler
socket.on('possibleMoves', (data) => {
    validMoves = {
        normal: data.normalMoves || [],
        captures: data.captures || []
    };
    renderBoard();
});

// Oyun bitti
socket.on('gameOver', (data) => {
    boardState = data.board;
    turn = data.turn;
    capturedA = data.capturedA || [];
    capturedB = data.capturedB || [];
    gameWinner = data.winner;
    
    renderBoard();
    updateTurnInfo();
    updateCapturedPieces();
    showWinner(gameWinner);
    createConfetti();
});

// Hata mesajı
socket.on('error', (msg) => {
    statusEl.textContent = '❌ ' + msg;
    if (msg.includes('dolu') || msg.includes('bulunamadı')) {
        sessionStorage.removeItem('currentRoom');
    }
});

// Oyuncu ayrıldı
socket.on('playerLeft', () => {
    statusEl.textContent = '👋 Rakip ayrıldı';
    gameStatus.textContent = '⚠️ Rakip ayrıldı - Oyun bekliyor';
});

// Konfeti efekti
function createConfetti() {
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.animationDelay = Math.random() * 2 + 's';
        confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
        document.body.appendChild(confetti);
        
        setTimeout(() => confetti.remove(), 3000);
    }
}

// Kazananı göster
function showWinner(winner) {
    const teamName = winner === 'A' ? '🔴 KIRMIZI KAZANDI!' : '🔵 MAVİ KAZANDI!';
    winnerText.innerHTML = `🏆 ${teamName} 🏆`;
    gameOverlay.style.display = 'flex';
}

// Tahtayı render et
function renderBoard() {
    boardEl.innerHTML = '';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const displayRow = perspective === 'A' ? 7 - row : row;
            const displayCol = col;
            
            const square = document.createElement('div');
            square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
            square.dataset.row = displayRow;
            square.dataset.col = displayCol;
            
            const colLetter = String.fromCharCode(97 + col);
            const rowNumber = perspective === 'A' ? row + 1 : 8 - row;
            square.dataset.coord = `${colLetter}${rowNumber}`;
            
            const piece = boardState[displayRow]?.[displayCol];
            if (piece) {
                const pieceDiv = document.createElement('div');
                pieceDiv.className = `piece team-${piece.team}`;
                if (piece.type === 'king') pieceDiv.classList.add('king');
                if (selectedPiece && selectedPiece.row === displayRow && selectedPiece.col === displayCol) {
                    pieceDiv.classList.add('selected');
                }
                
                pieceDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onPieceClick(displayRow, displayCol);
                });
                
                square.appendChild(pieceDiv);
            }
            
            const allMoves = [...validMoves.normal, ...validMoves.captures];
            const moveCounts = {};
            allMoves.forEach(move => {
                const key = `${move.to[0]},${move.to[1]}`;
                if (!moveCounts[key]) {
                    moveCounts[key] = {
                        count: 0,
                        isCapture: move.capture ? true : false
                    };
                }
                moveCounts[key].count++;
            });
            
            const key = `${displayRow},${displayCol}`;
            if (moveCounts[key]) {
                const hint = document.createElement('div');
                hint.className = `move-hint ${moveCounts[key].isCapture ? 'capture-hint' : ''}`;
                
                if (moveCounts[key].count > 1) {
                    const badge = document.createElement('span');
                    badge.className = 'capture-count';
                    badge.textContent = `+${moveCounts[key].count}`;
                    hint.appendChild(badge);
                } else if (moveCounts[key].isCapture) {
                    const badge = document.createElement('span');
                    badge.className = 'capture-count';
                    badge.textContent = '+1';
                    hint.appendChild(badge);
                }
                
                square.appendChild(hint);
            }
            
            square.addEventListener('click', () => onSquareClick(displayRow, displayCol));
            
            boardEl.appendChild(square);
        }
    }
}

// Yenen taşları güncelle
function updateCapturedPieces() {
    if (!capturedPiecesEl) return;
    
    capturedPiecesEl.innerHTML = '';
    
    const myCaptured = myTeam === 'A' ? capturedB : capturedA;
    const opponentCaptured = myTeam === 'A' ? capturedA : capturedB;
    
    const myCapturedDiv = document.createElement('div');
    myCapturedDiv.className = 'captured-pile my-captured';
    myCapturedDiv.innerHTML = '<div class="captured-label">YEDİKLERİN</div>';
    
    myCaptured.forEach((piece, index) => {
        const pieceIcon = document.createElement('div');
        pieceIcon.className = `captured-piece team-${piece.team}`;
        pieceIcon.style.transform = `rotate(${index * 5}deg) translateX(${index * 3}px)`;
        pieceIcon.textContent = piece.type === 'king' ? '👑' : '●';
        myCapturedDiv.appendChild(pieceIcon);
    });
    
    const opponentCapturedDiv = document.createElement('div');
    opponentCapturedDiv.className = 'captured-pile opponent-captured';
    opponentCapturedDiv.innerHTML = '<div class="captured-label">YEDİKLERİ</div>';
    
    opponentCaptured.forEach((piece, index) => {
        const pieceIcon = document.createElement('div');
        pieceIcon.className = `captured-piece team-${piece.team}`;
        pieceIcon.style.transform = `rotate(${index * -5}deg) translateX(${index * -3}px)`;
        pieceIcon.textContent = piece.type === 'king' ? '👑' : '●';
        opponentCapturedDiv.appendChild(pieceIcon);
    });
    
    capturedPiecesEl.appendChild(opponentCapturedDiv);
    capturedPiecesEl.appendChild(myCapturedDiv);
}

// Taşa tıklandı
function onPieceClick(row, col) {
    const piece = boardState[row]?.[col];
    if (!piece) return;
    
    if (gameWinner) return;
    if (turn !== myTeam) {
        statusEl.textContent = '⏳ Sıra sende değil!';
        return;
    }
    if (piece.team !== myTeam) {
        statusEl.textContent = '❌ Bu taş sana ait değil!';
        return;
    }
    
    selectedPiece = { row, col };
    
    socket.emit('getPossibleMoves', {
        roomCode: currentRoom,
        row, col,
        team: myTeam
    });
}

// Kareye tıklandı
function onSquareClick(row, col) {
    if (!selectedPiece) return;
    if (turn !== myTeam) return;
    if (gameWinner) return;
    
    const allMoves = [...validMoves.normal, ...validMoves.captures];
    const move = allMoves.find(m => m.to[0] === row && m.to[1] === col);
    
    if (!move) {
        selectedPiece = null;
        validMoves = { normal: [], captures: [] };
        renderBoard();
        return;
    }
    
    socket.emit('makeMove', {
        roomCode: currentRoom,
        from: [selectedPiece.row, selectedPiece.col],
        to: [row, col],
        capture: move.capture
    });
    
    selectedPiece = null;
    validMoves = { normal: [], captures: [] };
}

// Sıra bilgisini güncelle
function updateTurnInfo() {
    const teamName = turn === 'A' ? '🔴 KIRMIZI' : '🔵 MAVİ';
    const isMe = turn === myTeam ? ' (SEN)' : ' (RAKİP)';
    
    turnIndicator.innerHTML = `SIRA: ${teamName}${isMe}`;
    
    playersEl.innerHTML = '<h3>👥 OYUNCULAR</h3>';
    
    const opponentTeam = myTeam === 'A' ? 'B' : 'A';
    
    const meDiv = document.createElement('div');
    meDiv.className = `player-item ${turn === myTeam ? 'active' : ''}`;
    meDiv.innerHTML = `
        <span>${turn === myTeam ? '▶️ ' : ''}${myTeam === 'A' ? 
