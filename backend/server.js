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
const Room = require("./models/Room");
const { analyzeMessageContent } = require("../ai/moderation/moderationService");
const {
  isUserBannedFromRoom,
  applyFlagEscalation
} = require("./services/roomModerationService");

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
const moderationQueues = new Map();

function removeSocketFromRoomState(socketId, roomId) {
  roomUsers[roomId] = (roomUsers[roomId] || []).filter(
    (participant) => participant.socketId !== socketId
  );
}

function emitRoomPresence(roomId) {
  io.to(roomId).emit("roomUsers", roomUsers[roomId] || []);
}

function enqueueModerationTask(roomId, senderId, task) {
  const key = `${roomId}:${senderId}`;
  const previous = moderationQueues.get(key) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(task)
    .finally(() => {
      if (moderationQueues.get(key) === current) {
        moderationQueues.delete(key);
      }
    });

  moderationQueues.set(key, current);
  return current;
}

async function persistMessageAndModeration({ roomId, senderId, messageText }) {
  const room = await Room.findById(roomId);
  if (!room) {
    return { error: "Room not found" };
  }

  if (isUserBannedFromRoom(room, senderId)) {
    return { error: "You are banned from this room", banned: true };
  }

  const moderation = analyzeMessageContent(messageText);
  const message = await Message.create({
    room: roomId,
    sender: senderId,
    content: messageText,
    moderation
  });

  let moderationNotice = null;
  let shouldBan = false;
  let actionTaken = moderation.status;

  if (moderation.status === "flagged") {
    const escalation = applyFlagEscalation(room, senderId);
    shouldBan = escalation.shouldBan;
    actionTaken = escalation.actionTaken;

    if (escalation.nextStatus === "removed") {
      message.moderation.status = "removed";
      message.moderation.reviewedAt = new Date();
      message.moderation.reason = escalation.warning
        ? `${moderation.reason} ${escalation.warning}`
        : moderation.reason;
      await message.save();
    }

    moderationNotice = escalation.warning;
    room.members = room.members.filter((member) => member.toString() !== senderId.toString() || !shouldBan);
    await room.save();
  }

  await ModerationLog.create({
    message: message._id,
    room: roomId,
    sender: senderId,
    category: message.moderation?.category,
    reason: message.moderation?.reason,
    actionTaken,
    status: message.moderation?.status || moderation.status
  });

  const populated = await Message.findById(message._id).populate([
    { path: "sender", select: "name" },
    { path: "room", select: "name" }
  ]);

  return {
    room,
    message: populated,
    moderationNotice,
    shouldBan
  };
}

io.on("connection", (socket) => {
  socket.on("joinRoom", async ({ roomId, name, userId }) => {
    try {
      if (!roomId || !userId) {
        socket.emit("roomAccessDenied", {
          roomId,
          message: "Could not join this room."
        });
        return;
      }

      const room = await Room.findById(roomId);

      if (!room) {
        socket.emit("roomAccessDenied", {
          roomId,
          message: "This room no longer exists."
        });
        return;
      }

      if (isUserBannedFromRoom(room, userId)) {
        socket.emit("roomAccessDenied", {
          roomId,
          message: "You have been banned from this room."
        });
        return;
      }

      socket.join(roomId);
      socketToUser[socket.id] = { roomId, name, userId };

      if (!roomUsers[roomId]) {
        roomUsers[roomId] = [];
      }

      const alreadyTracked = roomUsers[roomId].some(
        (participant) => participant.socketId === socket.id
      );

      if (!alreadyTracked) {
        roomUsers[roomId].push({
          socketId: socket.id,
          userId,
          name
        });
      }

      emitRoomPresence(roomId);
      socket.to(roomId).emit("user-connected", socket.id);
      socket.to(roomId).emit("notification", `${name} joined`);
    } catch (error) {
      console.error("Socket joinRoom error:", error);
      socket.emit("roomAccessDenied", {
        roomId,
        message: "Could not join this room right now."
      });
    }
  });

  socket.on("sendMessage", async (data) => {
    const roomMeta = socketToUser[socket.id];
    const senderId = roomMeta?.userId || data.senderId;
    const senderName = roomMeta?.name || "User";

    if (!data?.roomId || !senderId || !data?.message?.trim()) {
      return;
    }

    try {
      await enqueueModerationTask(data.roomId, senderId, async () => {
        const result = await persistMessageAndModeration({
          roomId: data.roomId,
          senderId,
          messageText: data.message.trim()
        });

        if (result.error) {
          socket.emit("roomAccessDenied", {
            roomId: data.roomId,
            message: result.error
          });
          return;
        }

        io.to(data.roomId).emit("receiveMessage", result.message);

        if (result.moderationNotice) {
          socket.emit("moderationWarning", {
            roomId: data.roomId,
            message: result.moderationNotice,
            strikeCount: result.room.moderationStates.find(
              (item) => item.user.toString() === senderId.toString()
            )?.flaggedCount || 0,
            banned: result.shouldBan
          });
        }

        if (result.message.moderation?.status === "removed") {
          io.to(data.roomId).emit("notification", `AI Guardian automatically removed a message from ${senderName}.`);
        }

        if (result.shouldBan) {
          removeSocketFromRoomState(socket.id, data.roomId);
          emitRoomPresence(data.roomId);
          io.to(data.roomId).emit("user-disconnected", socket.id);
          io.to(data.roomId).emit("notification", `${senderName} was removed by AI Guardian.`);

          socket.emit("roomBanStatus", {
            roomId: data.roomId,
            message: "You were kicked out and banned from this room after repeated violations."
          });

          socket.leave(data.roomId);
          delete socketToUser[socket.id];
        }
      });
    } catch (error) {
      console.error("Socket sendMessage error:", error);
    }
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

    removeSocketFromRoomState(socket.id, roomId);
    emitRoomPresence(roomId);
    io.to(roomId).emit("user-disconnected", socket.id);
    io.to(roomId).emit("notification", `${name} left`);

    delete socketToUser[socket.id];
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
