require("dotenv").config();

const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const authRoutes = require("./routes/authRoutes");
const roomRoutes = require("./routes/roomRoutes");
const messageRoutes = require("./routes/messageRoutes");

const Message = require("./models/Message");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/messages", messageRoutes);

app.get("/", (req, res) => {
  res.send("API running...");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

let users = {};

io.on("connection", (socket) => {

  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", socket.id);
    users[socket.id] = roomId;
  });

  socket.on("sendMessage", async (data) => {

    const message = await Message.create({
      room: data.roomId,
      sender: data.senderId,
      content: data.message
    });

    const populated = await message.populate("sender", "name");

    io.to(data.roomId).emit("receiveMessage", populated);
  });

  socket.on("offer", ({offer, to})=>{
    io.to(to).emit("offer", {offer, from: socket.id});
  });

  socket.on("answer", ({answer, to})=>{
    io.to(to).emit("answer", {answer, from: socket.id});
  });

  socket.on("ice-candidate", ({candidate, to})=>{
    io.to(to).emit("ice-candidate", {candidate, from: socket.id});
  });

});

const PORT = process.env.PORT || 5000;

server.listen(PORT, ()=>{
  console.log(`Server running on port ${PORT}`);
});