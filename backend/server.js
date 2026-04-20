const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const authRoutes = require("./routes/authRoutes");
const roomRoutes = require("./routes/roomRoutes");
const messageRoutes = require("./routes/messageRoutes");
const moderationRoutes = require("./routes/moderationRoutes");

const Message = require("./models/Message");
const ModerationLog = require("./models/ModerationLog");
const { analyzeMessageContent } = require("../ai/moderation/moderationService");

const app = express();
connectDB();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/moderation", moderationRoutes);

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

let roomUsers = {};
let socketToUser = {};

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ roomId, name }) => {
    socket.join(roomId);
    socketToUser[socket.id] = { roomId, name };

    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }

    roomUsers[roomId].push({
      socketId: socket.id,
      name
    });

    io.to(roomId).emit("roomUsers", roomUsers[roomId]);
    socket.to(roomId).emit("user-connected", socket.id);
    socket.to(roomId).emit("notification", `${name} joined`);
  });

  socket.on("sendMessage", async (data) => {
    const moderation = analyzeMessageContent(data.message);

    const message = await Message.create({
      room: data.roomId,
      sender: data.senderId,
      content: data.message,
      moderation
    });

    if (moderation.status === "flagged") {
      await ModerationLog.create({
        message: message._id,
        room: data.roomId,
        sender: data.senderId,
        category: moderation.category,
        reason: moderation.reason,
        actionTaken: "flagged",
        status: "flagged"
      });
    }

    const populated = await message.populate([
      { path: "sender", select: "name" },
      { path: "room", select: "name" }
    ]);

    io.to(data.roomId).emit("receiveMessage", populated);
  });

  socket.on("offer", ({ offer, to }) => {
    io.to(to).emit("offer", { offer, from: socket.id });
  });

  socket.on("answer", ({ answer, to }) => {
    io.to(to).emit("answer", { answer, from: socket.id });
  });

  socket.on("ice-candidate", ({ candidate, to }) => {
    io.to(to).emit("ice-candidate", { candidate, from: socket.id });
  });

  socket.on("disconnect", () => {
    const user = socketToUser[socket.id];
    if (!user) {
      return;
    }

    const { roomId, name } = user;

    roomUsers[roomId] = (roomUsers[roomId] || []).filter(
      (participant) => participant.socketId !== socket.id
    );

    io.to(roomId).emit("roomUsers", roomUsers[roomId]);
    io.to(roomId).emit("user-disconnected", socket.id);
    io.to(roomId).emit("notification", `${name} left`);

    delete socketToUser[socket.id];
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
