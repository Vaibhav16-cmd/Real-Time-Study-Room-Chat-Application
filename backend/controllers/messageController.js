const Message = require("../models/Message");

// SAVE MESSAGE
exports.saveMessage = async (roomId, sender, content) => {

  const message = await Message.create({
    room: roomId,
    sender: sender,
    content: content
  });

  return message;
};

// GET ROOM MESSAGES (CHAT HISTORY)
exports.getRoomMessages = async (req, res) => {
  try {

    const messages = await Message.find({
      room: req.params.roomId
    }).populate("sender", "name");

    res.json(messages);

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};