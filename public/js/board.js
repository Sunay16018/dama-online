/* =========================================
   BOARD.JS - Tahta ve Taş İşlemleri
   Tüm tahta render, taş hareketleri, hamle gösterme
   ========================================= */

// =========================================
// GLOBAL DEĞİŞKENLER
// =========================================
window.selectedPiece = null;
window.validMoves = { normal: [], captures: [], captureSequences: [] };

// =========================================
// TAHTA RENDER FONKSİYONLARI
// =========================================

/**
 * Ana tahta render fonksiyonu
 */
function renderBoard() {
    if (!elements.board) return;
    
    const boardEl = elements.board;
    boardEl.innerHTML = '';
    
    // Performans için fragment kullan
    const fragment = document.createDocumentFragment();
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            // Perspektife göre satırları çevir
            const displayRow = perspective === 'A' ? 7 - row : row;
            const displayCol = col;
            
            const square = createSquare(row, col, displayRow, displayCol);
            fragment.appendChild(square);
        }
    }
    
    boardEl.appendChild(fragment);
    
    // Koordinatları ekle
    addBoardCoordinates();
}

/**
 * Tek bir kare oluşturur
 */
function createSquare(row, col, displayRow, displayCol) {
    const square = document.createElement('div');
    square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
    square.dataset.row = displayRow;
    square.dataset.col = displayCol;
    
    // Koordinat ekle (a1, h8 formatında)
    const colLetter = String.fromCharCode(97 + col);
    const rowNumber = perspective === 'A' ? row + 1 : 8 - row;
    square.dataset.coord = `${colLetter}${rowNumber}`;
    
    // Taş varsa ekle
    const piece = gameState.board[displayRow]?.[displayCol];
    if (piece) {
        const pieceDiv = createPiece(piece, displayRow, displayCol);
        square.appendChild(pieceDiv);
    }
    
    // Hamle ipuçlarını ekle
    addMoveHints(square, displayRow, displayCol);
    
    // Tıklama olayını ekle
    square.addEventListener('click', () => onSquareClick(displayRow, displayCol));
    
    return square;
}

/**
 * Taş elementi oluşturur
 */
function createPiece(piece, row, col) {
    const pieceDiv = document.createElement('div');
    pieceDiv.className = `piece team-${piece.team}`;
    
    // Dama (king) kontrolü
    if (piece.type === 'king') {
        pieceDiv.classList.add('king');
    }
    
    // Seçili taş kontrolü
    if (window.selectedPiece && 
        window.selectedPiece.row === row && 
        window.selectedPiece.col === col) {
        pieceDiv.classList.add('selected');
    }
    
    // Görsel yüklenmezse yedek gradient kullan
    pieceDiv.addEventListener('error', () => {
        pieceDiv.classList.add('fallback');
    });
    
    // Tıklama olayı
    pieceDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        onPieceClick(row, col);
    });
    
    return pieceDiv;
}

/**
 * Hamle ipuçlarını ekler
 */
function addMoveHints(square, row, col) {
    const allMoves = [
        ...(window.validMoves?.normal || []),
        ...(window.validMoves?.captures || [])
    ];
    
    // Hamle sayılarını hesapla
    const moveCounts = {};
    allMoves.forEach(move => {
        const key = `${move.to[0]},${move.to[1]}`;
        if (!moveCounts[key]) {
            moveCounts[key] = {
                count: 0,
                isCapture: !!move.capture
            };
        }
        moveCounts[key].count++;
    });
    
    const key = `${row},${col}`;
    const moveInfo = moveCounts[key];
    
    if (moveInfo) {
        const hint = document.createElement('div');
        hint.className = `move-hint ${moveInfo.isCapture ? 'capture-hint' : ''}`;
        
        // Çoklu yeme sayacı
        if (moveInfo.count > 1) {
            const badge = document.createElement('span');
            badge.className = 'capture-count multi';
            badge.textContent = `+${moveInfo.count}`;
            hint.appendChild(badge);
        } else if (moveInfo.isCapture) {
            const badge = document.createElement('span');
            badge.className = 'capture-count';
            badge.textContent = '+1';
            hint.appendChild(badge);
        }
        
        square.appendChild(hint);
    }
}

/**
 * Tahta koordinatlarını ekler
 */
function addBoardCoordinates() {
    // Daha önce eklenmişse sil
    const oldCoords = document.querySelector('.board-coordinates');
    if (oldCoords) oldCoords.remove();
    
    const coords = document.createElement('div');
    coords.className = 'board-coordinates';
    
    // Harfler (a-h)
    const files = document.createElement('div');
    files.className = 'files';
    for (let i = 0; i < 8; i++) {
        const span = document.createElement('span');
        span.textContent = String.fromCharCode(97 + i);
        files.appendChild(span);
    }
    
    // Rakamlar (1-8)
    const ranks = document.createElement('div');
    ranks.className = 'ranks';
    for (let i = 1; i <= 8; i++) {
        const span = document.createElement('span');
        span.textContent = perspective === 'A' ? i : 9 - i;
        ranks.appendChild(span);
    }
    
    coords.appendChild(files);
    coords.appendChild(ranks);
    
    const boardWrapper = document.querySelector('.board-wrapper');
    if (boardWrapper) {
        boardWrapper.appendChild(coords);
    }
}

// =========================================
// TAŞ VE KARE TIKLAMA İŞLEMLERİ
// =========================================

/**
 * Taşa tıklandığında
 */
function onPieceClick(row, col) {
    const piece = gameState.board[row]?.[col];
    if (!piece) return;
    
    // Oyun bittiyse tıklama işlemi yapma
    if (gameState.winner) {
        updateStatus('🏁 Oyun bitti, yeni oyun başlatın', 'info');
        return;
    }
    
    // Sıra kontrolü
    if (gameState.turn !== myTeam) {
        updateStatus('⏳ Sıra sende değil!', 'warning');
        animateShake(elements.turnIndicator);
        return;
    }
    
    // Takım kontrolü
    if (piece.team !== myTeam) {
        updateStatus('❌ Bu taş sana ait değil!', 'error');
        animateShake(elements.board);
        return;
    }
    
    // Taşı seç
    window.selectedPiece = { row, col };
    
    // Sunucudan olası hamleleri iste
    socket.emit('getPossibleMoves', {
        roomCode: currentRoom,
        row, col
    });
    
    // Ses efekti (opsiyonel)
    playSound('select');
}

/**
 * Kareye tıklandığında (hamle yapma)
 */
function onSquareClick(row, col) {
    if (!window.selectedPiece) return;
    if (gameState.turn !== myTeam) return;
    if (gameState.winner) return;
    
    const allMoves = [
        ...(window.validMoves?.normal || []),
        ...(window.validMoves?.captures || [])
    ];
    
    const move = allMoves.find(m => m.to[0] === row && m.to[1] === col);
    
    if (!move) {
        // Geçersiz tıklama - seçimi kaldır
        window.selectedPiece = null;
        window.validMoves = { normal: [], captures: [], captureSequences: [] };
        queueRender(renderBoard);
        return;
    }
    
    // Çoklu yeme kontrolü
    if (move.capture && window.validMoves.captureSequences) {
        const sequence = window.validMoves.captureSequences.find(seq => 
            seq[0] && seq[0].to[0] === row && seq[0].to[1] === col
        );
        
        if (sequence) {
            // Çoklu yeme animasyonu
            animateCaptureSequence(sequence, () => {
                socket.emit('makeMove', {
                    roomCode: currentRoom,
                    from: [window.selectedPiece.row, window.selectedPiece.col],
                    to: [row, col],
                    capture: move.capture,
                    sequence: sequence
                });
            });
        } else {
            // Tek yeme
            animateMove(window.selectedPiece, { row, col }, move.capture, () => {
                socket.emit('makeMove', {
                    roomCode: currentRoom,
                    from: [window.selectedPiece.row, window.selectedPiece.col],
                    to: [row, col],
                    capture: move.capture
                });
            });
        }
    } else {
        // Normal hamle
        animateMove(window.selectedPiece, { row, col }, null, () => {
            socket.emit('makeMove', {
                roomCode: currentRoom,
                from: [window.selectedPiece.row, window.selectedPiece.col],
                to: [row, col],
                capture: null
            });
        });
    }
    
    // Ses efekti
    playSound(move.capture ? 'capture' : 'move');
    
    // Seçimi temizle
    window.selectedPiece = null;
    window.validMoves = { normal: [], captures: [], captureSequences: [] };
}

// =========================================
// ANİMASYON FONKSİYONLARI
// =========================================

/**
 * Tek hamle animasyonu
 */
function animateMove(from, to, capture, callback) {
    const pieceElement = document.querySelector(
        `[data-row="${from.row}"][data-col="${from.col}"] .piece`
    );
    
    const targetSquare = document.querySelector(
        `[data-row="${to.row}"][data-col="${to.col}"]`
    );
    
    if (!pieceElement || !targetSquare) {
        callback();
        return;
    }
    
    // Klon oluştur
    const clone = pieceElement.cloneNode(true);
    const rect = pieceElement.getBoundingClientRect();
    const targetRect = targetSquare.getBoundingClientRect();
    
    clone.style.position = 'fixed';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.zIndex = '1000';
    clone.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    clone.style.pointerEvents = 'none';
    
    document.body.appendChild(clone);
    pieceElement.style.opacity = '0';
    
    // Yeme varsa patlama efekti
    if (capture) {
        const [captureRow, captureCol] = capture;
        const capturedPiece = document.querySelector(
            `[data-row="${captureRow}"][data-col="${captureCol}"] .piece`
        );
        
        if (capturedPiece) {
            createExplosion(capturedPiece.getBoundingClientRect());
            capturedPiece.style.opacity = '0';
        }
    }
    
    // Hareket animasyonu
    setTimeout(() => {
        clone.style.left = targetRect.left + 'px';
        clone.style.top = targetRect.top + 'px';
        clone.style.transform = 'scale(1.1)';
    }, 10);
    
    // Animasyon bitince
    setTimeout(() => {
        clone.remove();
        pieceElement.style.opacity = '1';
        callback();
    }, 300);
}

/**
 * Çoklu yeme animasyonu
 */
function animateCaptureSequence(sequence, callback) {
    let index = 0;
    
    function playNext() {
        if (index >= sequence.length) {
            callback();
            return;
        }
        
        const move = sequence[index];
        const from = { row: move.from[0], col: move.from[1] };
        const to = { row: move.to[0], col: move.to[1] };
        
        animateMove(from, to, move.capture, () => {
            index++;
            playNext();
        });
    }
    
    playNext();
}

/**
 * Patlama efekti oluşturur
 */
function createExplosion(rect) {
    const colors = ['#ff6b6b', '#ffd966', '#6b9fff', '#ff4444', '#ffa500'];
    
    for (let i = 0; i < 12; i++) {
        const particle = document.createElement('div');
        particle.className = 'explosion-particle';
        
        particle.style.left = (rect.left + rect.width / 2) + 'px';
        particle.style.top = (rect.top + rect.height / 2) + 'px';
        
        const angle = (i / 12) * Math.PI * 2;
        const distance = 50 + Math.random() * 50;
        
        particle.style.setProperty('--angle', angle + 'rad');
        particle.style.setProperty('--distance', distance + 'px');
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        
        document.body.appendChild(particle);
        
        setTimeout(() => particle.remove(), 600);
    }
}

/**
 * Sallanma animasyonu
 */
function animateShake(element) {
    if (!element) return;
    
    element.style.animation = 'none';
    element.offsetHeight; // Reflow
    element.style.animation = 'shake 0.5s ease';
    
    setTimeout(() => {
        element.style.animation = '';
    }, 500);
}

/**
 * Ses efekti çalar (opsiyonel)
 */
function playSound(type) {
    const soundMap = {
        move: 'moveSound',
        capture: 'captureSound',
        select: 'selectSound',
        win: 'winSound'
    };
    
    const soundId = soundMap[type];
    if (soundId) {
        const sound = document.getElementById(soundId);
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(() => {});
        }
    }
}

// =========================================
// DIŞA AKTARILAN FONKSİYONLAR
// =========================================
window.renderBoard = renderBoard;
window.onPieceClick = onPieceClick;
window.onSquareClick = onSquareClick;
window.animateMove = animateMove;
window.animateCaptureSequence = animateCaptureSequence;
window.createExplosion = createExplosion;
window.animateShake = animateShake;
window.playSound = playSound;