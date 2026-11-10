const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

setInterval(() => { io.emit('ping', 'keep-alive'); }, 30000);

io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);
  socket.on('playerMove', (data) => {
    socket.broadcast.emit('opponentMove', { id: socket.id, x: data.x, y: data.y });
  });
  socket.on('disconnect', () => { console.log('Игрок отключился:', socket.id); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { console.log(`Сервер запущен на порту ${PORT}`); });
