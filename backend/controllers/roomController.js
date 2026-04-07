const Room = require("../models/Room");

// ================= CREATE ROOM =================
exports.createRoom = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Room name required" });
    }

    // 🔥 Check if room already exists
    const existingRoom = await Room.findOne({ name });

    // ✅ AUTO JOIN if exists (IMPORTANT)
    if (existingRoom) {
      // add user if not already a member
      if (!existingRoom.members.includes(req.user._id)) {
        existingRoom.members.push(req.user._id);
        await existingRoom.save();
      }

      return res.status(200).json(existingRoom);
    }

    // ✅ Create new room
    const room = await Room.create({
      name,
      createdBy: req.user._id,
      members: [req.user._id],
    });

    res.status(201).json(room);

  } catch (error) {
    console.error("Create Room Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= GET ALL ROOMS =================
exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find().populate("members", "name email");
    res.json(rooms);
  } catch (error) {
    console.error("Get Rooms Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= JOIN ROOM =================
exports.joinRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    // add only if not already member
    if (!room.members.some(m => m.toString() === req.user._id.toString())) {
      room.members.push(req.user._id);
      await room.save();
    }

    res.json(room);

  } catch (error) {
    console.error("Join Room Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= GET ROOM BY ID =================
exports.getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate("members", "name email");

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    res.json(room);

  } catch (error) {
    console.error("Get Room Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= LEAVE ROOM =================
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