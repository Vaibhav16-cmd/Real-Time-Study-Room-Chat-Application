const Message = require("../models/Message");
const ModerationLog = require("../models/ModerationLog");

exports.getModerationDashboard = async (req, res) => {
  try {
    const [messages, flaggedMessages] = await Promise.all([
      Message.find()
        .populate("sender", "name")
        .populate("room", "name")
        .sort({ createdAt: -1 }),
      Message.find({ "moderation.status": "flagged" })
        .populate("sender", "name")
        .populate("room", "name")
        .sort({ createdAt: -1 })
    ]);

    const summary = {
      total: messages.length,
      approved: 0,
      flagged: 0,
      removed: 0,
      categories: {}
    };

    messages.forEach((message) => {
      const status = message.moderation?.status || "approved";
      summary[status] += 1;
    });

    flaggedMessages.forEach((message) => {
      const category = message.moderation?.category;
      if (category) {
        summary.categories[category] = (summary.categories[category] || 0) + 1;
      }
    });

    res.json({ summary, flaggedMessages });
  } catch (error) {
    console.error("Get Moderation Dashboard Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

async function updateMessageStatus(req, res, nextStatus, actionTaken) {
  const message = await Message.findById(req.params.id)
    .populate("sender", "name")
    .populate("room", "name");

  if (!message) {
    return res.status(404).json({ message: "Message not found" });
  }

  if (!message.moderation) {
    message.moderation = {
      status: "approved",
      category: null,
      reason: null,
      score: 0,
      reviewedAt: null
    };
  }

  message.moderation.status = nextStatus;
  message.moderation.reviewedAt = new Date();
  await message.save();

  await ModerationLog.create({
    message: message._id,
    room: message.room?._id,
    sender: message.sender?._id,
    category: message.moderation?.category,
    reason: message.moderation?.reason,
    actionTaken,
    status: nextStatus
  });

  res.json(message);
}

exports.approveMessage = async (req, res) => {
  try {
    await updateMessageStatus(req, res, "approved", "approved");
  } catch (error) {
    console.error("Approve Message Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.removeMessage = async (req, res) => {
  try {
    await updateMessageStatus(req, res, "removed", "removed");
  } catch (error) {
    console.error("Remove Message Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
