const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 24;

const canvas = document.getElementById('tetrisCanvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('nextCanvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('holdCanvas');
const holdCtx = holdCanvas.getContext('2d');

ctx.scale(BLOCK_SIZE, BLOCK_SIZE);
nextCtx.scale(20, 20);
holdCtx.scale(20, 20);

const SHAPES = [
    [],
    [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[2, 0, 0], [2, 2, 2], [0, 0, 0]],
    [[0, 0, 3], [3, 3, 3], [0, 0, 0]],
    [[4, 4], [4, 4]],
    [[0, 5, 5], [5, 5, 0], [0, 0, 0]],
    [[0, 6, 0], [6, 6, 6], [0, 0, 0]],
    [[7, 7, 0], [0, 7, 7], [0, 0, 0]]
];

const COLORS = [
    null,
    '#00f0f0', '#0000f0', '#f0a000', '#f0f000', '#00f000', '#a000f0', '#f00000'
];

let board = createMatrix(COLS, ROWS);
let score = 0;
let lines = 0;
let level = 1;
let highScore = localStorage.getItem('tetris_highscore') || 0;

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;

let isGameOver = false;
let isPaused = false;
let isRunning = false;
let canHold = true;
let audioMuted = false;

let player = { pos: {x: 0, y: 0}, matrix: null, type: 0 };
let nextPieceType = 0;
let holdPieceType = 0;

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
}

function playSound(freq, type = 'sine', duration = 0.1) {
    if (audioMuted || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

function playSoundClear() {
    if (audioMuted || !audioCtx) return;
    [440, 554.37, 659.25, 880].forEach((f, i) => {
        setTimeout(() => playSound(f, 'square', 0.15), i * 80);
    });
}

function createMatrix(w, h) {
    const matrix = [];
    while (h--) matrix.push(new Array(w).fill(0));
    return matrix;
}

function collide(board, player) {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 &&
               (board[y + o.y] === undefined || 
                board[y + o.y][x + o.x] === undefined ||
                board[y + o.y][x + o.x] !== 0)) {
                return true;
            }
        }
    }
    return false;
}

function merge(board, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) board[y + player.pos.y][x + player.pos.x] = value;
        });
    });
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
        }
    }
    if (dir > 0) matrix.forEach(row => row.reverse());
    else matrix.reverse();
}

function rotatePiece(dir = 1) {
    playerRotate(dir);
}

function playerRotate(dir) {
    if (!isRunning || isPaused) return;
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(board, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            rotate(player.matrix, -dir);
            player.pos.x = pos;
            return;
        }
    }
    playSound(400, 'triangle', 0.05);
}

function moveLeft() {
    if (!isRunning || isPaused) return;
    player.pos.x--;
    if (collide(board, player)) player.pos.x++;
    else playSound(300, 'sine', 0.04);
}

function moveRight() {
    if (!isRunning || isPaused) return;
    player.pos.x++;
    if (collide(board, player)) player.pos.x--;
    else playSound(300, 'sine', 0.04);
}

function moveDown() {
    if (!isRunning || isPaused) return;
    player.pos.y++;
    if (collide(board, player)) {
        player.pos.y--;
        lockPiece();
    } else {
        dropCounter = 0;
    }
}

function hardDrop() {
    if (!isRunning || isPaused) return;
    while (!collide(board, player)) player.pos.y++;
    player.pos.y--;
    lockPiece();
    playSound(200, 'square', 0.08);
}

function holdPiece() {
    if (!isRunning || isPaused || !canHold) return;

    if (holdPieceType === 0) {
        holdPieceType = player.type;
        resetPlayer();
    } else {
        const temp = player.type;
        player.type = holdPieceType;
        holdPieceType = temp;
        player.matrix = JSON.parse(JSON.stringify(SHAPES[player.type]));
        player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);
        player.pos.y = 0;
    }

    canHold = false;
    drawSidePanel(holdCtx, holdPieceType);
    playSound(500, 'sine', 0.08);
}

function getRandomPieceType() {
    return Math.floor(Math.random() * 7) + 1;
}

function resetPlayer() {
    if (nextPieceType === 0) nextPieceType = getRandomPieceType();

    player.type = nextPieceType;
    player.matrix = JSON.parse(JSON.stringify(SHAPES[player.type]));
    nextPieceType = getRandomPieceType();

    player.pos.y = 0;
    player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);

    if (collide(board, player)) handleGameOver();

    canHold = true;
    drawSidePanel(nextCtx, nextPieceType);
}

function lockPiece() {
    merge(board, player);
    playSound(150, 'sawtooth', 0.05);
    clearLines();
    resetPlayer();
}

function clearLines() {
    let rowCount = 0;
    outer: for (let y = board.length - 1; y >= 0; --y) {
        for (let x = 0; x < board[y].length; ++x) {
            if (board[y][x] === 0) continue outer;
        }
        const row = board.splice(y, 1)[0].fill(0);
        board.unshift(row);
        ++y;
        rowCount++;
    }

    if (rowCount > 0) {
        const lineScores = [0, 100, 300, 500, 800];
        score += lineScores[rowCount] * level;
        lines += rowCount;
        level = Math.floor(lines / 10) + 1;
        dropInterval = Math.max(100, 1000 - (level - 1) * 85);
        playSoundClear();
        updateUI();
    }
}

function drawBlock(context, x, y, colorIndex) {
    const color = COLORS[colorIndex];
    context.fillStyle = color;
    context.fillRect(x, y, 1, 1);

    context.fillStyle = 'rgba(255, 255, 255, 0.3)';
    context.fillRect(x, y, 1, 0.1);
    context.fillRect(x, y, 0.1, 1);

    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.fillRect(x, y + 0.9, 1, 0.1);
    context.fillRect(x + 0.9, y, 0.1, 1);
}

function drawGhostPiece