const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const DB_FILE = 'database.json';

// Загружаем базу данных при запуске
let playersDB = {};
if (fs.existsSync(DB_FILE)) {
    try { playersDB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) {}
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(playersDB, null, 2));
}

let onlineCount = 0;

io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);
    onlineCount++;
    io.emit('playerConnected');

    socket.on('playerMove', (data) => {
        socket.broadcast.emit('opponentMove', { id: socket.id, ...data });
    });

    socket.on('chatMessage', (data) => {
        io.emit('chatMessage', data);
    });

    // Сохранение прогресса
    socket.on('saveData', (data) => {
        if (data.nick) {
            playersDB[data.nick] = {
                money: data.money,
                metal: data.metal,
                best: data.best,
                device: data.device,
                ownedBikes: data.ownedBikes
            };
            saveDB();
        }
    });

    // Загрузка прогресса
    socket.on('getData', (nick) => {
        if (playersDB[nick]) {
            socket.emit('loadDataFromServer', playersDB[nick]);
        }
    });

    // Админка: запрос всех игроков
    socket.on('adminGetAll', () => {
        const playersList = Object.keys(playersDB).map(nick => ({
            nick: nick,
            money: playersDB[nick].money,
            device: playersDB[nick].device || 'Неизвестно'
        }));
        socket.emit('adminGetAllResult', playersList);
    });

    socket.on('disconnect', () => {
        onlineCount = Math.max(0, onlineCount - 1);
        io.emit('playerDisconnected');
        console.log('Игрок отключился');
    });
});

const PORT = process.env.PORT || 3000;
// ВАЖНО: '0.0.0.0' нужен для работы на Render!
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
