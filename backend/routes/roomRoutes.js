const express = require("express");
const {
  createRoom,
  getRooms,
  joinRoom,
  getRoomById,
  leaveRoom
} = require("../controllers/roomController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createRoom);
router.get("/", protect, getRooms);
router.post("/:id/join", protect, joinRoom);

router.get("/:id", protect, getRoomById);
router.post("/:id/leave", protect, leaveRoom);

module.exports = router;