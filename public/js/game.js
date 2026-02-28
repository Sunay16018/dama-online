/* =========================================
   GAME.JS - Oyun Mekanikleri
   Tüm oyun mantığı, hamleler, kazanan kontrolü
   ========================================= */

// =========================================
// SOCKET OLAY DİNLEYİCİLERİ
// =========================================

/**
 * Oyun başladığında
 */
socket.on('gameStart', (data) => {
    console.log('🎮 Oyun başladı:', data);
    
    // Oyun durumunu güncelle
    gameState.board = data.board;
    gameState.turn = data.turn;
    gameState.capturedA = data.capturedA || [];
    gameState.capturedB = data.capturedB || [];
    gameState.players = data.players || [];
    gameState.startTime = data.startTime;
    
    // Takım bilgilerini ayarla
    myTeam = data.myTeam;
    perspective = data.perspective;
    
    // UI'ı güncelle
    elements.gameArea.classList.remove('hidden');
    elements.lobbyControls.style.display = 'none';
    elements.roomCode.textContent = currentRoom || '---';
    
    // Takım göstergesini ayarla
    elements.playerTeam.textContent = myTeam === 'A' ? '🔴 Kırmızı' : '🔵 Mavi';
    elements.playerTeam.style.color = myTeam === 'A' ? '#ff6b6b' : '#6b9fff';
    elements.playerTeam.dataset.team = myTeam;
    
    // Overlay'i gizle
    elements.gameOverlay.style.display = 'none';
    
    // Seçimleri temizle
    window.selectedPiece = null;
    window.validMoves = { normal: [], captures: [], captureSequences: [] };
    
    // Tahtayı render et
    queueRender(renderBoard);
    updateTurnInfo();
    updateCapturedPieces();
    updateMoveHistory();
    
    // Oyun sayacını güncelle
    const games = parseInt(localStorage.getItem('dama_games') || 0) + 1;
    localStorage.setItem('dama_games', games);
    if (elements.userGames) elements.userGames.textContent = games;
    
    // Hoşgeldin mesajı
    addSystemMessage(`🎮 Oyun başladı! ${myTeam === 'A' ? '🔴 Kırmızı' : '🔵 Mavi'} takımdasın.`);
});

/**
 * Tahta güncellendiğinde
 */
socket.on('updateBoard', (data) => {
    console.log('🔄 Tahta güncellendi:', data);
    
    gameState.board = data.board;
    gameState.turn = data.turn;
    gameState.capturedA = data.capturedA || [];
    gameState.capturedB = data.capturedB || [];
    perspective = data.perspective;
    
    window.selectedPiece = null;
    window.validMoves = { normal: [], captures: [], captureSequences: [] };
    
    queueRender(renderBoard);
    updateTurnInfo();
    updateCapturedPieces();
    
    if (data.lastMove) {
        highlightLastMove(data.lastMove);
    }
});

/**
 * Olası hamleler geldiğinde
 */
socket.on('possibleMoves', (data) => {
    window.validMoves = {
        normal: data.normalMoves || [],
        captures: data.captures || [],
        captureSequences: data.captureSequences || []
    };
    queueRender(renderBoard);
    updateTurnInfo();
});

/**
 * Oyun bittiğinde
 */
socket.on('gameOver', (data) => {
    console.log('🏁 Oyun bitti:', data);
    
    gameState.board = data.board;
    gameState.turn = data.turn;
    gameState.capturedA = data.capturedA || [];
    gameState.capturedB = data.capturedB || [];
    gameState.winner = data.winner;
    
    queueRender(renderBoard);
    updateTurnInfo();
    updateCapturedPieces();
    showWinner(data);
    
    // Kazanan varsa galibiyet sayacını güncelle
    if (data.winner === myTeam) {
        const wins = parseInt(localStorage.getItem('dama_wins') || 0) + 1;
        localStorage.setItem('dama_wins', wins);
        if (elements.userWins) elements.userWins.textContent = wins;
    }
    
    // Konfeti efekti
    createConfetti();
});

// =========================================
// OYUN FONKSİYONLARI
// =========================================

/**
 * Sıra bilgisini günceller
 */
function updateTurnInfo() {
    if (!elements.turnIndicator) return;
    
    const teamName = gameState.turn === 'A' ? '🔴 KIRMIZI' : '🔵 MAVİ';
    const isMe = gameState.turn === myTeam ? ' (SEN)' : ' (RAKİP)';
    
    elements.turnIndicator.innerHTML = `
        <span class="turn-team">${teamName}</span>
        <span class="turn-player">${isMe}</span>
    `;
    
    // Oyuncu listesini güncelle
    updatePlayersList();
}

/**
 * Oyuncu listesini günceller
 */
function updatePlayersList() {
    if (!elements.playersList) return;
    
    const opponentTeam = myTeam === 'A' ? 'B' : 'A';
    
    let html = '<h3><i class="fas fa-users"></i> OYUNCULAR</h3>';
    
    // Ben
    html += `
        <div class="player-item ${gameState.turn === myTeam ? 'active' : ''}">
            <span>
                ${gameState.turn === myTeam ? '▶️ ' : ''}
                ${myTeam === 'A' ? '🔴' : '🔵'} 
                ${myTeam === 'A' ? 'Kırmızı' : 'Mavi'} (Sen)
            </span>
            <span class="team-badge team-${myTeam}">${myTeam}</span>
        </div>
    `;
    
    // Rakip
    html += `
        <div class="player-item ${gameState.turn === opponentTeam ? 'active' : ''}">
            <span>
                ${gameState.turn === opponentTeam ? '▶️ ' : ''}
                ${opponentTeam === 'A' ? '🔴' : '🔵'} 
                ${opponentTeam === 'A' ? 'Kırmızı' : 'Mavi'} (Rakip)
            </span>
            <span class="team-badge team-${opponentTeam}">${opponentTeam}</span>
        </div>
    `;
    
    elements.playersList.innerHTML = html;
    
    // Oyun durumunu güncelle
    updateGameStatus();
}

/**
 * Oyun durumunu günceller
 */
function updateGameStatus() {
    if (!elements.gameStatus) return;
    
    let status = '';
    let icon = '';
    
    if (gameState.winner) {
        status = '🏁 OYUN BİTTİ';
        icon = 'fa-flag-checkered';
    } else if (window.validMoves?.captures?.length > 0) {
        status = '⚔️ YEME MÜMKÜN';
        icon = 'fa-crosshairs';
    } else if (gameState.turn === myTeam) {
        status = '🎮 SIRA SENDE';
        icon = 'fa-hand-pointer';
    } else {
        status = '⏳ RAKİP BEKLENİYOR';
        icon = 'fa-hourglass-half';
    }
    
    elements.gameStatus.innerHTML = `<i class="fas ${icon}"></i> ${status}`;
}

/**
 * Yenen taşları günceller
 */
function updateCapturedPieces() {
    if (!elements.capturedPieces) return;
    
    const myCaptured = myTeam === 'A' ? gameState.capturedB : gameState.capturedA;
    const opponentCaptured = myTeam === 'A' ? gameState.capturedA : gameState.capturedB;
    
    let html = `
        <div class="captured-pile">
            <div class="captured-label">YEDİKLERİN</div>
            ${generateCapturedPiecesHtml(myCaptured)}
        </div>
        <div class="captured-pile">
            <div class="captured-label">YEDİKLERİ</div>
            ${generateCapturedPiecesHtml(opponentCaptured)}
        </div>
    `;
    
    elements.capturedPieces.innerHTML = html;
}

/**
 * Yenen taşların HTML'ini oluşturur
 */
function generateCapturedPiecesHtml(pieces) {
    if (!pieces || pieces.length === 0) {
        return '<div class="no-pieces">-</div>';
    }
    
    return pieces.map((piece, index) => `
        <div class="captured-piece team-${piece.team} ${piece.type === 'king' ? 'king' : ''}"
             style="transform: rotate(${index * 5}deg) translateX(${index * 3}px);"
             title="${piece.team === 'A' ? 'Kırmızı' : 'Mavi'} ${piece.type === 'king' ? 'Dama' : 'Taş'}">
        </div>
    `).join('');
}

/**
 * Hamle geçmişini günceller
 */
function updateMoveHistory() {
    if (!elements.moveHistory || !gameState.moveHistory) return;
    
    const history = gameState.moveHistory.slice(-10); // Son 10 hamle
    
    let html = '<h3><i class="fas fa-history"></i> HAMLE GEÇMİŞİ</h3>';
    
    if (history.length === 0) {
        html += '<div class="no-history">Hamle yok</div>';
    } else {
        html += history.map((move, index) => `
            <div class="history-item">
                <span class="history-number">${index + 1}.</span>
                <span class="history-player">${move.player}</span>
                <span class="history-move">${formatMove(move)}</span>
            </div>
        `).join('');
    }
    
    elements.moveHistory.innerHTML = html;
}

/**
 * Hamleyi formatlar
 */
function formatMove(move) {
    if (move.moves && move.moves.length > 0) {
        return move.moves.map(m => {
            const from = String.fromCharCode(97 + m.from[1]) + (8 - m.from[0]);
            const to = String.fromCharCode(97 + m.to[1]) + (8 - m.to[0]);
            return `${from}→${to}`;
        }).join(' ');
    }
    
    if (move.move) {
        const from = String.fromCharCode(97 + move.move.from[1]) + (8 - move.move.from[0]);
        const to = String.fromCharCode(97 + move.move.to[1]) + (8 - move.move.to[0]);
        return `${from}→${to}`;
    }
    
    return '-';
}

/**
 * Son hamleyi vurgular
 */
function highlightLastMove(lastMove) {
    // Vurgulamayı temizle
    document.querySelectorAll('.square').forEach(sq => {
        sq.classList.remove('last-move-from', 'last-move-to');
    });
    
    if (!lastMove) return;
    
    const from = lastMove.from;
    const to = lastMove.to;
    
    if (from) {
        const fromSquare = document.querySelector(`[data-row="${from[0]}"][data-col="${from[1]}"]`);
        if (fromSquare) fromSquare.classList.add('last-move-from');
    }
    
    if (to) {
        const toSquare = document.querySelector(`[data-row="${to[0]}"][data-col="${to[1]}"]`);
        if (toSquare) toSquare.classList.add('last-move-to');
    }
}

/**
 * Kazananı gösterir
 */
function showWinner(data) {
    if (!elements.winnerText || !elements.gameOverlay) return;
    
    const winner = data.winner;
    const reason = data.reason || 'no_pieces';
    const stats = data.stats || {};
    
    const teamName = winner === 'A' ? '🔴 KIRMIZI' : '🔵 MAVİ';
    const winnerText = winner === myTeam ? 'TEBRİKLER! KAZANDIN!' : 'ÜZGÜNÜM, KAYBETTİN';
    
    let reasonText = '';
    switch (reason) {
        case 'no_pieces':
            reasonText = 'Tüm taşlar bitti';
            break;
        case 'no_moves':
            reasonText = 'Hamle yapacak taş kalmadı';
            break;
        default:
            reasonText = 'Oyun sona erdi';
    }
    
    let statsHtml = '';
    if (stats.duration) {
        const minutes = Math.floor(stats.duration / 60);
        const seconds = stats.duration % 60;
        statsHtml = `
            <div class="game-stats">
                <div class="stat-box">
                    <div class="stat-value">${stats.moveCount || 0}</div>
                    <div class="stat-label">HAMLE</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${minutes}:${seconds.toString().padStart(2, '0')}</div>
                    <div class="stat-label">SÜRE</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${stats.capturedA || 0} - ${stats.capturedB || 0}</div>
                    <div class="stat-label">YEME</div>
                </div>
            </div>
        `;
    }
    
    elements.winnerText.innerHTML = `
        <span class="winner-team">${teamName}</span>
        <span class="winner-message">${winnerText}</span>
        <span class="winner-reason">${reasonText}</span>
    `;
    
    if (statsHtml) {
        elements.gameStats.innerHTML = statsHtml;
    }
    
    elements.gameOverlay.style.display = 'flex';
}

/**
 * Konfeti efekti oluşturur
 */
function createConfetti() {
    for (let i = 0; i < 60; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.animationDelay = Math.random() * 2 + 's';
            confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
            confetti.style.width = Math.random() * 10 + 5 + 'px';
            confetti.style.height = confetti.style.width;
            document.body.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 4000);
        }, i * 30);
    }
}

// =========================================
// GLOBAL FONKSİYONLAR
// =========================================
window.updateTurnInfo = updateTurnInfo;
window.updatePlayersList = updatePlayersList;
window.updateGameStatus = updateGameStatus;
window.updateCapturedPieces = updateCapturedPieces;
window.updateMoveHistory = updateMoveHistory;
window.showWinner = showWinner;
window.createConfetti = createConfetti;