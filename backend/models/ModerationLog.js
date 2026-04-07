const mongoose = require("mongoose");

const moderationLogSchema = new mongoose.Schema(
  {
    message: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    reason: String,
    actionTaken: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ModerationLog", moderationLogSchema);
