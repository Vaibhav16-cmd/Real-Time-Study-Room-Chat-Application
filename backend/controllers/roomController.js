const Room = require("../models/Room");
const { isUserBannedFromRoom } = require("../services/roomModerationService");

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

exports.createRoom = async (req, res) => {
  try {
    const name = normalizeString(req.body.name);
    const description = normalizeString(req.body.description);
    const isPrivate = Boolean(req.body.isPrivate);
    const password = normalizeString(req.body.password);

    if (!name) {
      return res.status(400).json({ message: "Room name required" });
    }

    if (isPrivate && password.length < 4) {
      return res.status(400).json({ message: "Password must be at least 4 characters" });
    }

    const existingRoom = await Room.findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });

    if (existingRoom) {
      return res.status(409).json({ message: "A room with this name already exists" });
    }

    const room = await Room.create({
      name,
      description,
      isPrivate,
      password: isPrivate ? password : "",
      createdBy: req.user._id,
      members: [req.user._id]
    });

    res.status(201).json(room);
  } catch (error) {
    console.error("Create Room Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find()
      .populate("members", "name email")
      .sort({ createdAt: -1 });

    res.json(rooms);
  } catch (error) {
    console.error("Get Rooms Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.joinRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (isUserBannedFromRoom(room, req.user._id)) {
      return res.status(403).json({ message: "You are banned from this room" });
    }

    if (!room.members.some((member) => member.toString() === req.user._id.toString())) {
      room.members.push(req.user._id);
      await room.save();
    }

    res.json(room);
  } catch (error) {
    console.error("Join Room Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate("members", "name email");

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (isUserBannedFromRoom(room, req.user._id)) {
      return res.status(403).json({ message: "You are banned from this room" });
    }

    res.json(room);
  } catch (error) {
    console.error("Get Room Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.leaveRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    room.members = room.members.filter(
      (member) => member.toString() !== req.user._id.toString()
    );

    await room.save();

    res.json({ message: "Left room successfully" });
  } catch (error) {
    console.error("Leave Room Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.joinPrivateRoom = async (req, res) => {
  try {
    const roomId = normalizeString(req.body.roomId);
    const password = normalizeString(req.body.password);

    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (isUserBannedFromRoom(room, req.user._id)) {
      return res.status(403).json({ message: "You are banned from this room" });
    }

    if (!room.isPrivate) {
      return res.json({ ok: true });
    }

    if (!(await room.matchPassword(password))) {
      return res.status(401).json({ message: "Wrong password" });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Join Private Room Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
