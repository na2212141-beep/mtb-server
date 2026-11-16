const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Redis } = require('@upstash/redis');

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

    // === ЗАГРУЗКА ДАННЫХ ИГРОКА ===
    socket.on('getData', async (nick) => {
        try {
            let playerData = await redis.get(`player:${nick}`);
            if (!playerData) {
                playerData = {
                    nick: nick, money: 0, metal: 0, best: 0, isDevMode: false, superBikeUnlocked: false,
                    ownedBikes: [1,0,0,0,0,0,0,0,0,0,0,0],
                    gear: {helmet:'#fc0', jersey:'#e33', pants:'#222', chest:false, fox:false, rbHelmet:false, rbChest:false, hatType:'rider'},
                    unlocked: {foxHelmet:false, foxChest:false, foxPants:false, rbHelmet:false, rbChest:false}
                };
                await redis.set(`player:${nick}`, JSON.stringify(playerData));
            } else {
                if (typeof playerData === 'string') playerData = JSON.parse(playerData);
            }
            socket.emit('loadDataFromServer', playerData);
        } catch (e) { console.log('Ошибка загрузки:', e); }
    });

    // === СОХРАНЕНИЕ ДАННЫХ И ТОП-3 ===
    socket.on('saveData', async (data) => {
        try {
            await redis.set(`player:${data.nick}`, JSON.stringify(data));
            
            if (data.ownedBikes && data.ownedBikes[10] === 1) {
                let top3 = await redis.get('global:mtb_top3');
                if (!top3) top3 = [];
                else if (typeof top3 === 'string') top3 = JSON.parse(top3);
                
                if (!top3.includes(data.nick) && top3.length < 3) {
                    top3.push(data.nick);
                    await redis.set('global:mtb_top3', JSON.stringify(top3));
                    console.log(`🏆 Новый владелец MTB 2016-12: ${data.nick}`);
                }
            }
        } catch (e) { console.log('Ошибка сохранения:', e); }
    });

    // === РЕКОРДЫ ===
    socket.on('getRecords', async () => {
        try {
            let top3 = await redis.get('global:mtb_top3') || [];
            if (typeof top3 === 'string') top3 = JSON.parse(top3);
            socket.emit('recordsData', { mtbTop3: top3 });
        } catch (e) { console.log('Ошибка рекордов:', e); }
    });

    // === ДУЭЛИ ===
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

    // === АДМИНКА ===
    socket.on('adminWipeSuperBike', async () => {
        try {
            const keys = await redis.keys('player:*');
            for (let key of keys) {
                let p = await redis.get(key);
                if (p) {
                    if (typeof p === 'string') p = JSON.parse(p);
                    if (p.ownedBikes) p.ownedBikes[11] = 0;
                    p.superBikeUnlocked = false;
                    await redis.set(key, JSON.stringify(p));
                }
            }
            io.emit('superBikeWiped'); 
        } catch (e) { console.log(e); }
    });

    // === ДВИЖЕНИЕ И ЧАТ ===
    socket.on('playerMove', (data) => { socket.broadcast.emit('opponentMove', { id: socket.id, ...data }); });
    socket.on('chatMessage', (data) => { io.emit('chatMessage', data); });
    socket.on('releaseAnnouncement', (text) => { io.emit('releaseAnnouncement', text); });

    socket.on('disconnect', () => {
        onlinePlayersCount = Math.max(0, onlinePlayersCount - 1);
        io.emit('playerDisconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
