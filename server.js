const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const DB_FILE = 'database.json';
let playersDB = {};
if (fs.existsSync(DB_FILE)) {
    try { playersDB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) {}
}

function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(playersDB, null, 2)); }

let onlineCount = 0;
let currentReleaseText = "ДОБРО ПОЖАЛОВАТЬ НА РЕЛИЗ MTB FREERIDE!";
let isDevOnStage = false;

// Отслеживаем, кто сейчас онлайн (id -> ник)
let onlinePlayers = {};

io.on('connection', (socket) => {
    onlineCount++;
    io.emit('playerConnected');
    socket.emit('releaseAnnouncement', currentReleaseText);
    socket.emit('stageStatus', isDevOnStage);

    socket.on('playerMove', (data) => {
        if(data.nick) onlinePlayers[socket.id] = data.nick;
        socket.broadcast.emit('opponentMove', { id: socket.id, ...data });
    });

    socket.on('chatMessage', (data) => { io.emit('chatMessage', data); });
    socket.on('releaseAnnouncement', (text) => { currentReleaseText = text; io.emit('releaseAnnouncement', text); });
    socket.on('stageStatus', (status) => { isDevOnStage = status; io.emit('stageStatus', status); });

    // Сохранение прогресса
    socket.on('saveData', (data) => {
        if (data.nick) {
            playersDB[data.nick] = { money: data.money, metal: data.metal, best: data.best, device: data.device, ownedBikes: data.ownedBikes };
            saveDB();
        }
    });

    socket.on('getData', (nick) => {
        if (playersDB[nick]) socket.emit('loadDataFromServer', playersDB[nick]);
    });

    socket.on('adminGetAll', () => {
        const playersList = Object.keys(playersDB).map(nick => ({
            nick: nick, money: playersDB[nick].money, device: playersDB[nick].device || 'Неизвестно'
        }));
        socket.emit('adminGetAllResult', playersList);
    });

    // ===== ДУЭЛЬ =====
    socket.on('sendDuelInvite', (data) => {
        // data = { targetId, fromNick, bet }
        io.to(data.targetId).emit('receiveDuelInvite', { fromId: socket.id, fromNick: data.fromNick, bet: data.bet });
    });

    socket.on('acceptDuel', (data) => {
        // data = { challengerId, bet, challengerNick, accepterNick }
        io.to(data.challengerId).emit('duelStarted', { opponentId: socket.id, isChallenger: true });
        socket.emit('duelStarted', { opponentId: data.challengerId, isChallenger: false });
        
        // Списываем ставки
        if(playersDB[data.challengerNick]) playersDB[data.challengerNick].money -= data.bet;
        if(playersDB[data.accepterNick]) playersDB[data.accepterNick].money -= data.bet;
        saveDB();
    });

    socket.on('duelFinished', (data) => {
        // data = { winnerNick, loserNick, bet }
        if(playersDB[data.winnerNick]) playersDB[data.winnerNick].money += data.bet * 2;
        saveDB();
        
        io.to(data.winnerId).emit('duelResult', { win: true, bet: data.bet });
        io.to(data.loserId).emit('duelResult', { win: false, bet: data.bet });
    });
    // =================

    socket.on('disconnect', () => {
        onlineCount = Math.max(0, onlineCount - 1);
        delete onlinePlayers[socket.id];
        io.emit('playerDisconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { console.log(`Сервер запущен на порту ${PORT}`); });
