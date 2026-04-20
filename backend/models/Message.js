const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    content: {
      type: String,
      required: true
    },
    moderation: {
      status: {
        type: String,
        enum: ["approved", "flagged", "removed"],
        default: "approved"
      },
      category: {
        type: String,
        default: null
      },
      reason: {
        type: String,
        default: null
      },
      score: {
        type: Number,
        default: 0
      },
      reviewedAt: {
        type: Date,
        default: null
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);

