const express = require("express");
const {
  getModerationDashboard,
  approveMessage,
  removeMessage
} = require("../controllers/moderationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getModerationDashboard);
router.patch("/:id/approve", protect, approveMessage);
router.patch("/:id/remove", protect, removeMessage);

module.exports = router;

