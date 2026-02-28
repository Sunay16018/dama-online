const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const responseTime = require('response-time');
const favicon = require('serve-favicon');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ===== GÜVENLİK VE PERFORMANS MIDDLEWARELARI =====
app.use(compression({ level: 9, threshold: 0 }));
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "wss:", "ws:"]
        }
    }
}));
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://online-dama.onrender.com', 'https://www.online-dama.onrender.com']
        : '*',
    credentials: true
}));
app.use(responseTime());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Çok fazla istek gönderdiniz, lütfen biraz bekleyin.',
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);

// Slow down
const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 50,
    delayMs: (hits) => hits * 100
});
app.use(speedLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(favicon(path.join(__dirname, 'public', 'images', 'favicon.ico')));

// Statik dosyalar için cache
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '30d',
    etag: true,
    lastModified: true,
    immutable: true,
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (path.match(/\.(png|jpg|jpeg|gif|ico|svg)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ['https://online-dama.onrender.com', 'https://www.online-dama.onrender.com']
            : "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    maxHttpBufferSize: 1e6,
    allowEIO3: true,
    perMessageDeflate: {
        threshold: 1024,
        zlibInflate: true,
        zlibDeflate: true,
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        clientMaxWindowBits: 10,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10
    }
});

app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'manifest.json'), {
        maxAge: '1d',
        headers: {
            'Content-Type': 'application/manifest+json'
        }
    });
});

app.get('/service-worker.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'service-worker.js'), {
        maxAge: '1d',
        headers: {
            'Content-Type': 'application/javascript',
            'Service-Worker-Allowed': '/'
        }
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        cwd: process.cwd(),
        env: process.env.NODE_ENV,
        connections: {
            onlineUsers: onlineUsers,
            activeRooms: Object.keys(rooms).length,
            totalConnections: totalConnections,
            maxConnections: maxConnections
        }
    });
});

app.get('/stats', (req, res) => {
    res.status(200).json({
        users: Array.from(users.values()).map(u => ({
            username: u.username,
            onlineTime: Math.floor((Date.now() - u.joinTime) / 1000),
            idle: Math.floor((Date.now() - u.lastActivity) / 1000)
        })),
        rooms: Object.keys(rooms).map(code => ({
            code,
            players: rooms[code].players.map(p => p.username),
            gameStarted: rooms[code].gameStarted,
            turn: rooms[code].turn,
            moveCount: rooms[code].moveHistory?.length || 0,
            duration: rooms[code].startTime ? Math.floor((Date.now() - rooms[code].startTime) / 1000) : 0
        }))
    });
});

const rooms = {};
const users = new Map();
let onlineUsers = 0;
let totalConnections = 0;
let maxConnections = 0;
const ROOM_TIMEOUT = 3600000;
const USER_TIMEOUT = 300000;

setInterval(() => {
    const now = Date.now();
    
    Object.keys(rooms).forEach(roomCode => {
        const room = rooms[roomCode];
        if (room.players.length === 0 && (now - room.createdAt) > ROOM_TIMEOUT) {
            delete rooms[roomCode];
            console.log(`🧹 Boş oda temizlendi: ${roomCode}`);
        }
    });
    
    users.forEach((data, socketId) => {
        if ((now - data.lastActivity) > USER_TIMEOUT) {
            users.delete(socketId);
            console.log(`🧹 Pasif kullanıcı temizlendi: ${socketId}`);
        }
    });
}, 300000);

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms[code]);
    return code;
}

function createInitialBoard() {
    const board = Array(8).fill().map(() => Array(8).fill(null));
    
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 === 1) {
                board[row][col] = {
                    team: 'A',
                    type: 'normal',
                    id: `A-${row}-${col}-${Date.now()}-${Math.random().toString(36)}`
                };
            }
        }
    }
    
    for (let row = 5; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 === 1) {
                board[row][col] = {
                    team: 'B',
                    type: 'normal',
                    id: `B-${row}-${col}-${Date.now()}-${Math.random().toString(36)}`
                };
            }
        }
    }
    
    return board;
}

function getKingMoves(board, row, col, team) {
    const moves = [];
    const directions = [[-1,-1], [-1,1], [1,-1], [1,1]];
    
    for (const [dr, dc] of directions) {
        let captureFound = false;
        
        for (let step = 1; step < 8; step++) {
            const nr = row + dr * step;
            const nc = col + dc * step;
            
            if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;
            
            const target = board[nr][nc];
            
            if (!target && !captureFound) {
                moves.push({
                    from: [row, col],
                    to: [nr, nc],
                    type: 'move',
                    pieceId: board[row][col]?.id
                });
            } else if (target && target.team !== team && !captureFound) {
                const jumpRow = nr + dr;
                const jumpCol = nc + dc;
                
                if (jumpRow >= 0 && jumpRow < 8 && jumpCol >= 0 && jumpCol < 8 && !board[jumpRow][jumpCol]) {
                    moves.push({
                        from: [row, col],
                        to: [jumpRow, jumpCol],
                        capture: [nr, nc],
                        type: 'capture',
                        pieceId: board[row][col]?.id,
                        capturedId: target.id
                    });
                    captureFound = true;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }
    
    return moves;
}

function getNormalMoves(board, row, col, team) {
    const moves = [];
    const directions = team === 'A' ? [[1,-1], [1,1]] : [[-1,-1], [-1,1]];
    
    for (const [dr, dc] of directions) {
        const nr = row + dr;
        const nc = col + dc;
        
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && !board[nr][nc]) {
            moves.push({
                from: [row, col],
                to: [nr, nc],
                type: 'move',
                pieceId: board[row][col]?.id
            });
        }
    }
    
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
                    capture: [nr, nc],
                    type: 'capture',
                    pieceId: board[row][col]?.id,
                    capturedId: target.id
                });
            }
        }
    }
    
    return moves;
}

function getAllCaptureSequences(board, row, col, team, isKing, sequence = [], visited = new Set()) {
    const pieceId = board[row][col]?.id;
    if (visited.has(pieceId)) return [];
    visited.add(pieceId);
    
    const currentBoard = sequence.length === 0 ? board : sequence[sequence.length-1].newBoard;
    const currentRow = sequence.length === 0 ? row : sequence[sequence.length-1].to[0];
    const currentCol = sequence.length === 0 ? col : sequence[sequence.length-1].to[1];
    
    let moves;
    if (isKing) {
        moves = getKingMoves(currentBoard, currentRow, currentCol, team)
            .filter(m => m.type === 'capture');
    } else {
        moves = getNormalMoves(currentBoard, currentRow, currentCol, team)
            .filter(m => m.type === 'capture');
    }
    
    if (moves.length === 0) {
        visited.delete(pieceId);
        return sequence.length > 0 ? [sequence] : [];
    }
    
    let results = [];
    for (const move of moves) {
        const newBoard = JSON.parse(JSON.stringify(currentBoard));
        const piece = newBoard[currentRow][currentCol];
        
        newBoard[currentRow][currentCol] = null;
        newBoard[move.to[0]][move.to[1]] = piece;
        newBoard[move.capture[0]][move.capture[1]] = null;
        
        if (!isKing && ((team === 'A' && move.to[0] === 7) || (team === 'B' && move.to[0] === 0))) {
            newBoard[move.to[0]][move.to[1]].type = 'king';
        }
        
        const newSequence = [...sequence, { 
            ...move, 
            newBoard,
            capturedId: move.capturedId 
        }];
        
        const nextCaptures = getAllCaptureSequences(
            newBoard, move.to[0], move.to[1], team, 
            isKing || newBoard[move.to[0]][move.to[1]].type === 'king',
            newSequence,
            new Set(visited)
        );
        
        if (nextCaptures.length > 0) {
            results.push(...nextCaptures);
        } else {
            results.push(newSequence);
        }
    }
    
    visited.delete(pieceId);
    
    const maxLength = Math.max(...results.map(r => r.length));
    return results.filter(r => r.length === maxLength);
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
    let aPieces = 0, bPieces = 0;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece) {
                if (piece.team === 'A') {
                    hasA = true;
                    aPieces++;
                }
                if (piece.team === 'B') {
                    hasB = true;
                    bPieces++;
                }
            }
        }
    }
    
    if (!hasA) return { winner: 'B', reason: 'no_pieces', aPieces, bPieces };
    if (!hasB) return { winner: 'A', reason: 'no_pieces', aPieces, bPieces };
    
    let aHasMoves = false, bHasMoves = false;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece) {
                const moves = piece.type === 'king' 
                    ? getKingMoves(board, row, col, piece.team)
                    : getNormalMoves(board, row, col, piece.team);
                
                if (moves.length > 0) {
                    if (piece.team === 'A') aHasMoves = true;
                    else bHasMoves = true;
                }
            }
        }
    }
    
    if (!aHasMoves) return { winner: 'B', reason: 'no_moves', aPieces, bPieces };
    if (!bHasMoves) return { winner: 'A', reason: 'no_moves', aPieces, bPieces };
    
    return null;
}

io.on('connection', (socket) => {
    console.log('✅ Yeni bağlantı:', socket.id, 'IP:', socket.handshake.address);
    
    onlineUsers++;
    totalConnections++;
    maxConnections = Math.max(maxConnections, onlineUsers);
    
    users.set(socket.id, {
        username: `Oyuncu-${Math.floor(Math.random() * 10000) + 1}`,
        lastActivity: Date.now(),
        ip: socket.handshake.address,
        joinTime: Date.now(),
        userAgent: socket.handshake.headers['user-agent'],
        language: socket.handshake.headers['accept-language']
    });
    
    io.emit('onlineCount', { 
        count: onlineUsers, 
        users: Array.from(users.values()).map(u => u.username),
        max: maxConnections,
        total: totalConnections
    });

    socket.on('setUsername', (username) => {
        const user = users.get(socket.id);
        if (user) {
            const oldName = user.username;
            user.username = username.substring(0, 20);
            user.lastActivity = Date.now();
            console.log(`👤 İsim değişikliği: ${oldName} -> ${user.username}`);
            
            io.emit('userUpdate', {
                id: socket.id,
                username: user.username,
                oldName,
                timestamp: Date.now()
            });
        }
    });

    socket.on('chatMessage', (data) => {
        const user = users.get(socket.id);
        if (!user) return;
        
        user.lastActivity = Date.now();
        
        const message = data.message
            .substring(0, 200)
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .trim();
        
        if (!message) return;
        
        console.log(`💬 ${user.username}: ${message}`);
        
        io.emit('chatMessage', {
            id: Date.now() + '-' + socket.id + '-' + Math.random().toString(36),
            username: user.username,
            message: message,
            userId: socket.id,
            timestamp: Date.now(),
            color: user.username === 'Admin' ? 'gold' : undefined
        });
    });

    socket.on('createRoom', () => {
        try {
            const user = users.get(socket.id);
            if (!user) return;
            
            user.lastActivity = Date.now();
            
            const roomCode = generateRoomCode();
            rooms[roomCode] = {
                code: roomCode,
                players: [{ 
                    id: socket.id, 
                    username: user.username,
                    joinTime: Date.now()
                }],
                board: createInitialBoard(),
                turn: 'A',
                gameStarted: false,
                winner: null,
                capturedA: [],
                capturedB: [],
                createdAt: Date.now(),
                lastMove: null,
                moveHistory: [],
                messages: []
            };
            
            socket.join(roomCode);
            socket.emit('roomCreated', { 
                roomCode, 
                message: 'Oda başarıyla oluşturuldu',
                createdAt: Date.now(),
                players: [user.username]
            });
            
            console.log(`🆕 Oda oluşturuldu: ${roomCode} - ${user.username}`);
        } catch (err) {
            console.error('Oda oluşturma hatası:', err);
            socket.emit('error', { message: 'Oda oluşturulamadı', code: 'CREATE_ERROR' });
        }
    });

    socket.on('joinRoom', (roomCode) => {
        try {
            const user = users.get(socket.id);
            if (!user) return;
            
            user.lastActivity = Date.now();
            roomCode = roomCode.toUpperCase();
            
            const room = rooms[roomCode];
            if (!room) {
                socket.emit('error', { message: 'Oda bulunamadı', code: 'ROOM_NOT_FOUND' });
                return;
            }
            
            if (room.players.length >= 2) {
                socket.emit('error', { message: 'Oda dolu', code: 'ROOM_FULL' });
                return;
            }
            
            if (room.gameStarted) {
                socket.emit('error', { message: 'Oyun zaten başlamış', code: 'GAME_STARTED' });
                return;
            }

            socket.join(roomCode);
            
            if (!room.players.find(p => p.id === socket.id)) {
                room.players.push({ 
                    id: socket.id, 
                    username: user.username,
                    joinTime: Date.now()
                });
            }
            
            socket.emit('joined', { 
                roomCode, 
                message: 'Odaya başarıyla katıldınız',
                players: room.players.map(p => p.username)
            });

            if (room.players.length === 2 && !room.gameStarted) {
                room.gameStarted = true;
                room.startTime = Date.now();
                
                const playerA = room.players[0].id;
                const playerB = room.players[1].id;
                
                const gameStartData = {
                    board: room.board,
                    turn: room.turn,
                    capturedA: room.capturedA,
                    capturedB: room.capturedB,
                    players: room.players.map(p => p.username),
                    startTime: room.startTime,
                    roomCode: roomCode
                };
                
                io.to(playerA).emit('gameStart', { 
                    ...gameStartData, 
                    myTeam: 'A', 
                    perspective: 'A' 
                });
                
                io.to(playerB).emit('gameStart', { 
                    ...gameStartData, 
                    myTeam: 'B', 
                    perspective: 'B' 
                });
                
                console.log(`🎮 Oyun başladı: ${roomCode} - ${room.players[0].username} vs ${room.players[1].username}`);
            }
        } catch (err) {
            console.error('Odaya katılma hatası:', err);
            socket.emit('error', { message: 'Odaya katılamadı', code: 'JOIN_ERROR' });
        }
    });

    socket.on('getPossibleMoves', ({ roomCode, row, col }) => {
        try {
            const room = rooms[roomCode];
            if (!room) return;
            
            const user = users.get(socket.id);
            if (!user) return;
            
            user.lastActivity = Date.now();
            
            const piece = room.board[row][col];
            if (!piece) return;
            
            const isKing = piece.type === 'king';
            
            let moves;
            if (isKing) {
                moves = getKingMoves(room.board, row, col, piece.team);
            } else {
                moves = getNormalMoves(room.board, row, col, piece.team);
            }
            
            const captures = moves.filter(m => m.type === 'capture');
            const normalMoves = moves.filter(m => m.type === 'move');
            
            let captureSequences = [];
            if (captures.length > 0) {
                captureSequences = getAllCaptureSequences(
                    room.board, row, col, piece.team, isKing
                );
            }
            
            socket.emit('possibleMoves', {
                normalMoves,
                captures,
                captureSequences,
                pieceId: piece.id,
                isKing,
                timestamp: Date.now()
            });
        } catch (err) {
            console.error('Hamle hesaplama hatası:', err);
        }
    });

    socket.on('makeMove', ({ roomCode, from, to, capture, sequence }) => {
        try {
            const room = rooms[roomCode];
            if (!room || !room.gameStarted || room.winner) return;
            
            const user = users.get(socket.id);
            if (!user) return;
            
            user.lastActivity = Date.now();

            let currentBoard = room.board;
            const moveRecord = {
                player: user.username,
                playerId: socket.id,
                timestamp: Date.now(),
                moveNumber: room.moveHistory.length + 1
            };
            
            if (sequence && sequence.length > 0) {
                for (const move of sequence) {
                    const [fromRow, fromCol] = move.from;
                    const [toRow, toCol] = move.to;
                    
                    if (move.capture) {
                        const [captureRow, captureCol] = move.capture;
                        const capturedPiece = currentBoard[captureRow][captureCol];
                        if (capturedPiece) {
                            if (capturedPiece.team === 'A') {
                                room.capturedB.push({ 
                                    ...capturedPiece, 
                                    capturedAt: Date.now(),
                                    capturedBy: user.username
                                });
                            } else {
                                room.capturedA.push({ 
                                    ...capturedPiece, 
                                    capturedAt: Date.now(),
                                    capturedBy: user.username
                                });
                            }
                        }
                    }
                    
                    currentBoard = applyMove(currentBoard, fromRow, fromCol, toRow, toCol, move.capture);
                    moveRecord.moves = moveRecord.moves || [];
                    moveRecord.moves.push(move);
                }
            } else {
                if (capture) {
                    const [captureRow, captureCol] = capture;
                    const capturedPiece = currentBoard[captureRow][captureCol];
                    if (capturedPiece) {
                        if (capturedPiece.team === 'A') {
                            room.capturedB.push({ 
                                ...capturedPiece, 
                                capturedAt: Date.now(),
                                capturedBy: user.username
                            });
                        } else {
                            room.capturedA.push({ 
                                ...capturedPiece, 
                                capturedAt: Date.now(),
                                capturedBy: user.username
                            });
                        }
                    }
                }
                
                const [fromRow, fromCol] = from;
                const [toRow, toCol] = to;
                currentBoard = applyMove(currentBoard, fromRow, fromCol, toRow, toCol, capture);
                moveRecord.move = { from, to, capture };
            }
            
            room.board = currentBoard;
            room.lastMove = { from, to, capture, sequence, timestamp: Date.now() };
            room.moveHistory.push(moveRecord);
            
            room.turn = room.turn === 'A' ? 'B' : 'A';
            
            const winner = checkWinner(room.board);
            if (winner) {
                room.winner = winner.winner;
                room.endTime = Date.now();
                room.winnerReason = winner.reason;
            }
            
            const playerA = room.players[0].id;
            const playerB = room.players[1].id;
            
            const updateData = {
                board: room.board,
                turn: room.turn,
                capturedA: room.capturedA,
                capturedB: room.capturedB,
                lastMove: { from, to, capture, sequence },
                moveHistory: room.moveHistory.slice(-10),
                timestamp: Date.now()
            };
            
            if (winner) {
                io.to(roomCode).emit('gameOver', { 
                    winner: winner.winner, 
                    reason: winner.reason,
                    stats: {
                        aPieces: winner.aPieces,
                        bPieces: winner.bPieces,
                        duration: Math.floor((room.endTime - room.startTime) / 1000),
                        moveCount: room.moveHistory.length,
                        capturedA: room.capturedA.length,
                        capturedB: room.capturedB.length,
                        startTime: room.startTime,
                        endTime: room.endTime
                    },
                    players: room.players.map(p => p.username),
                    ...updateData 
                });
                console.log(`🏁 Oyun bitti: ${roomCode} - Kazanan: ${winner.winner} (${winner.reason})`);
            } else {
                io.to(playerA).emit('updateBoard', { ...updateData, perspective: 'A' });
                io.to(playerB).emit('updateBoard', { ...updateData, perspective: 'B' });
            }
        } catch (err) {
            console.error('Hamle hatası:', err);
        }
    });

    socket.on('playAgain', (roomCode) => {
        try {
            const room = rooms[roomCode];
            if (!room) return;
            
            const user = users.get(socket.id);
            if (!user) return;
            
            user.lastActivity = Date.now();
            
            room.board = createInitialBoard();
            room.turn = 'A';
            room.winner = null;
            room.capturedA = [];
            room.capturedB = [];
            room.gameStarted = true;
            room.startTime = Date.now();
            room.moveHistory = [];
            
            const playerA = room.players[0].id;
            const playerB = room.players[1].id;
            
            const gameStartData = {
                board: room.board,
                turn: room.turn,
                capturedA: [],
                capturedB: [],
                players: room.players.map(p => p.username),
                startTime: room.startTime,
                roomCode
            };
            
            io.to(playerA).emit('gameStart', { 
                ...gameStartData, 
                myTeam: 'A', 
                perspective: 'A' 
            });
            
            io.to(playerB).emit('gameStart', { 
                ...gameStartData, 
                myTeam: 'B', 
                perspective: 'B' 
            });
            
            console.log(`🔄 Oyun yeniden başladı: ${roomCode}`);
        } catch (err) {
            console.error('Yeniden başlatma hatası:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ Bağlantı koptu:', socket.id);
        
        const user = users.get(socket.id);
        users.delete(socket.id);
        onlineUsers--;
        
        io.emit('onlineCount', { 
            count: onlineUsers, 
            users: Array.from(users.values()).map(u => u.username),
            disconnected: user?.username,
            timestamp: Date.now()
        });
        
        Object.keys(rooms).forEach(roomCode => {
            const room = rooms[roomCode];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                
                io.to(roomCode).emit('playerLeft', {
                    playerId: socket.id,
                    username: player?.username,
                    remainingPlayers: room.players.length,
                    timestamp: Date.now()
                });
                
                if (room.players.length === 0) {
                    setTimeout(() => {
                        if (rooms[roomCode] && rooms[roomCode].players.length === 0) {
                            delete rooms[roomCode];
                            console.log(`🗑️ Boş oda silindi: ${roomCode}`);
                        }
                    }, 60000);
                }
                
                console.log(`👋 Oyuncu ayrıldı: ${roomCode} - ${player?.username}`);
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log(`🚀 Sunucu http://localhost:${PORT} adresinde çalışıyor`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📱 PWA manifest: http://localhost:${PORT}/manifest.json`);
    console.log(`📈 Stats: http://localhost:${PORT}/stats`);
    console.log(`🛡️  Güvenlik: Aktif`);
    console.log(`⚡ Performans: Maksimum`);
    console.log(`🌐 Ortam: ${process.env.NODE_ENV || 'development'}`);
    console.log('='.repeat(60));
});

process.on('uncaughtException', (err) => {
    console.error('❌ Yakalanmamış hata:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ İşlenmeyen red:', reason);
});

process.on('SIGTERM', () => {
    console.log('📴 SIGTERM sinyali alındı, sunucu kapatılıyor...');
    server.close(() => {
        console.log('✅ Sunucu kapatıldı');
        process.exit(0);
    });
});