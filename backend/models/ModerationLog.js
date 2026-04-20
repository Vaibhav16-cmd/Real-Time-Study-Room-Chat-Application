const mongoose = require("mongoose");

const moderationLogSchema = new mongoose.Schema(
  {
    message: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    category: String,
    reason: String,
    actionTaken: String,
    status: {
      type: String,
      enum: ["approved", "flagged", "removed"],
      default: "flagged"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ModerationLog", moderationLogSchema);

