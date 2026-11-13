const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Redis } = require('@upstash/redis');

// ТВОИ КЛЮЧИ ИЗ UPSTASH
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://exact-giraffe-199465.upstash.io';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAwspAAIgcDE1OTNiMWYyZjg0NWY0YWI1OTUwNDRlZDc0YjM0ODc5NQ';

const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let onlinePlayersCount = 0;

io.on('connection', (socket) => {
    onlinePlayersCount++;
    io.emit('playerConnected');

    socket.on('getData', async (nick) => {
        try {
            let playerData = await redis.get(`player:${nick}`);
            if (!playerData) {
                playerData = {
                    money: 0, metal: 0, best: 0, isDevMode: false, superBikeUnlocked: false,
                    ownedBikes: [1,0,0,0,0,0,0,0,0,0,0,0,0],
                    gear: {helmet:'#fc0', jersey:'#e33', pants:'#222', chest:false, fox:false, rbHelmet:false, rbChest:false},
                    unlocked: {foxHelmet:false, foxChest:false, foxPants:false, rbHelmet:false, rbChest:false}
                };
                await redis.set(`player:${nick}`, JSON.stringify(playerData));
            } else {
                if (typeof playerData === 'string') playerData = JSON.parse(playerData);
            }
            socket.emit('loadDataFromServer', playerData);
        } catch (e) { console.log('Ошибка загрузки:', e); }
    });

    socket.on('saveData', async (data) => {
        try {
            await redis.set(`player:${data.nick}`, JSON.stringify(data));
        } catch (e) { console.log('Ошибка сохранения:', e); }
    });

    // --- ЛОГИКА ЗАБРАТЬ БАЙК У ВСЕХ ---
    socket.on('adminWipeSuperBike', async () => {
        try {
            const keys = await redis.keys('player:*');
            for (let key of keys) {
                let p = await redis.get(key);
                if (p) {
                    if (typeof p === 'string') p = JSON.parse(p);
                    if (p.ownedBikes) p.ownedBikes[12] = 0; // Удаляем байк
                    p.superBikeUnlocked = false;
                    await redis.set(key, JSON.stringify(p));
                }
            }
            io.emit('superBikeWiped'); // Отправляем всем команду обновить экран
            console.log('⚠ Админ забрал Супер-Байк у всех!');
        } catch (e) { console.log(e); }
    });

    socket.on('playerMove', (data) => {
        socket.broadcast.emit('opponentMove', { id: socket.id, ...data });
    });

    socket.on('chatMessage', (data) => { io.emit('chatMessage', data); });
    socket.on('releaseAnnouncement', (text) => { io.emit('releaseAnnouncement', text); });

    socket.on('sendDuelInvite', (data) => {
        io.to(data.targetId).emit('receiveDuelInvite', { fromId: socket.id, fromNick: data.fromNick, bet: data.bet });
    });

    socket.on('acceptDuel', (data) => {
        io.to(data.challengerId).emit('duelStarted', { opponentId: socket.id, isChallenger: true, bet: data.bet });
        socket.emit('duelStarted', { opponentId: data.challengerId, isChallenger: false, bet: data.bet });
    });

    socket.on('duelFinished', async (data) => {
        try {
            let winnerData = await redis.get(`player:${data.winnerNick}`);
            if (winnerData) {
                if (typeof winnerData === 'string') winnerData = JSON.parse(winnerData);
                winnerData.money += data.bet;
                await redis.set(`player:${data.winnerNick}`, JSON.stringify(winnerData));
            }

            let loserData = await redis.get(`player:${data.loserNick}`);
            if (loserData) {
                if (typeof loserData === 'string') loserData = JSON.parse(loserData);
                loserData.money -= data.bet;
                await redis.set(`player:${data.loserNick}`, JSON.stringify(loserData));
            }

            io.to(data.winnerId).emit('duelResult', { win: true, bet: data.bet });
            io.to(data.loserId).emit('duelResult', { win: false, bet: data.bet });
        } catch (e) { console.log('Ошибка дуэли:', e); }
    });

    socket.on('adminGetAll', async () => {
        try {
            const keys = await redis.keys('player:*'); 
            if (keys.length === 0) return socket.emit('adminGetAllResult', []);
            const players = await redis.mget(...keys);
            const result = players.map(p => {
                let data = typeof p === 'string' ? JSON.parse(p) : p;
                return { nick: data.nick || 'Unknown', money: data.money || 0, device: data.device || 'Unknown' };
            });
            socket.emit('adminGetAllResult', result);
        } catch (e) { console.log(e); }
    });

    socket.on('disconnect', () => {
        onlinePlayersCount = Math.max(0, onlinePlayersCount - 1);
        io.emit('playerDisconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
