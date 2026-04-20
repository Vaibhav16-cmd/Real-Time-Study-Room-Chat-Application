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
