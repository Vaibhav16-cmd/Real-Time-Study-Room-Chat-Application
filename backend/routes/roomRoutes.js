const express = require("express");
const {
  createRoom,
  getRooms,
  joinRoom,
  getRoomById,
  leaveRoom,
  joinPrivateRoom
} = require("../controllers/roomController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getRooms);
router.post("/", protect, createRoom);
router.post("/join-private", protect, joinPrivateRoom);
router.get("/:id", protect, getRoomById);
router.post("/:id/join", protect, joinRoom);
router.post("/:id/leave", protect, leaveRoom);

module.exports = router;

