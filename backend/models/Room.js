const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ""
    },
    isPrivate: {
      type: Boolean,
      default: false
    },
    password: {
      type: String,
      default: ""
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    moderationStates: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true
        },
        flaggedCount: {
          type: Number,
          default: 0
        },
        warningIssuedAt: {
          type: Date,
          default: null
        },
        isBanned: {
          type: Boolean,
          default: false
        },
        bannedAt: {
          type: Date,
          default: null
        },
        banReason: {
          type: String,
          default: null
        },
        lastFlaggedAt: {
          type: Date,
          default: null
        }
      }
    ],
    bannedUsers: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true
        },
        bannedAt: {
          type: Date,
          default: Date.now
        },
        reason: {
          type: String,
          default: "Repeated AI moderation violations in this room"
        }
      }
    ]
  },
  { timestamps: true }
);

roomSchema.pre("save", async function (next) {
  if (!this.isPrivate) {
    this.password = "";
    return next();
  }

  if (!this.isModified("password")) {
    return next();
  }

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

roomSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) {
    return false;
  }

  if (!this.password.startsWith("$2")) {
    return enteredPassword === this.password;
  }

  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Room", roomSchema);
