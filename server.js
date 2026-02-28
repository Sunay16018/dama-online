const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const rooms = {};
const users = {}; // { socketId: username }

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createInitialBoard() {
    const board = Array(8).fill().map(() => Array(8).fill(null));
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 === 1) {
                board[row][col] = { team: 'A', type: 'normal' };
            }
        }
    }
    for (let row = 5; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 === 1) {
                board[row][col] = { team: 'B', type: 'normal' };
            }
        }
    }
    return board;
}

function getCaptureMoves(board, row, col, team, isKing) {
    const moves = [];
    const directions = isKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : (team === 'A' ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]]);
    
    for (const [dr, dc] of directions) {
        const nr = row + dr;
        const nc = col + dc;
        const jumpRow = row + dr*2;
        const jumpCol = col + dc*2;
        
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && 
            jumpRow >= 0 && jumpRow < 8 && jumpCol >= 0 && jumpCol < 8) {
            const target = board[nr][nc];
            if (target && target.team !== team && !board[jumpRow][jumpCol]) {
                moves.push({
                    from: [row, col],
                    to: [jumpRow, jumpCol],
                    capture: [nr, nc]
                });
            }
        }
    }
    return moves;
}

function getNormalMoves(board, row, col, team, isKing) {
    const moves = [];
    const directions = isKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : (team === 'A' ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]]);
    
    for (const [dr, dc] of directions) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && !board[nr][nc]) {
            moves.push({
                from: [row, col],
                to: [nr, nc]
            });
        }
    }
    return moves;
}

function applyMove(board, fromRow, fromCol, toRow, toCol, capturePos) {
    const newBoard = JSON.parse(JSON.stringify(board));
    const piece = newBoard[fromRow][fromCol];
    
    newBoard[fromRow][fromCol] = null;
    newBoard[toRow][toCol] = piece;
    
    if (capturePos) {
        const [captureRow, captureCol] = capturePos;
        newBoard[captureRow][captureCol] = null;
    }
    
    if (piece.team === 'A' && toRow === 7) {
        newBoard[toRow][toCol].type = 'king';
    } else if (piece.team === 'B' && toRow === 0) {
        newBoard[toRow][toCol].type = 'king';
    }
    
    return newBoard;
}

function checkWinner(board) {
    let hasA = false, hasB = false;
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece) {
                if (piece.team === 'A') hasA = true;
                if (piece.team === 'B') hasB = true;
            }
        }
    }
    if (!hasA) return 'B';
    if (!hasB) return 'A';
    return null;
}

// Periyodik temizlik
setInterval(() => {
    for (const roomCode in rooms) {
        const room = rooms[roomCode];
        if (room.players.length === 0 && Date.now() - room.createdAt > 3600000) {
            delete rooms[roomCode];
            console.log(`🧹 Boş oda temizlendi: ${roomCode}`);
        }
    }
}, 300000);

io.on('connection', (socket) => {
    console.log('✅ Bağlantı:', socket.id);

    // Kullanıcı adı ayarla
    socket.on('setUsername', (username) => {
        users[socket.id] = username;
        console.log(`👤 Kullanıcı: ${username} (${socket.id})`);
    });

    // Sohbet mesajı
    socket.on('chatMessage', (data) => {
        const username = data.username || users[socket.id] || 'Anonim';
        const message = data.message.substring(0, 200); // 200 karakter sınırı
        
        console.log(`💬 ${username}: ${message}`);
        
        // Global sohbet - herkese gönder
        io.emit('chatMessage', {
            username: username,
            message: message
        });
    });

    socket.on('createRoom', () => {
        try {
            const roomCode = generateRoomCode();
            rooms[roomCode] = {
                players: [{ id: socket.id }],
                board: createInitialBoard(),
                turn: 'A',
                gameStarted: false,
                winner: null,
                capturedA: [],
                capturedB: [],
                createdAt: Date.now()
            };
            socket.join(roomCode);
            socket.emit('roomCreated', roomCode);
            console.log(`🆕 Oda oluşturuldu: ${roomCode} - ${socket.id}`);
        } catch (err) {
            console.error('Hata:', err);
            socket.emit('error', 'Oda oluşturulamadı');
        }
    });

    socket.on('joinRoom', (roomCode) => {
        try {
            roomCode = roomCode.toUpperCase();
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', 'Oda bulunamadı');
                return;
            }
            if (room.players.length >= 2) {
                socket.emit('error', 'Oda dolu');
                return;
            }

            socket.join(roomCode);
            
            const existingIndex = room.players.findIndex(p => p.id === socket.id);
            if (existingIndex === -1) {
                room.players.push({ id: socket.id });
            }
            
            socket.emit('joined', roomCode);

            if (room.players.length === 2 && !room.gameStarted) {
                room.gameStarted = true;
                
                const playerA = room.players[0].id;
                const playerB = room.players[1].id;
                
                io.to(playerA).emit('gameStart', {
                    board: room.board,
                    turn: room.turn,
                    myTeam: 'A',
                    perspective: 'A',
                    capturedA: room.capturedA,
                    capturedB: room.capturedB
                });
                
                io.to(playerB).emit('gameStart', {
                    board: room.board,
                    turn: room.turn,
                    myTeam: 'B',
                    perspective: 'B',
                    capturedA: room.capturedA,
                    capturedB: room.capturedB
                });
                
                console.log(`🎮 Oyun başladı: ${roomCode} - ${playerA} vs ${playerB}`);
            }
        } catch (err) {
            console.error('Hata:', err);
            socket.emit('error', 'Katılma hatası');
        }
    });

    socket.on('makeMove', ({ roomCode, from, to, capture }) => {
        try {
            const room = rooms[roomCode];
            if (!room || !room.gameStarted || room.winner) return;

            const [fromRow, fromCol] = from;
            const [toRow, toCol] = to;
            
            if (capture) {
                const [captureRow, captureCol] = capture;
                const capturedPiece = room.board[captureRow][captureCol];
                
                if (capturedPiece) {
                    if (capturedPiece.team === 'A') {
                        room.capturedB.push(capturedPiece);
                    } else {
                        room.capturedA.push(capturedPiece);
                    }
                }
            }
            
            room.board = applyMove(room.board, fromRow, fromCol, toRow, toCol, capture);
            
            room.turn = room.turn === 'A' ? 'B' : 'A';
            
            const winner = checkWinner(room.board);
            if (winner) {
                room.winner = winner;
            }
            
            const playerA = room.players[0].id;
            const playerB = room.players[1].id;
            
            const updateData = {
                board: room.board,
                turn: room.turn,
                capturedA: room.capturedA,
                capturedB: room.capturedB,
                lastMove: { from, to, capture }
            };
            
            if (winner) {
                io.to(roomCode).emit('gameOver', { winner, ...updateData });
                console.log(`🏁 Oyun bitti: ${roomCode} - Kazanan: ${winner}`);
            } else {
                io.to(playerA).emit('updateBoard', { ...updateData, perspective: 'A' });
                io.to(playerB).emit('updateBoard', { ...updateData, perspective: 'B' });
            }
        } catch (err) {
            console.error('Hamle hatası:', err);
        }
    });

    socket.on('getPossibleMoves', ({ roomCode, row, col, team }) => {
        try {
            const room = rooms[roomCode];
            if (!room) return;
            
            const piece = room.board[row][col];
            if (!piece || piece.team !== team) return;
            
            const isKing = piece.type === 'king';
            
            const captures = getCaptureMoves(room.board, row, col, team, isKing);
            const normalMoves = getNormalMoves(room.board, row, col, team, isKing);
            
            socket.emit('possibleMoves', {
                captures,
                normalMoves
            });
        } catch (err) {
            console.error('Hamle hesaplama hatası:', err);
        }
    });

    socket.on('playAgain', (roomCode) => {
        try {
            const room = rooms[roomCode];
            if (!room) return;
            
            room.board = createInitialBoard();
            room.turn = 'A';
            room.winner = null;
            room.capturedA = [];
            room.capturedB = [];
            room.gameStarted = true;
            
            const playerA = room.players[0].id;
            const playerB = room.players[1].id;
            
            io.to(playerA).emit('gameStart', {
                board: room.board,
                turn: room.turn,
                myTeam: 'A',
                perspective: 'A',
                capturedA: [],
                capturedB: []
            });
            
            io.to(playerB).emit('gameStart', {
                board: room.board,
                turn: room.turn,
                myTeam: 'B',
                perspective: 'B',
                capturedA: [],
                capturedB: []
            });
            
            console.log(`🔄 Yeniden başladı: ${roomCode}`);
        } catch (err) {
            console.error('Yeniden başlatma hatası:', err);
        }
    });

    socket.on('disconnect', () => {
        const username = users[socket.id] || 'Bilinmeyen';
        console.log(`❌ Ayrıldı: ${username} (${socket.id})`);
        
        // Kullanıcıyı sil
        delete users[socket.id];
        
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(roomCode).emit('playerLeft', socket.id);
                
                if (room.players.length === 0) {
                    setTimeout(() => {
                        if (rooms[roomCode] && rooms[roomCode].players.length === 0) {
                            delete rooms[roomCode];
                            console.log(`🗑️ Boş oda silindi: ${roomCode}`);
                        }
                    }, 60000);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu http://0.0.0.0:${PORT} adresinde çalışıyor...`);
    console.log(`📊 Health check: http://0.0.0.0:${PORT}/health`);
});
